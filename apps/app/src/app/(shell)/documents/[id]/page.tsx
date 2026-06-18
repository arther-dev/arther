import Link from 'next/link';
import { BlockRenderer } from '@arther/block-renderer';
import {
  getActiveWorkspace,
  getDocumentConsumption,
  listApprovalRecords,
  listApprovalRoles,
  listCommentThreads,
  listDocumentMagicLinks,
  listMembers,
  listSnapshotsForDocument,
  listStaleBriefReferencesForDocument,
  listStaleReferencesForDocument,
  loadDocumentTree,
  resolveSpecFields,
} from '@arther/db';
import {
  blockAnchorLabel,
  canManageDocumentLifecycle,
  parseDocumentAccess,
  parseDocumentAllowlist,
  summarizeBriefStaleness,
  summarizeReview,
  summarizeStaleness,
  type DocumentId,
} from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { AccessControl } from './AccessControl';
import { CommentsPanel } from './CommentsPanel';
import { DocumentAnalytics } from './DocumentAnalytics';
import { DocumentLifecycle } from './DocumentLifecycle';
import { ApprovalPanel, type PanelRole } from './ApprovalPanel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * G4.4 — read-only document view: load the working revision's block tree (G3)
 * and render it through the one shared `block-renderer`. The three-panel editor
 * (G4.1) builds on this; for now generated Drafts are viewable end-to-end.
 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Document preview"
          description="Generated documents render here once the workspace is provisioned (PROVISIONING.md)."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) {
    return (
      <AppShell>
        <EmptyState
          title="Create your workspace first"
          description="Documents live inside a workspace."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  // F8.5: a malformed id degrades to "not found", never a 500.
  const tree = UUID_RE.test(id) ? await loadDocumentTree(supabase, id as DocumentId) : null;
  if (!tree) {
    return (
      <AppShell>
        <EmptyState
          title="Document not found"
          description="It may have been deleted, or you don’t have access to it."
          secondaryAction={
            <Link className="ui-btn ui-btn--ghost" href="/specs">
              Back to Specs
            </Link>
          }
        />
      </AppShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // C0 — the document owner (or a workspace admin) drives the lifecycle.
  const canManage =
    user != null &&
    canManageDocumentLifecycle({
      documentOwnerId: tree.document.owner_id,
      userId: user.id,
      role: workspace.role,
    });
  const state = tree.revision.state;
  const isDraft = state === 'draft';

  // C1 — reviewer status (in Review) and the rejection banner (back in Draft).
  let panelRoles: PanelRole[] = [];
  let reviewCounts = { approvedCount: 0, requiredCount: 0 };
  let rejection: { reason: string; by: string } | null = null;
  let isApprover = false;
  if (state === 'review' || state === 'draft') {
    const [roles, records, members] = await Promise.all([
      listApprovalRoles(supabase, tree.document.document_type_id),
      listApprovalRecords(supabase, tree.revision.id),
      listMembers(supabase, workspace.id),
    ]);
    const memberName = new Map(members.map((m) => [m.id, m.name ?? m.email]));
    const userName = new Map(members.map((m) => [m.user_id, m.name ?? m.email]));
    const summary = summarizeReview({
      roles: roles.map((r) => ({ id: r.id, label: r.role_label, required: r.required })),
      records: records.map((r) => ({
        roleId: r.role_id ?? '',
        action: r.action,
        reviewCycle: r.review_cycle,
      })),
      cycle: tree.revision.review_cycle,
    });
    reviewCounts = { approvedCount: summary.approvedCount, requiredCount: summary.requiredCount };
    // C1.4 — an assigned approver may make minor corrections during Review.
    isApprover = roles.some((r) =>
      r.assignments.some((a) => a.workspace_member_id === workspace.membershipId),
    );
    panelRoles = summary.roles.map((sr) => {
      const role = roles.find((r) => r.id === sr.roleId);
      const assignments = role?.assignments ?? [];
      return {
        roleId: sr.roleId,
        label: sr.label,
        required: sr.required,
        status: sr.status,
        assignees: assignments.map((a) => memberName.get(a.workspace_member_id) ?? 'Unknown'),
        canActAs:
          sr.status === 'pending' &&
          assignments.some((a) => a.workspace_member_id === workspace.membershipId),
      };
    });
    // Show the rejection banner only when the latest decision sent it back.
    if (state === 'draft' && records[0]?.action === 'rejected') {
      rejection = {
        reason: records[0].reason ?? '',
        by: records[0].approver_id ? (userName.get(records[0].approver_id) ?? 'a reviewer') : 'a reviewer',
      };
    }
  }

  // C4 — the live published snapshot for the version indicator; C4.6 — portal
  // visibility (live vs. unpublished/archived), decoupled from the state machine.
  const snapshots =
    state === 'published' ? await listSnapshotsForDocument(supabase, tree.document.id) : [];
  const snapshot = snapshots.find((s) => !s.archived_at) ?? null;
  const latestSnapshot = snapshots[0] ?? null;
  const portalVisibility: 'live' | 'unpublished' | null =
    state !== 'published'
      ? null
      : snapshot
        ? 'live'
        : latestSnapshot
          ? 'unpublished'
          : null;
  // C7.1/C7.3 — the live publication's portal access tier + allowlist, and the
  // issued magic links (for the owner's revocation UI, C7.4).
  const accessMode = snapshot ? parseDocumentAccess(snapshot.access_config) : 'public';
  const accessAllowlist = parseDocumentAllowlist(snapshot?.access_config);
  // A.5 — portal consumption for a published document (views/visitors/downloads),
  // a SQL aggregate over the C9.6 events; RLS scopes it to this workspace.
  const consumption =
    state === 'published' ? await getDocumentConsumption(supabase, tree.document.id) : null;
  const magicLinks =
    canManage && portalVisibility === 'live'
      ? await listDocumentMagicLinks(supabase, tree.document.id)
      : [];

  // C2 — block-anchored comment threads for the current revision (all members).
  const commentThreads = user ? await listCommentThreads(supabase, tree.revision.id) : [];
  const blockOptions = tree.blocks.map((b) => ({
    id: b.id,
    label: blockAnchorLabel(b.display_order, b.content.type),
    prose: b.content.type === 'paragraph' || b.content.type === 'heading',
  }));
  // C2.5 — workspace members for the @mention picker (resolve to members only).
  const mentionMembers = user
    ? (await listMembers(supabase, workspace.id)).map((m) => ({
        userId: m.user_id,
        name: m.name ?? m.email,
      }))
    : [];

  const stale = summarizeStaleness(await listStaleReferencesForDocument(supabase, tree.document.id));
  const briefStale = summarizeBriefStaleness(
    await listStaleBriefReferencesForDocument(supabase, tree.document.id),
  );

  // G4 live data blocks — resolve current field values for spec_table + chart.
  const resolved = tree.blocks.some(
    (b) => b.content.type === 'spec_table' || b.content.type === 'chart',
  )
    ? await resolveSpecFields(supabase, tree.document.product_id, workspace.id)
    : undefined;

  return (
    <AppShell>
      <article className="br-document specs-content">
        <header className="specs-form--row">
          <h1 className="specs-title">{tree.document.title}</h1>
          <span className={`import-status import-status--${tree.revision.state}`}>
            {tree.revision.state}
          </span>
          <span style={{ flex: 1 }} />
          {isDraft ? (
            <Link className="ui-btn ui-btn--primary" href={`/documents/${tree.document.id}/edit`}>
              Edit
            </Link>
          ) : state === 'review' && isApprover ? (
            <Link className="ui-btn ui-btn--ghost" href={`/documents/${tree.document.id}/edit`}>
              Make corrections
            </Link>
          ) : (
            <span className="specs-grid__meta" title="Editing is locked outside Draft.">
              Locked while in {tree.revision.state}
            </span>
          )}
        </header>
        {snapshot ? (
          <p className="specs-grid__meta" role="status">
            Published <strong>v{snapshot.version}</strong> ·{' '}
            {snapshot.pdf_ready ? 'PDF ready' : 'PDF pending (C5)'}
          </p>
        ) : portalVisibility === 'unpublished' ? (
          <p className="specs-grid__meta" role="status">
            Unpublished from the portal
            {latestSnapshot ? (
              <>
                {' '}
                (was <strong>v{latestSnapshot.version}</strong>)
              </>
            ) : null}{' '}
            — restore it to make it public again.
          </p>
        ) : null}
        {rejection ? (
          <p className="ui-field__error" role="status">
            Returned to Draft by <strong>{rejection.by}</strong>
            {rejection.reason ? `: “${rejection.reason}”` : '.'}
          </p>
        ) : null}
        {canManage ? (
          <DocumentLifecycle
            documentId={tree.document.id}
            state={tree.revision.state}
            portalVisibility={portalVisibility}
          />
        ) : null}
        {canManage && portalVisibility === 'live' ? (
          <AccessControl
            documentId={tree.document.id}
            access={accessMode}
            allowlist={accessAllowlist}
            links={magicLinks}
          />
        ) : null}
        {consumption ? (
          <DocumentAnalytics consumption={consumption} gated={accessMode !== 'public'} />
        ) : null}
        {state === 'review' ? (
          panelRoles.length > 0 ? (
            <ApprovalPanel
              documentId={tree.document.id}
              revisionId={tree.revision.id}
              roles={panelRoles}
              approvedCount={reviewCounts.approvedCount}
              requiredCount={reviewCounts.requiredCount}
              canOverride={canManage}
            />
          ) : (
            <p className="specs-grid__meta">
              This document type has no approval roles, so it can’t be approved automatically. The
              owner can pull it back to Draft.
            </p>
          )
        ) : null}
        {stale.fieldCount > 0 ? (
          <p className="ui-field__error" role="status">
            {stale.fieldCount} spec value{stale.fieldCount === 1 ? '' : 's'} changed since this draft
            was generated ({stale.fields.join(', ')}) — review in the editor.
          </p>
        ) : null}
        {briefStale.keyCount > 0 ? (
          <p className="specs-grid__meta" role="status">
            {briefStale.keyCount} brief fragment{briefStale.keyCount === 1 ? '' : 's'} updated since
            this draft was generated ({briefStale.keys.join(', ')}) — the prose may want a refresh.
          </p>
        ) : null}
        {tree.blocks.length > 0 ? (
          <BlockRenderer blocks={tree.blocks.map((b) => b.content)} resolved={resolved} />
        ) : (
          <p className="specs-grid__meta">This document has no content yet.</p>
        )}
        {user ? (
          <CommentsPanel
            documentId={tree.document.id}
            threads={commentThreads}
            blocks={blockOptions}
            members={mentionMembers}
            currentUserId={user.id}
            canResolveAny={canManage}
          />
        ) : null}
        <p className="specs-grid__meta">
          <Link href="/specs">← Back to Specs</Link>
        </p>
      </article>
    </AppShell>
  );
}
