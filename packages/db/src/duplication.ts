import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BrandProfileId,
  DocumentId,
  DocumentTypeId,
  ProductId,
  UserId,
  WorkspaceId,
} from '@arther/types';
import { createDocument } from './documents';

/**
 * R.8 — document duplication (Content Reuse §5.8). Duplicate a document's working
 * revision into a brand-new Draft. This slice covers **same-product** duplication:
 * the source's product is the target, so every reference stays valid and is copied
 * verbatim — block content, spec references (staleness anchors), brief/placeholder
 * references, and snippet embeds (re-created **live**, dropping any override state
 * per the spec). Cross-product duplication (re-resolving spec references against a
 * different product, converting unmatched ones to placeholders) is the follow-up.
 *
 * A multi-step PostgREST sequence (not one transaction), like `createDocument` —
 * acceptable for an explicit authoring action. A `duplication_records` row
 * captures the outcome for auditability.
 */

export interface DuplicationResult {
  newDocumentId: DocumentId;
  blocksResolved: number;
  blocksPlaceholdered: number;
  blocksCarriedOver: number;
}

interface SourceBlock {
  id: string;
  type: string;
  source: string;
  snippet_id: string | null;
  content: unknown;
  degradation: unknown;
  text_content: string | null;
  display_order: number;
}

export async function duplicateDocument(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; sourceDocumentId: DocumentId; title: string; userId: UserId },
): Promise<DuplicationResult> {
  const ws = input.workspaceId;

  const { data: src, error: srcErr } = await client
    .from('documents')
    .select('id, product_id, document_type_id, brand_profile_id, current_revision_id')
    .eq('id', input.sourceDocumentId)
    .maybeSingle();
  if (srcErr) throw new Error(`duplicateDocument.source: ${srcErr.message}`);
  if (!src || !src.current_revision_id) throw new Error('duplicateDocument: source not found');

  const { data: srcBlocksRaw, error: blkErr } = await client
    .from('blocks')
    .select('id, type, source, snippet_id, content, degradation, text_content, display_order')
    .eq('revision_id', src.current_revision_id as string)
    .order('display_order', { ascending: true });
  if (blkErr) throw new Error(`duplicateDocument.blocks: ${blkErr.message}`);
  const srcBlocks = (srcBlocksRaw ?? []) as SourceBlock[];

  // The new Draft document + its revision 1 (current pointer set by createDocument).
  const { document: newDoc, revision: newRev } = await createDocument(client, {
    workspaceId: ws,
    productId: src.product_id as ProductId,
    documentTypeId: src.document_type_id as DocumentTypeId,
    title: input.title,
    brandProfileId: (src.brand_profile_id as BrandProfileId | null) ?? null,
    ownerId: input.userId,
    createdBy: input.userId,
  });

  // Copy blocks, building old→new id map (snippet placement blocks keep snippet_id).
  const idMap = new Map<string, string>();
  for (const b of srcBlocks) {
    const { data: nb, error } = await client
      .from('blocks')
      .insert({
        workspace_id: ws,
        document_id: newDoc.id,
        revision_id: newRev.id,
        type: b.type,
        source: b.source,
        snippet_id: b.snippet_id ?? null,
        content: b.content,
        degradation: b.degradation ?? {},
        text_content: b.text_content,
        display_order: b.display_order,
        created_by: input.userId,
      })
      .select('id')
      .single();
    if (error) throw new Error(`duplicateDocument.copyBlock: ${error.message}`);
    idMap.set(b.id, nb.id as string);
  }

  const remap = <T extends { block_id: string }>(rows: T[]): Array<T & { newBlockId: string }> =>
    rows
      .map((r) => ({ ...r, newBlockId: idMap.get(r.block_id) }))
      .filter((r): r is T & { newBlockId: string } => Boolean(r.newBlockId));

  // Spec references (the staleness anchors) — valid as-is within the same product.
  const { data: specRefs, error: srErr } = await client
    .from('block_spec_references')
    .select('block_id, field_id, field_version_id, release_id, reference_type')
    .eq('document_id', input.sourceDocumentId);
  if (srErr) throw new Error(`duplicateDocument.specRefs: ${srErr.message}`);
  for (const r of remap((specRefs ?? []) as Array<{ block_id: string } & Record<string, unknown>>)) {
    const { error } = await client.from('block_spec_references').insert({
      workspace_id: ws,
      block_id: r.newBlockId,
      document_id: newDoc.id,
      field_id: r.field_id,
      field_version_id: r.field_version_id,
      release_id: r.release_id ?? null,
      reference_type: r.reference_type,
    });
    if (error) throw new Error(`duplicateDocument.copySpecRef: ${error.message}`);
  }

  // Brief references.
  const { data: briefRefs, error: brErr } = await client
    .from('block_brief_references')
    .select('block_id, brief_id, fragment_key, content_snapshot')
    .eq('document_id', input.sourceDocumentId);
  if (brErr) throw new Error(`duplicateDocument.briefRefs: ${brErr.message}`);
  for (const r of remap((briefRefs ?? []) as Array<{ block_id: string } & Record<string, unknown>>)) {
    const { error } = await client.from('block_brief_references').insert({
      workspace_id: ws,
      block_id: r.newBlockId,
      document_id: newDoc.id,
      brief_id: r.brief_id,
      fragment_key: r.fragment_key,
      content_snapshot: r.content_snapshot ?? null,
    });
    if (error) throw new Error(`duplicateDocument.copyBriefRef: ${error.message}`);
  }

  // Placeholder references (the unfilled-content markers) — carried as-is.
  const { data: phRefs, error: phErr } = await client
    .from('placeholder_brief_references')
    .select('block_id, entity_type, entity_id, fragment_key, section_name')
    .eq('document_id', input.sourceDocumentId);
  if (phErr) throw new Error(`duplicateDocument.placeholderRefs: ${phErr.message}`);
  for (const r of remap((phRefs ?? []) as Array<{ block_id: string } & Record<string, unknown>>)) {
    const { error } = await client.from('placeholder_brief_references').insert({
      workspace_id: ws,
      block_id: r.newBlockId,
      document_id: newDoc.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      fragment_key: r.fragment_key,
      section_name: r.section_name ?? null,
    });
    if (error) throw new Error(`duplicateDocument.copyPlaceholderRef: ${error.message}`);
  }

  // Snippet embeds — re-created live (override state is intentionally not copied).
  const { data: embeds, error: emErr } = await client
    .from('snippet_embeds')
    .select('block_id, library_item_id')
    .eq('document_id', input.sourceDocumentId);
  if (emErr) throw new Error(`duplicateDocument.embeds: ${emErr.message}`);
  for (const r of remap((embeds ?? []) as Array<{ block_id: string; library_item_id: string }>)) {
    const { error } = await client.from('snippet_embeds').insert({
      workspace_id: ws,
      document_id: newDoc.id,
      block_id: r.newBlockId,
      library_item_id: r.library_item_id,
      state: 'live',
    });
    if (error) throw new Error(`duplicateDocument.copyEmbed: ${error.message}`);
  }

  // Outcome summary (same-product: spec blocks resolve, nothing is placeholdered;
  // pre-existing placeholder blocks carry over).
  const blocksResolved = (specRefs ?? []).length;
  const blocksCarriedOver = srcBlocks.filter((b) => b.source === 'placeholder').length;
  const blocksPlaceholdered = 0;
  const { error: recErr } = await client.from('duplication_records').insert({
    workspace_id: ws,
    source_document_id: input.sourceDocumentId,
    new_document_id: newDoc.id,
    target_product_id: src.product_id as string,
    blocks_resolved: blocksResolved,
    blocks_placeholdered: blocksPlaceholdered,
    blocks_carried_over: blocksCarriedOver,
    created_by: input.userId,
  });
  if (recErr) throw new Error(`duplicateDocument.record: ${recErr.message}`);

  return {
    newDocumentId: newDoc.id as DocumentId,
    blocksResolved,
    blocksPlaceholdered,
    blocksCarriedOver,
  };
}
