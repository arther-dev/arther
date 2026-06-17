import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveTransition,
  type DocumentId,
  type DocumentRevisionId,
  type DocumentState,
  type DocumentTransitionAction,
  type UserId,
  type WorkspaceId,
} from '@arther/types';
import {
  REVISION_COLUMNS,
  loadRevisionBlocks,
  type DocumentRevisionRow,
} from './documents';
import { carryForwardComments } from './comments';

/**
 * C0 — document lifecycle state machine over the user-JWT client (RLS active:
 * `document_revisions` is member-read / editor-write, migration 0005). The app
 * authorizes `canDo` + document-ownership before calling; RLS is the
 * defence-in-depth layer behind. The pure transition map lives in `@arther/types`
 * (`resolveTransition`); this module performs the guarded write.
 */

export interface TransitionOutcome {
  status: 'ok' | 'conflict';
  /** The new state on success. */
  state?: DocumentState;
}

/**
 * C0.1 — move a revision through the lifecycle (spec §3.2). A guarded conditional
 * UPDATE keyed on the current `from` state (the saveBlockContent optimistic-lock
 * precedent): if the state already moved in another tab/process, no row matches
 * and we report a `conflict` rather than overwriting. The (action, from) pair
 * must be a real transition. Publishing stamps `published_at`/`published_by`;
 * sending for review records the submission metadata (C0.4).
 */
export async function transitionDocumentRevision(
  client: SupabaseClient,
  input: {
    revisionId: DocumentRevisionId;
    from: DocumentState;
    action: DocumentTransitionAction;
    userId: UserId;
    reviewBrief?: string | null;
    reviewDueDate?: string | null;
    /** The new approval cycle to stamp when entering Review (C1; caller passes from+1). */
    reviewCycle?: number;
  },
): Promise<TransitionOutcome> {
  const transition = resolveTransition(input.action, input.from);
  if (!transition) {
    throw new Error(`transitionDocumentRevision: no "${input.action}" transition from "${input.from}"`);
  }

  const update: Record<string, unknown> = {
    state: transition.to,
    updated_by: input.userId,
  };
  if (input.action === 'submit_for_review') {
    update.review_brief = input.reviewBrief ?? null;
    update.review_due_date = input.reviewDueDate ?? null;
  }
  // Entering Review (submit or pull-back-to-review) starts a fresh approval
  // cycle, so any approvals collected before are reset by scoping (C1).
  if (transition.to === 'review' && input.reviewCycle !== undefined) {
    update.review_cycle = input.reviewCycle;
  }
  if (transition.to === 'published') {
    update.published_at = new Date().toISOString();
    update.published_by = input.userId;
  }

  const { data, error } = await client
    .from('document_revisions')
    .update(update)
    .eq('id', input.revisionId)
    .eq('state', input.from) // the guard: only fire from the expected state
    .select('id, state');
  if (error) throw new Error(`transitionDocumentRevision: ${error.message}`);

  if ((data ?? []).length === 1) {
    return { status: 'ok', state: data![0]!.state as DocumentState };
  }
  return { status: 'conflict' };
}

/**
 * C0.2 — fork a new editable working copy from a (published) revision. The new
 * revision is a full copy of the source: its blocks (new ids, same content,
 * order, and degradation) and their spec / brief / placeholder references
 * (re-anchored to the same field versions and fragments, so staleness and brief
 * tracking carry forward onto the working copy). It enters `draft` and becomes
 * the document's current pointer; the published snapshot the portal serves is
 * untouched (spec §2.2 / §2.3).
 *
 * A multi-step PostgREST sequence (not one transaction) — acceptable for an
 * explicit authoring action (the `createDocument` precedent): a mid-sequence
 * failure leaves an orphan draft the current pointer never moved to (harmless,
 * re-creatable). The atomic RPC is a follow-up.
 */
export async function createDocumentRevision(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentId: DocumentId;
    fromRevisionId: DocumentRevisionId;
    userId: UserId;
  },
): Promise<DocumentRevisionRow> {
  // 1. Allocate the next revision number (max + 1) for this document.
  const { data: maxData, error: maxErr } = await client
    .from('document_revisions')
    .select('revision_number')
    .eq('document_id', input.documentId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw new Error(`createDocumentRevision.max: ${maxErr.message}`);
  const nextNumber = ((maxData?.revision_number as number | undefined) ?? 0) + 1;

  // 2. The new draft revision.
  const { data: revData, error: revErr } = await client
    .from('document_revisions')
    .insert({
      workspace_id: input.workspaceId,
      document_id: input.documentId,
      revision_number: nextNumber,
      state: 'draft',
      created_by: input.userId,
    })
    .select(REVISION_COLUMNS)
    .single();
  if (revErr) throw new Error(`createDocumentRevision.revision: ${revErr.message}`);
  const revision = revData as DocumentRevisionRow;

  // 3. Clone the source blocks (fresh ids), tracking old → new for the references.
  const sourceBlocks = await loadRevisionBlocks(client, input.fromRevisionId);
  const idMap = new Map<string, string>();
  for (const b of sourceBlocks) {
    const { data: nb, error: be } = await client
      .from('blocks')
      .insert({
        workspace_id: input.workspaceId,
        document_id: input.documentId,
        revision_id: revision.id,
        type: b.type,
        display_order: b.display_order,
        source: b.source,
        content: b.content,
        degradation: b.degradation,
        text_content: b.text_content,
        created_by: input.userId,
      })
      .select('id')
      .single();
    if (be) throw new Error(`createDocumentRevision.block: ${be.message}`);
    idMap.set(b.id, nb.id as string);
  }

  // 4. Clone the reference rows, remapped onto the new block ids.
  await cloneBlockReferences(client, {
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    idMap,
  });

  // 4.5 C2.4 — carry unresolved comment threads onto the new working copy,
  // re-anchored to the remapped blocks and flagged inherited (collab spec §7.3).
  await carryForwardComments(client, {
    workspaceId: input.workspaceId,
    fromRevisionId: input.fromRevisionId,
    toRevisionId: revision.id,
    blockIdMap: idMap,
  });

  // 5. Point the document at the new working copy.
  const { error: ptrErr } = await client
    .from('documents')
    .update({ current_revision_id: revision.id })
    .eq('id', input.documentId);
  if (ptrErr) throw new Error(`createDocumentRevision.pointer: ${ptrErr.message}`);

  return revision;
}

/** Copy a revision's spec/brief/placeholder references onto the cloned blocks. */
async function cloneBlockReferences(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; documentId: DocumentId; idMap: Map<string, string> },
): Promise<void> {
  const oldIds = [...input.idMap.keys()];
  if (oldIds.length === 0) return;
  const remap = (oldBlockId: string) => input.idMap.get(oldBlockId)!;

  const { data: specRefs, error: se } = await client
    .from('block_spec_references')
    .select('block_id, field_id, field_version_id, release_id, reference_type')
    .in('block_id', oldIds);
  if (se) throw new Error(`createDocumentRevision.specRefs: ${se.message}`);
  if (specRefs && specRefs.length > 0) {
    const { error } = await client.from('block_spec_references').insert(
      specRefs.map((r) => ({
        workspace_id: input.workspaceId,
        document_id: input.documentId,
        block_id: remap(r.block_id as string),
        field_id: r.field_id,
        field_version_id: r.field_version_id,
        release_id: r.release_id,
        reference_type: r.reference_type,
      })),
    );
    if (error) throw new Error(`createDocumentRevision.specRefs.insert: ${error.message}`);
  }

  const { data: briefRefs, error: be } = await client
    .from('block_brief_references')
    .select('block_id, brief_id, fragment_key, content_snapshot')
    .in('block_id', oldIds);
  if (be) throw new Error(`createDocumentRevision.briefRefs: ${be.message}`);
  if (briefRefs && briefRefs.length > 0) {
    const { error } = await client.from('block_brief_references').insert(
      briefRefs.map((r) => ({
        workspace_id: input.workspaceId,
        document_id: input.documentId,
        block_id: remap(r.block_id as string),
        brief_id: r.brief_id,
        fragment_key: r.fragment_key,
        content_snapshot: r.content_snapshot,
      })),
    );
    if (error) throw new Error(`createDocumentRevision.briefRefs.insert: ${error.message}`);
  }

  const { data: placeholderRefs, error: pe } = await client
    .from('placeholder_brief_references')
    .select('block_id, entity_type, entity_id, fragment_key, section_name')
    .in('block_id', oldIds);
  if (pe) throw new Error(`createDocumentRevision.placeholderRefs: ${pe.message}`);
  if (placeholderRefs && placeholderRefs.length > 0) {
    const { error } = await client.from('placeholder_brief_references').insert(
      placeholderRefs.map((r) => ({
        workspace_id: input.workspaceId,
        document_id: input.documentId,
        block_id: remap(r.block_id as string),
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        fragment_key: r.fragment_key,
        section_name: r.section_name,
      })),
    );
    if (error) throw new Error(`createDocumentRevision.placeholderRefs.insert: ${error.message}`);
  }
}
