import Link from 'next/link';
import { BlockRenderer } from '@arther/block-renderer';
import {
  getActiveWorkspace,
  listApprovalRecords,
  listApprovalRoles,
  listMembers,
  listStaleBriefReferencesForDocument,
  listStaleReferencesForDocument,
  loadDocumentTree,
  resolveSpecFields,
} from '@arther/db';
import {
  canManageDocumentLifecycle,
  summarizeBriefStaleness,
  summarizeReview,
  summarizeStaleness,
  type DocumentId,
} from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
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
          ) : (
            <span className="specs-grid__meta" title="Editing is locked outside Draft.">
              Locked while in {tree.revision.state}
            </span>
          )}
        </header>
        {rejection ? (
          <p className="ui-field__error" role="status">
            Returned to Draft by <strong>{rejection.by}</strong>
            {rejection.reason ? `: “${rejection.reason}”` : '.'}
          </p>
        ) : null}
        {canManage ? (
          <DocumentLifecycle documentId={tree.document.id} state={tree.revision.state} />
        ) : null}
        {state === 'review' ? (
          panelRoles.length > 0 ? (
            <ApprovalPanel
              documentId={tree.document.id}
              revisionId={tree.revision.id}
              roles={panelRoles}
              approvedCount={reviewCounts.approvedCount}
              requiredCount={reviewCounts.requiredCount}
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
        <p className="specs-grid__meta">
          <Link href="/specs">← Back to Specs</Link>
        </p>
      </article>
    </AppShell>
  );
}
