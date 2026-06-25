import Link from 'next/link';
import { BlockRenderer } from '@arther/block-renderer';
import {
  getActiveWorkspace,
  getDocumentConsumption,
  listApprovalRecords,
  listApprovalRoles,
  loadBlockVariantScopes,
  loadDocumentVariantStaleness,
  listCommentThreads,
  listDocumentMagicLinks,
  listDocumentSnippetEmbeds,
  listMembers,
  listSnapshotsForDocument,
  listStaleBriefReferencesForDocument,
  listStaleReferencesForDocument,
  listVariants,
  loadDocumentTree,
  resolveSpecFields,
  resolveSpecFieldsForVariant,
} from '@arther/db';
import {
  applyTokenReplacements,
  blockAnchorLabel,
  canManageDocumentLifecycle,
  isBlockVisibleForVariant,
  parseDocumentAccess,
  parseDocumentAllowlist,
  summarizeBriefStaleness,
  summarizeReview,
  summarizeStaleness,
  variantIdSchema,
  type DocumentId,
} from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { AccessControl } from './AccessControl';
import { CommentsPanel } from './CommentsPanel';
import { DocumentAnalytics } from './DocumentAnalytics';
import { DocumentLifecycle } from './DocumentLifecycle';
import { DuplicateDocumentButton } from './DuplicateDocumentButton';
import { SnippetEmbedsPanel } from './SnippetEmbedsPanel';
import { ApprovalPanel, type PanelRole } from './ApprovalPanel';
import { VariantPublishPanel } from './VariantPublishPanel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * G4.4 — read-only document view: load the working revision's block tree (G3)
 * and render it through the one shared `block-renderer`. The three-panel editor
 * (G4.1) builds on this; for now generated Drafts are viewable end-to-end.
 */
export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant: variantParam } = await searchParams;
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
  // V.9 — base portal visibility is the no-variant publication line; a variant's
  // snapshot must never stand in for the base.
  const baseSnapshots = snapshots.filter((s) => s.variant_id == null);
  const snapshot = baseSnapshots.find((s) => !s.archived_at) ?? null;
  const latestSnapshot = baseSnapshots[0] ?? null;
  // V.9 — variants with a live (non-archived) portal snapshot, for the publish panel.
  const publishedVariantIds = new Set(
    snapshots.filter((s) => s.variant_id != null && !s.archived_at).map((s) => s.variant_id as string),
  );
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
  // V.7 — which variants are stale (a base change skips variants that pin the field
  // or dropped its component). Drives the "Stale in: …" detail + preview suppression.
  const variantStaleness =
    stale.fieldCount > 0
      ? await loadDocumentVariantStaleness(supabase, tree.document.id, tree.document.product_id)
      : null;

  // R.3 — snippet embeds in this document, for the owner's override panel. Only
  // the document owner (or a workspace admin) can override embeds, so skip the
  // query for everyone else and for documents with no embeds.
  const snippetEmbeds =
    canManage && tree.blocks.some((b) => b.content.type === 'snippet')
      ? await listDocumentSnippetEmbeds(supabase, tree.document.id)
      : [];

  // R.7 — a variant shares the base product's document; "preview as variant"
  // resolves every spec token (including those inside embedded snippets) against
  // the variant's resolved spec (§3.6). The product's variants drive the picker.
  const variants = await listVariants(supabase, tree.document.product_id);
  const selectedVariantId =
    variantParam && variantIdSchema.safeParse(variantParam).success
      ? variants.find((v) => v.id === variantParam)?.id
      : undefined;
  const variantPreview = selectedVariantId
    ? await resolveSpecFieldsForVariant(supabase, selectedVariantId, workspace.id)
    : null;

  // G4 live data blocks — current field values for spec_table + chart (variant-
  // aware when previewing). Inline tokens carry a baked display value, so under a
  // variant preview they are rewritten to the variant's value.
  const hasLiveBlocks = tree.blocks.some(
    (b) => b.content.type === 'spec_table' || b.content.type === 'chart',
  );
  const resolved = variantPreview
    ? variantPreview.resolution
    : hasLiveBlocks
      ? await resolveSpecFields(supabase, tree.document.product_id, workspace.id)
      : undefined;
  // R.7 (resolution) + V.4 (visibility): under a variant preview, hide blocks whose
  // variant scope excludes this variant (a DERIVED block whose gating component was
  // removed, or a MANUAL block not listed for it) and rewrite the rest's tokens.
  let renderBlocks = tree.blocks.map((b) => b.content);
  let hiddenForVariant = 0;
  if (variantPreview) {
    const scopes = await loadBlockVariantScopes(
      supabase,
      tree.blocks.map((b) => b.id),
    );
    const componentIds = new Set(variantPreview.componentIds);
    const visible = tree.blocks.filter((b) =>
      isBlockVisibleForVariant(scopes.get(b.id), {
        variantId: variantPreview.variant.id,
        componentIds,
      }),
    );
    hiddenForVariant = tree.blocks.length - visible.length;
    renderBlocks = visible.map((b) => applyTokenReplacements(b.content, variantPreview.replacements));
  }

  return (
    <AppShell>
      <article className="br-document specs-content">
        <header className="specs-form--row">
          <h1 className="specs-title">{tree.document.title}</h1>
          <span className={`import-status import-status--${tree.revision.state}`}>
            {tree.revision.state}
          </span>
          <span style={{ flex: 1 }} />
          {workspace.role !== 'viewer' ? (
            <DuplicateDocumentButton
              documentId={tree.document.id}
              sourceProductId={tree.document.product_id}
            />
          ) : null}
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
        {variants.length > 0 ? (
          <nav className="specs-tabs" aria-label="Preview as variant">
            <Link
              className={`specs-tabs__tab${!variantPreview ? ' specs-tabs__tab--active' : ''}`}
              href={`/documents/${tree.document.id}`}
            >
              Base product
            </Link>
            {variants.map((v) => (
              <Link
                key={v.id}
                className={`specs-tabs__tab${variantPreview?.variant.id === v.id ? ' specs-tabs__tab--active' : ''}`}
                href={`/documents/${tree.document.id}?variant=${v.id}`}
              >
                {v.name}
              </Link>
            ))}
          </nav>
        ) : null}
        {variantPreview ? (
          <p className="specs-grid__meta" role="status">
            Previewing as <strong>{variantPreview.variant.name}</strong> — spec tokens show this
            variant’s resolved values
            {hiddenForVariant > 0
              ? `, and ${hiddenForVariant} block${hiddenForVariant === 1 ? '' : 's'} scoped out of it ${
                  hiddenForVariant === 1 ? 'is' : 'are'
                } hidden`
              : ''}
            . This is a preview; the document itself is unchanged.
            {variantPreview.warnings.length > 0
              ? ` (${variantPreview.warnings.length} resolution warning${
                  variantPreview.warnings.length === 1 ? '' : 's'
                })`
              : ''}
          </p>
        ) : null}
        {variants.length > 0 ? (
          <p className="specs-grid__meta" style={{ display: 'flex', gap: 12 }}>
            {workspace.role !== 'viewer' ? (
              <Link href={`/documents/${tree.document.id}/variant-scope`}>Manage variant scope →</Link>
            ) : null}
            {variants.length >= 2 ? (
              <Link href={`/documents/${tree.document.id}/compare`}>Compare variants →</Link>
            ) : null}
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
        {canManage && portalVisibility === 'live' && variants.length > 0 ? (
          <VariantPublishPanel
            documentId={tree.document.id}
            workspaceSlug={workspace.slug}
            productId={tree.document.product_id}
            documentSlug={tree.document.slug}
            portalBase={process.env.PORTAL_BASE_URL ?? null}
            variants={variants.map((v) => ({
              id: v.id,
              name: v.name,
              slug: v.slug,
              isDefault: v.isDefault,
              published: publishedVariantIds.has(v.id),
            }))}
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
        {stale.fieldCount > 0 &&
        (!variantPreview || variantStaleness?.affectedVariantIds.has(variantPreview.variant.id)) ? (
          <p className="ui-field__error" role="status">
            {stale.fieldCount} spec value{stale.fieldCount === 1 ? '' : 's'} changed since this draft
            was generated ({stale.fields.join(', ')}) — review in the editor.
            {!variantPreview && variantStaleness && variantStaleness.affectedVariants.length > 0
              ? ` Stale in: Base, ${variantStaleness.affectedVariants.map((v) => v.name).join(', ')}.`
              : ''}
          </p>
        ) : null}
        {briefStale.keyCount > 0 ? (
          <p className="specs-grid__meta" role="status">
            {briefStale.keyCount} brief fragment{briefStale.keyCount === 1 ? '' : 's'} updated since
            this draft was generated ({briefStale.keys.join(', ')}) — the prose may want a refresh.
          </p>
        ) : null}
        {renderBlocks.length > 0 ? (
          <BlockRenderer blocks={renderBlocks} resolved={resolved} />
        ) : (
          <p className="specs-grid__meta">This document has no content yet.</p>
        )}
        {canManage ? (
          <SnippetEmbedsPanel documentId={tree.document.id} embeds={snippetEmbeds} />
        ) : null}
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
