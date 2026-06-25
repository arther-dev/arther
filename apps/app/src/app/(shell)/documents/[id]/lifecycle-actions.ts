'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo, type Action } from '@arther/authz';
import {
  archiveDocumentSnapshots,
  archiveVariantSnapshots,
  countOpenBlockingMergeConflicts,
  createDocumentRevision,
  createServiceClient,
  DbRuleError,
  dispatchNotification,
  duplicateDocument,
  expandSnippetsForPublish,
  getActiveWorkspace,
  getDocument,
  getRevision,
  getVariant,
  issueMagicLink,
  listApprovalRoles,
  listProducts,
  listRevisionCommenterIds,
  loadBlockVariantScopes,
  membershipUserIds,
  listSnapshotsForDocument,
  loadDocumentTree,
  membershipLookupFor,
  publishDocument,
  recordAnalyticsEvent,
  resolveSpecFields,
  resolveSpecFieldsForVariant,
  restoreLatestSnapshot,
  revokeMagicLink,
  setDocumentAccess,
  transitionDocumentRevision,
} from '@arther/db';
import { generateMagicToken, hashMagicToken } from '@arther/config/magic-link';
import { rateLimit } from '@arther/rate-limit';
import {
  applyTokenReplacements,
  blockPlainText,
  canManageDocumentLifecycle,
  computePublishPreflight,
  DOCUMENT_ACCESS_MODES,
  isBlockVisibleForVariant,
  isEmailAllowed,
  normalizeDomains,
  normalizeEmails,
  parseDocumentAccess,
  parseDocumentAllowlist,
  resolveTransition,
  submitForReviewSchema,
  type DocumentAccessMode,
  type DocumentAllowlist,
  type DocumentId,
  type DocumentRevisionId,
  type ProductId,
  type UserId,
  type VariantId,
  type WorkspaceId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LifecycleResult {
  ok: boolean;
  error?: string;
  /** The document's new lifecycle state on success. */
  state?: string;
}

/** The owner-driven actions this slice wires, each mapped to its canDo gate. */
type OwnerAction =
  | 'submit_for_review'
  | 'pull_back_to_draft'
  | 'pull_back_to_review'
  | 'publish'
  | 'create_revision';

const ACTION_AUTHZ: Record<OwnerAction, Action> = {
  submit_for_review: 'doc.submit',
  pull_back_to_draft: 'doc.submit',
  pull_back_to_review: 'doc.submit',
  publish: 'doc.publish',
  create_revision: 'doc.revise',
};

/**
 * Authorize a lifecycle action: signed in + a workspace + the canDo seat gate +
 * document ownership (the document owner or a workspace admin — spec §4.3). The
 * guarded conditional UPDATE and RLS sit behind this as defence in depth.
 */
async function authorize(documentId: string, action: OwnerAction) {
  if (!UUID_RE.test(documentId)) return { error: 'Invalid document.' as const };
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet.' as const };

  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, ACTION_AUTHZ[action], { workspaceId: workspace.id }))) {
    return { error: 'Viewers can’t change a document’s status.' as const };
  }

  const document = await getDocument(supabase, documentId as DocumentId);
  if (!document || !document.current_revision_id) return { error: 'Document not found.' as const };
  if (
    !canManageDocumentLifecycle({
      documentOwnerId: document.owner_id,
      userId: user.id,
      role: workspace.role,
    })
  ) {
    return { error: 'Only the document owner or a workspace admin can change its status.' as const };
  }

  return {
    supabase,
    userId: user.id as UserId,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    document,
  };
}

function revalidateDocument(documentId: string) {
  revalidatePath(`/documents/${documentId}`);
  revalidatePath(`/documents/${documentId}/edit`);
}

/**
 * C6.5 — bust the affected workspace's portal cache on publish (the portal is a
 * separate deployment, so this is a cross-deployment webhook). The portal tags
 * its snapshot reads `portal:{slug}`, so one tag busts every cached page for the
 * workspace. Best-effort + env-gated: without `PORTAL_REVALIDATE_URL`/`_SECRET`
 * the portal's ISR interval is the only refresh path. Never fails the publish.
 */
async function revalidatePortal(tags: string[]): Promise<void> {
  const url = process.env.PORTAL_REVALIDATE_URL;
  const secret = process.env.PORTAL_REVALIDATE_SECRET;
  if (!url || !secret || tags.length === 0) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ tags }),
    });
  } catch (e) {
    console.error('[portal revalidate] failed', e);
  }
}

async function runOwnerTransition(
  documentId: string,
  action: Exclude<OwnerAction, 'create_revision'>,
  meta?: { reviewBrief?: string; reviewDueDate?: string },
): Promise<LifecycleResult> {
  const auth = await authorize(documentId, action);
  if ('error' in auth) return { ok: false, error: auth.error };

  const revision = await getRevision(
    auth.supabase,
    auth.document.current_revision_id as DocumentRevisionId,
  );
  if (!revision) return { ok: false, error: 'Document not found.' };
  const transition = resolveTransition(action, revision.state);
  if (!transition) {
    return { ok: false, error: `Can’t do that from “${revision.state}”.` };
  }

  // C1 (spec §4.2) — a document can't enter Review while a required approval
  // role is vacant: there would be no one able to approve it.
  let approverMembershipIds: string[] = [];
  if (action === 'submit_for_review') {
    const roles = await listApprovalRoles(auth.supabase, auth.document.document_type_id);
    const vacant = roles.filter((r) => r.required && r.assignments.length === 0);
    if (vacant.length > 0) {
      return {
        ok: false,
        error: `Assign an approver to ${vacant
          .map((r) => r.role_label)
          .join(', ')} before sending for review.`,
      };
    }
    approverMembershipIds = roles.flatMap((r) => r.assignments.map((a) => a.workspace_member_id));
  }

  try {
    const outcome = await transitionDocumentRevision(auth.supabase, {
      revisionId: revision.id,
      from: revision.state,
      action,
      userId: auth.userId,
      reviewBrief: meta?.reviewBrief ?? null,
      reviewDueDate: meta?.reviewDueDate ?? null,
      // Entering Review starts a fresh approval cycle (resets prior approvals).
      reviewCycle: transition.to === 'review' ? revision.review_cycle + 1 : undefined,
    });
    if (outcome.status === 'conflict') {
      return { ok: false, error: 'The document’s status changed elsewhere — reload and try again.' };
    }
    // C3.5 — notify the assigned approvers a review is requested (spec §9.2).
    if (action === 'submit_for_review' && outcome.state === 'review') {
      await notifyReviewRequested(auth, documentId, approverMembershipIds);
    }
    // C9.6 — meter the lifecycle transition.
    await recordStateChange(auth.workspaceId, documentId, auth.userId, {
      action,
      from: revision.state,
      to: outcome.state,
    });
    revalidateDocument(documentId);
    return { ok: true, state: outcome.state };
  } catch {
    return { ok: false, error: 'Could not update the document’s status.' };
  }
}

/** C9.6 — append a `document_state_changed` analytics event (service-role; best-effort). */
async function recordStateChange(
  workspaceId: WorkspaceId,
  documentId: string,
  userId: UserId,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await recordAnalyticsEvent(
      createServiceClient(),
      { workspaceId },
      {
        eventType: 'document_state_changed',
        actorUserId: userId,
        documentId: documentId as DocumentId,
        payload,
      },
    );
  } catch {
    // ignore — metering never fails the action
  }
}

/**
 * C3.5 — dispatch `review_requested` to the assigned approvers through the unified
 * notification system (invariant 8). Best-effort: a dispatch failure never fails
 * the transition. Service-role write (notifications have no authenticated INSERT).
 */
async function notifyReviewRequested(
  auth: { userId: UserId; workspaceId: WorkspaceId; document: { title: string } },
  documentId: string,
  approverMembershipIds: string[],
): Promise<void> {
  if (approverMembershipIds.length === 0) return;
  try {
    const service = createServiceClient();
    const recipients = (await membershipUserIds(service, approverMembershipIds)).filter(
      (id) => id !== auth.userId, // the submitter doesn't notify themselves
    );
    await dispatchNotification(service, {
      workspaceId: auth.workspaceId,
      recipientIds: recipients,
      eventType: 'review_requested',
      payload: { documentId, documentTitle: auth.document.title },
    });
  } catch {
    // ignore — notifications are best-effort
  }
}

/**
 * C3.5 — dispatch `document_published` to the owner + everyone who commented on
 * the published revision (spec §9.2), minus the publisher. Best-effort.
 */
async function notifyPublished(
  auth: {
    supabase: Parameters<typeof listRevisionCommenterIds>[0];
    userId: UserId;
    workspaceId: WorkspaceId;
    document: { owner_id: UserId | null; title: string };
  },
  documentId: string,
  revisionId: DocumentRevisionId,
): Promise<void> {
  try {
    const commenters = await listRevisionCommenterIds(auth.supabase, revisionId);
    const owner = auth.document.owner_id ? [auth.document.owner_id] : [];
    const recipients = [...new Set([...owner, ...commenters])].filter((id) => id !== auth.userId);
    if (recipients.length === 0) return;
    await dispatchNotification(createServiceClient(), {
      workspaceId: auth.workspaceId,
      recipientIds: recipients,
      eventType: 'document_published',
      payload: { documentId, documentTitle: auth.document.title },
    });
  } catch {
    // ignore — notifications are best-effort
  }
}

/** Draft → Review, with the optional review brief + due date (spec §5.1; C0.4). */
export async function submitForReviewAction(
  documentId: string,
  input: unknown,
): Promise<LifecycleResult> {
  const parsed = submitForReviewSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  return runOwnerTransition(documentId, 'submit_for_review', {
    reviewBrief: parsed.data.reviewBrief || undefined,
    reviewDueDate: parsed.data.reviewDueDate || undefined,
  });
}

/** Review → Draft or Approved → Draft (owner pull-back; spec §3.2). */
export async function pullBackToDraftAction(documentId: string): Promise<LifecycleResult> {
  return runOwnerTransition(documentId, 'pull_back_to_draft');
}

/** Approved → Review (owner pull-back; the document re-locks). */
export async function pullBackToReviewAction(documentId: string): Promise<LifecycleResult> {
  return runOwnerTransition(documentId, 'pull_back_to_review');
}

/**
 * C4 — Approved → Published. Runs the blocking pre-flight (C4.1), resolves the
 * spec-field map (C4.2) + search text (C4.5), then atomically freezes the
 * working revision into an immutable, versioned `published_snapshots` row and
 * flips the state (C4.3/C4.4) via the service-role `publish_document` RPC. The
 * snapshot is self-contained — inline tokens carry their (G6.2-current) values
 * and the resolution manifest freezes the spec map, so a later spec change never
 * alters it. (PDF generation flips `pdf_ready` at C5; the portal serves it at C6.)
 */
export async function publishDocumentAction(documentId: string): Promise<LifecycleResult> {
  const auth = await authorize(documentId, 'publish');
  if ('error' in auth) return { ok: false, error: auth.error };

  const tree = await loadDocumentTree(auth.supabase, documentId as DocumentId);
  if (!tree) return { ok: false, error: 'Document not found.' };
  if (tree.revision.state !== 'approved') {
    return { ok: false, error: 'Only an approved document can be published.' };
  }

  // C4.1 — a placeholder block has no content to freeze; block the publish.
  const preflight = computePublishPreflight({
    blocks: tree.blocks.map((b) => ({ source: b.source, content: b.content })),
  });
  if (!preflight.canPublish) {
    return { ok: false, error: preflight.blocking.join(' ') };
  }

  // V.6 — a human-edited block in an unresolved merge conflict blocks publication
  // (Path B, spec §4.8). AI-generated conflicts are non-blocking and don't gate.
  const blockingConflicts = await countOpenBlockingMergeConflicts(
    auth.supabase,
    documentId as DocumentId,
  );
  if (blockingConflicts > 0) {
    return {
      ok: false,
      error: `Resolve ${blockingConflicts} blocking merge conflict${blockingConflicts === 1 ? '' : 's'} before publishing.`,
    };
  }

  try {
    const resolutionManifest = await resolveSpecFields(
      auth.supabase,
      tree.document.product_id,
      auth.workspaceId,
    );
    // R.2 — materialize live snippet embeds into the frozen snapshot so it stays
    // self-contained (the portal needs no snippet awareness). Non-snippet docs
    // are unaffected. Search text is recomputed over the expanded content.
    const blockTree = await expandSnippetsForPublish(
      auth.supabase,
      documentId as DocumentId,
      tree.blocks.map((b) => ({ id: b.id as string, content: b.content })),
    );
    const searchText = blockTree
      .map((c) => blockPlainText(c))
      .filter((t) => t.trim().length > 0)
      .join('\n');

    await publishDocument(
      createServiceClient(),
      { workspaceId: auth.workspaceId },
      {
        revisionId: tree.revision.id,
        publishedBy: auth.userId,
        blockTree,
        resolutionManifest,
        searchText,
      },
    );
    // C3.5 — notify the owner + everyone who commented on this revision (§9.2).
    await notifyPublished(auth, documentId, tree.revision.id);
    // C9.6 — meter the publish (approved → published).
    await recordStateChange(auth.workspaceId, documentId, auth.userId, {
      action: 'publish',
      from: 'approved',
      to: 'published',
    });
    revalidateDocument(documentId);
    // C6.5 — bust the workspace's portal CDN cache (best-effort, env-gated).
    await revalidatePortal([`portal:${auth.workspaceSlug}`]);
    return { ok: true, state: 'published' };
  } catch (err) {
    if (err instanceof DbRuleError) return { ok: false, error: err.message };
    return { ok: false, error: 'Could not publish the document.' };
  }
}

export interface DuplicateResult {
  ok: boolean;
  error?: string;
  /** The new Draft document's id, for the client to navigate to. */
  newDocumentId?: string;
  /** Cross-product only: spec fields / brief fragments that became placeholders. */
  placeholderNotes?: string[];
}

export interface DuplicateTarget {
  id: string;
  name: string;
}

/** R.8 — the workspace's products, for the cross-product duplication picker. */
export async function listDuplicateTargetsAction(): Promise<DuplicateTarget[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return [];
  const products = await listProducts(supabase, workspace.id);
  return products.map((p) => ({ id: p.id, name: p.name }));
}

/**
 * R.8 — duplicate a document into a new Draft, in the same product or a different
 * one (`targetProductId`). Any editor can duplicate (it creates a *new* document
 * they own — not an owner-of-source operation), so it's `doc.write`-gated. The
 * copy carries blocks and snippet embeds (live); references are copied verbatim
 * for the same product, or re-resolved against the target product (re-linking
 * matched spec fields, placeholdering the rest) cross-product. The author lands in
 * the new draft's editor.
 */
export async function duplicateDocumentAction(
  documentId: string,
  targetProductId?: string,
): Promise<DuplicateResult> {
  if (!UUID_RE.test(documentId)) return { ok: false, error: 'Invalid document.' };
  if (targetProductId && !UUID_RE.test(targetProductId)) {
    return { ok: false, error: 'Invalid target product.' };
  }
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { ok: false, error: 'No workspace yet.' };

  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.write', { workspaceId: workspace.id }))) {
    return { ok: false, error: 'Viewers can’t duplicate documents.' };
  }

  const source = await getDocument(supabase, documentId as DocumentId);
  if (!source) return { ok: false, error: 'Document not found.' };

  try {
    const result = await duplicateDocument(supabase, {
      workspaceId: workspace.id,
      sourceDocumentId: documentId as DocumentId,
      title: `Copy of ${source.title}`,
      userId: user.id as UserId,
      targetProductId: targetProductId ? (targetProductId as ProductId) : undefined,
    });
    revalidatePath('/specs');
    return { ok: true, newDocumentId: result.newDocumentId, placeholderNotes: result.placeholderNotes };
  } catch {
    return { ok: false, error: 'Could not duplicate the document.' };
  }
}

/**
 * C4.6 — unpublish = archive. Take the document off the public portal by
 * archiving all of its live snapshots (rows are never deleted; the audit trigger
 * logs `snapshot.archived`). This is a portal-visibility operation, deliberately
 * decoupled from the lifecycle state machine: the document stays Published (its
 * working copy is untouched) — only its public visibility changes. Owner/admin
 * only (the `doc.publish` gate + the 0008 RLS UPDATE policy). Busts the portal
 * cache so it disappears immediately.
 */
export async function unpublishDocumentAction(documentId: string): Promise<LifecycleResult> {
  const auth = await authorize(documentId, 'publish');
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    const archived = await archiveDocumentSnapshots(auth.supabase, {
      documentId: documentId as DocumentId,
      userId: auth.userId,
    });
    if (archived === 0) return { ok: false, error: 'This document isn’t live on the portal.' };
    revalidateDocument(documentId);
    await revalidatePortal([`portal:${auth.workspaceSlug}`]);
    return { ok: true, state: 'published' };
  } catch {
    return { ok: false, error: 'Could not unpublish the document.' };
  }
}

/**
 * C4.6 — restore a previously-unpublished document to the portal by un-archiving
 * its most recent snapshot (the audit trigger logs `snapshot.restored`). Same
 * owner/admin gate and portal-cache bust as unpublishing.
 */
export async function restoreToPortalAction(documentId: string): Promise<LifecycleResult> {
  const auth = await authorize(documentId, 'publish');
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    const version = await restoreLatestSnapshot(auth.supabase, {
      documentId: documentId as DocumentId,
      userId: auth.userId,
    });
    if (!version) return { ok: false, error: 'There’s no snapshot to restore.' };
    revalidateDocument(documentId);
    await revalidatePortal([`portal:${auth.workspaceSlug}`]);
    return { ok: true, state: 'published' };
  } catch {
    return { ok: false, error: 'Could not restore the document.' };
  }
}

/**
 * V.9 — publish ONE variant's portal page. A variant shares the base document's
 * source, so we freeze the same approved/published revision *resolved for the
 * variant*: drop blocks scoped out of it (V.4), expand snippets, then rewrite
 * every inline spec token to the variant's resolved value (R.7) and freeze the
 * variant's spec-field manifest. The snapshot is stamped with `variant_id` and
 * versioned on its own line (migration 0028). The base publication and sibling
 * variants are untouched (spec §4.5). Owner/admin (`doc.publish`) + service-role
 * RPC, exactly like the base publish.
 */
export async function publishVariantAction(
  documentId: string,
  variantId: string,
): Promise<LifecycleResult> {
  if (!UUID_RE.test(variantId)) return { ok: false, error: 'Invalid variant.' };
  const auth = await authorize(documentId, 'publish');
  if ('error' in auth) return { ok: false, error: auth.error };

  const tree = await loadDocumentTree(auth.supabase, documentId as DocumentId);
  if (!tree) return { ok: false, error: 'Document not found.' };
  // A variant is an additional page over a live document; the base must have
  // cleared approval (the RPC enforces this too, defence in depth).
  if (tree.revision.state !== 'approved' && tree.revision.state !== 'published') {
    return { ok: false, error: 'Publish the base document before publishing a variant.' };
  }

  // The variant must belong to this document's product.
  const variant = await getVariant(auth.supabase, variantId as VariantId);
  if (!variant || variant.productId !== tree.document.product_id) {
    return { ok: false, error: 'That variant isn’t part of this product.' };
  }

  try {
    // R.7 — the variant's resolved spec: the frozen manifest + per-field inline
    // token replacements + the components present (for V.4 visibility).
    const resolved = await resolveSpecFieldsForVariant(
      auth.supabase,
      variantId as VariantId,
      auth.workspaceId,
    );
    if (!resolved) return { ok: false, error: 'Could not resolve the variant’s spec.' };

    // V.4 — drop blocks this variant doesn't show (DERIVED whose component is gone,
    // MANUAL not listing it).
    const scopes = await loadBlockVariantScopes(
      auth.supabase,
      tree.blocks.map((b) => b.id),
    );
    const componentIds = new Set(resolved.componentIds);
    const visible = tree.blocks.filter((b) =>
      isBlockVisibleForVariant(scopes.get(b.id), {
        variantId: resolved.variant.id,
        componentIds,
      }),
    );

    // C4.1 — the same placeholder/empty pre-flight as the base, over the visible set.
    const preflight = computePublishPreflight({
      blocks: visible.map((b) => ({ source: b.source, content: b.content })),
    });
    if (!preflight.canPublish) {
      return { ok: false, error: preflight.blocking.join(' ') };
    }

    // R.2 — expand snippets, then rewrite every inline token to the variant's value
    // so the frozen snapshot matches the in-app "preview as variant".
    const expanded = await expandSnippetsForPublish(
      auth.supabase,
      documentId as DocumentId,
      visible.map((b) => ({ id: b.id as string, content: b.content })),
    );
    const blockTree = expanded.map((c) => applyTokenReplacements(c, resolved.replacements));
    const searchText = blockTree
      .map((c) => blockPlainText(c))
      .filter((t) => t.trim().length > 0)
      .join('\n');

    await publishDocument(
      createServiceClient(),
      { workspaceId: auth.workspaceId },
      {
        revisionId: tree.revision.id,
        publishedBy: auth.userId,
        blockTree,
        resolutionManifest: resolved.resolution,
        searchText,
        variantId: variantId as VariantId,
      },
    );
    // C7 — a variant page must not be MORE public than its base: if the base
    // document is gated (link/allowlist), inherit that tier onto the freshly
    // published variant snapshot (which otherwise defaults to public). The base
    // access governs the base line only; variants carry their own tier from here.
    const baseAccess = await loadLiveAccess(auth.supabase, documentId);
    if (baseAccess && baseAccess.access !== 'public') {
      await setDocumentAccess(auth.supabase, {
        documentId: documentId as DocumentId,
        access: baseAccess.access,
        allowlist: baseAccess.allowlist,
        variantId: variantId as VariantId,
      });
    }
    revalidateDocument(documentId);
    await revalidatePortal([`portal:${auth.workspaceSlug}`]);
    return { ok: true, state: tree.revision.state };
  } catch (err) {
    if (err instanceof DbRuleError) return { ok: false, error: err.message };
    return { ok: false, error: 'Could not publish the variant.' };
  }
}

/** V.9 — take ONE variant's page off the portal (archive its live snapshots). */
export async function unpublishVariantAction(
  documentId: string,
  variantId: string,
): Promise<LifecycleResult> {
  if (!UUID_RE.test(variantId)) return { ok: false, error: 'Invalid variant.' };
  const auth = await authorize(documentId, 'publish');
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    const archived = await archiveVariantSnapshots(auth.supabase, {
      documentId: documentId as DocumentId,
      variantId: variantId as VariantId,
      userId: auth.userId,
    });
    if (archived === 0) return { ok: false, error: 'This variant isn’t live on the portal.' };
    revalidateDocument(documentId);
    await revalidatePortal([`portal:${auth.workspaceSlug}`]);
    return { ok: true, state: 'published' };
  } catch {
    return { ok: false, error: 'Could not unpublish the variant.' };
  }
}

/** Published → Draft: fork a new working copy from the published snapshot (C0.2). */
export async function createRevisionAction(documentId: string): Promise<LifecycleResult> {
  const auth = await authorize(documentId, 'create_revision');
  if ('error' in auth) return { ok: false, error: auth.error };

  const revision = await getRevision(
    auth.supabase,
    auth.document.current_revision_id as DocumentRevisionId,
  );
  if (!revision) return { ok: false, error: 'Document not found.' };
  if (revision.state !== 'published') {
    return { ok: false, error: 'Only a published document can start a new revision.' };
  }

  try {
    await createDocumentRevision(auth.supabase, {
      workspaceId: auth.workspaceId,
      documentId: documentId as DocumentId,
      fromRevisionId: revision.id,
      userId: auth.userId,
    });
    revalidateDocument(documentId);
    return { ok: true, state: 'draft' };
  } catch {
    return { ok: false, error: 'Could not create a new revision.' };
  }
}

// --- C7 access control & magic links -----------------------------------------

export interface AccessActionResult {
  ok: boolean;
  error?: string;
  /** The new access tier on success (setDocumentAccessAction). */
  access?: DocumentAccessMode;
  /** A freshly issued magic-link URL — shown once (issueMagicLinkAction). */
  url?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The access tier + allowlist of a document's live snapshot, or null if unpublished. */
async function loadLiveAccess(
  supabase: Parameters<typeof listSnapshotsForDocument>[0],
  documentId: string,
): Promise<{ access: DocumentAccessMode; allowlist: DocumentAllowlist } | null> {
  const snapshots = await listSnapshotsForDocument(supabase, documentId as DocumentId);
  // V.9 — base access governs the base magic-link UI; never read a variant line.
  const live = snapshots.find((s) => s.variant_id == null && !s.archived_at);
  if (!live) return null;
  return {
    access: parseDocumentAccess(live.access_config),
    allowlist: parseDocumentAllowlist(live.access_config),
  };
}

/**
 * C7.1/C7.3 — set a published document's portal access tier (public · link-gated ·
 * allowlist) by writing `access_config` on its live snapshots (owner/admin;
 * audited by the DB trigger). For the allowlist tier the supplied emails/domains
 * are normalised and stored. Busts the portal cache so the change takes effect now.
 */
export async function setDocumentAccessAction(
  documentId: string,
  access: DocumentAccessMode,
  allowlistInput?: { emails: string[]; domains: string[] },
): Promise<AccessActionResult> {
  if (!DOCUMENT_ACCESS_MODES.includes(access)) return { ok: false, error: 'Unknown access tier.' };
  const auth = await authorize(documentId, 'publish');
  if ('error' in auth) return { ok: false, error: auth.error };

  const allowlist: DocumentAllowlist | undefined =
    access === 'allowlist'
      ? {
          emails: normalizeEmails(allowlistInput?.emails ?? []),
          domains: normalizeDomains(allowlistInput?.domains ?? []),
        }
      : undefined;

  try {
    const updated = await setDocumentAccess(auth.supabase, {
      documentId: documentId as DocumentId,
      access,
      allowlist,
    });
    if (updated === 0) return { ok: false, error: 'Publish the document before setting access.' };
    revalidateDocument(documentId);
    await revalidatePortal([`portal:${auth.workspaceSlug}`]);
    return { ok: true, access };
  } catch {
    return { ok: false, error: 'Could not update access.' };
  }
}

/**
 * C7.2/C7.3 — issue a magic link for a gated document. Generates a high-entropy
 * token, stores only its hash (`@arther/config`), and inserts the `magic_links`
 * row under the caller's JWT (RLS: editor; the audit trigger records the actor).
 * The link `type` follows the document's tier: `allowlist` docs issue `allowlist`
 * links and the recipient email must be on the allowlist; `link` docs issue `open`
 * links (any holder). The raw token is returned **once** as a shareable URL —
 * never persisted (email delivery arrives with notifications, C3). Requires
 * `PORTAL_BASE_URL` to build an absolute URL.
 */
export async function issueMagicLinkAction(
  documentId: string,
  input: { email: string; expiresInDays: number },
): Promise<AccessActionResult> {
  const email = (input.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email.' };
  const days = Math.floor(input.expiresInDays);
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    return { ok: false, error: 'Expiry must be 1–90 days.' };
  }

  const auth = await authorize(documentId, 'publish');
  if ('error' in auth) return { ok: false, error: auth.error };

  // C9.4 — cap link issuance per member so the access surface can't be a relay.
  const throttle = await rateLimit('magic_link_issue', auth.userId);
  if (!throttle.success) {
    return { ok: false, error: `Too many links just now — wait ${throttle.retryAfterSeconds}s and try again.` };
  }

  const base = process.env.PORTAL_BASE_URL;
  if (!base) return { ok: false, error: 'Portal URL isn’t configured in this environment yet.' };

  const live = await loadLiveAccess(auth.supabase, documentId);
  if (!live) return { ok: false, error: 'Publish the document before issuing links.' };
  if (live.access === 'public') return { ok: false, error: 'This document is public — no link needed.' };

  const type = live.access === 'allowlist' ? 'allowlist' : 'open';
  if (type === 'allowlist' && !isEmailAllowed({ access: 'allowlist', allowlist: live.allowlist }, email)) {
    return { ok: false, error: 'That email isn’t on the allowlist.' };
  }

  try {
    const token = generateMagicToken();
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await issueMagicLink(auth.supabase, {
      workspaceId: auth.workspaceId,
      documentId: documentId as DocumentId,
      email,
      type,
      tokenHash: hashMagicToken(token),
      expiresAt,
      createdBy: auth.userId,
    });
    const url = new URL('/api/access', base);
    url.searchParams.set('w', auth.workspaceSlug);
    url.searchParams.set('d', documentId);
    url.searchParams.set('t', token);
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: 'Could not issue the access link.' };
  }
}

/**
 * C7.4 — revoke an issued magic link (owner/admin; audited). Idempotent. Blocks
 * new token exchanges immediately; live sessions run to expiry by design.
 */
export async function revokeMagicLinkAction(
  documentId: string,
  magicLinkId: string,
): Promise<AccessActionResult> {
  if (!UUID_RE.test(magicLinkId)) return { ok: false, error: 'Unknown link.' };
  const auth = await authorize(documentId, 'publish');
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    await revokeMagicLink(auth.supabase, magicLinkId);
    revalidateDocument(documentId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not revoke the link.' };
  }
}
