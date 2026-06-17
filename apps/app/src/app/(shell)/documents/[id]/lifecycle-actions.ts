'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo, type Action } from '@arther/authz';
import {
  archiveDocumentSnapshots,
  createDocumentRevision,
  createServiceClient,
  DbRuleError,
  getActiveWorkspace,
  getDocument,
  getRevision,
  listApprovalRoles,
  loadDocumentTree,
  membershipLookupFor,
  publishDocument,
  resolveSpecFields,
  restoreLatestSnapshot,
  transitionDocumentRevision,
} from '@arther/db';
import {
  blockPlainText,
  canManageDocumentLifecycle,
  computePublishPreflight,
  resolveTransition,
  submitForReviewSchema,
  type DocumentId,
  type DocumentRevisionId,
  type UserId,
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
    revalidateDocument(documentId);
    return { ok: true, state: outcome.state };
  } catch {
    return { ok: false, error: 'Could not update the document’s status.' };
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

  try {
    const resolutionManifest = await resolveSpecFields(
      auth.supabase,
      tree.document.product_id,
      auth.workspaceId,
    );
    const blockTree = tree.blocks.map((b) => b.content);
    const searchText = tree.blocks
      .map((b) => b.text_content ?? blockPlainText(b.content))
      .filter((t): t is string => Boolean(t && t.trim().length > 0))
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
    revalidateDocument(documentId);
    // C6.5 — bust the workspace's portal CDN cache (best-effort, env-gated).
    await revalidatePortal([`portal:${auth.workspaceSlug}`]);
    return { ok: true, state: 'published' };
  } catch (err) {
    if (err instanceof DbRuleError) return { ok: false, error: err.message };
    return { ok: false, error: 'Could not publish the document.' };
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
