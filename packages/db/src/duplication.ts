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
 * revision into a brand-new Draft, in the same product **or a different one**:
 *
 * - **Same product** (no `targetProductId`, or it equals the source's): every
 *   reference stays valid and is copied verbatim — spec references (staleness
 *   anchors), brief references, placeholder references, all unchanged.
 * - **Cross-product**: references are re-resolved against the target product
 *   (§5.8). A spec-referenced block re-links to the target product's field of the
 *   same name (matched case-insensitively, the only cross-product identity the
 *   model has) **when that field exists and is populated**, anchored to the
 *   target's current version; otherwise — and for every brief-referenced block,
 *   since the target may have no brief — the block becomes a **placeholder** for
 *   the new author to fill. Pre-existing placeholder blocks carry over (re-pointed
 *   at the target product).
 *
 * Block content is copied as-is in both cases: spec tokens resolve at render time
 * against the embedding document's product, so re-linking the *reference* is what
 * makes the target product's values appear — no regeneration here.
 *
 * Snippet embeds always carry over as fresh **live** links (override state is not
 * copied, per the spec). A `duplication_records` row captures the outcome.
 */

export interface DuplicationResult {
  newDocumentId: DocumentId;
  blocksResolved: number;
  blocksPlaceholdered: number;
  blocksCarriedOver: number;
  /** Cross-product only: the spec fields / brief fragments that produced placeholders. */
  placeholderNotes: string[];
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

/** A stable fragment key from a human field/fragment name (cross-product placeholders). */
function fragmentKeyFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
}

export async function duplicateDocument(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    sourceDocumentId: DocumentId;
    title: string;
    userId: UserId;
    /** Target product; omitted (or equal to source) → same-product duplication. */
    targetProductId?: ProductId;
  },
): Promise<DuplicationResult> {
  const ws = input.workspaceId;

  const { data: src, error: srcErr } = await client
    .from('documents')
    .select('id, product_id, document_type_id, brand_profile_id, current_revision_id')
    .eq('id', input.sourceDocumentId)
    .maybeSingle();
  if (srcErr) throw new Error(`duplicateDocument.source: ${srcErr.message}`);
  if (!src || !src.current_revision_id) throw new Error('duplicateDocument: source not found');

  const targetProductId = (input.targetProductId ?? (src.product_id as ProductId)) as ProductId;
  const crossProduct = targetProductId !== (src.product_id as string);

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
    productId: targetProductId,
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

  const result = crossProduct
    ? await copyReferencesCrossProduct(client, { ws, src, newDoc, srcBlocks, idMap, remap, targetProductId, userId: input.userId })
    : await copyReferencesSameProduct(client, { ws, src, newDoc, srcBlocks, idMap, remap, userId: input.userId });

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

  const { error: recErr } = await client.from('duplication_records').insert({
    workspace_id: ws,
    source_document_id: input.sourceDocumentId,
    new_document_id: newDoc.id,
    target_product_id: targetProductId,
    blocks_resolved: result.blocksResolved,
    blocks_placeholdered: result.blocksPlaceholdered,
    blocks_carried_over: result.blocksCarriedOver,
    created_by: input.userId,
  });
  if (recErr) throw new Error(`duplicateDocument.record: ${recErr.message}`);

  return { newDocumentId: newDoc.id as DocumentId, ...result };
}

type RefCounts = {
  blocksResolved: number;
  blocksPlaceholdered: number;
  blocksCarriedOver: number;
  placeholderNotes: string[];
};

interface CopyCtx {
  ws: WorkspaceId;
  src: Record<string, unknown>;
  newDoc: { id: string };
  srcBlocks: SourceBlock[];
  idMap: Map<string, string>;
  remap: <T extends { block_id: string }>(rows: T[]) => Array<T & { newBlockId: string }>;
  userId: UserId;
}

/** Same-product: references stay valid, so copy them verbatim. */
async function copyReferencesSameProduct(
  client: SupabaseClient,
  ctx: CopyCtx,
): Promise<RefCounts> {
  const { ws, src, newDoc, srcBlocks, remap } = ctx;
  const sourceDocumentId = src.id as string;

  const { data: specRefs, error: srErr } = await client
    .from('block_spec_references')
    .select('block_id, field_id, field_version_id, release_id, reference_type')
    .eq('document_id', sourceDocumentId);
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

  const { data: briefRefs, error: brErr } = await client
    .from('block_brief_references')
    .select('block_id, brief_id, fragment_key, content_snapshot')
    .eq('document_id', sourceDocumentId);
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

  const { data: phRefs, error: phErr } = await client
    .from('placeholder_brief_references')
    .select('block_id, entity_type, entity_id, fragment_key, section_name')
    .eq('document_id', sourceDocumentId);
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

  // Same-product: spec blocks resolve, nothing is placeholdered; existing
  // placeholder blocks carry over.
  return {
    blocksResolved: (specRefs ?? []).length,
    blocksPlaceholdered: 0,
    blocksCarriedOver: srcBlocks.filter((b) => b.source === 'placeholder').length,
    placeholderNotes: [],
  };
}

/**
 * Cross-product (§5.8): re-resolve references against the target product. Spec
 * blocks re-link to a same-named, populated target field (anchored to its current
 * version) or become placeholders; brief blocks become placeholders; existing
 * placeholder blocks carry over re-pointed at the target product.
 */
async function copyReferencesCrossProduct(
  client: SupabaseClient,
  ctx: CopyCtx & { targetProductId: ProductId },
): Promise<RefCounts> {
  const { ws, src, newDoc, idMap, remap, targetProductId, userId } = ctx;
  const sourceDocumentId = src.id as string;

  // Target product fields, keyed by lower(name): the cross-product identity.
  const { data: targetFields, error: tfErr } = await client
    .from('spec_fields')
    .select('id, name, value, current_version_id')
    .eq('product_id', targetProductId)
    .is('archived_at', null);
  if (tfErr) throw new Error(`duplicateDocument.targetFields: ${tfErr.message}`);
  const targetByName = new Map(
    (targetFields ?? []).map((f) => {
      const row = f as { id: string; name: string; value: unknown; current_version_id: string | null };
      return [
        row.name.toLowerCase(),
        { id: row.id, versionId: row.current_version_id, populated: row.value != null },
      ];
    }),
  );

  // Source spec references grouped by block, plus the source field names.
  const { data: specRefs, error: srErr } = await client
    .from('block_spec_references')
    .select('block_id, field_id, release_id, reference_type')
    .eq('document_id', sourceDocumentId);
  if (srErr) throw new Error(`duplicateDocument.specRefs: ${srErr.message}`);
  const specRefRows = (specRefs ?? []) as Array<{
    block_id: string;
    field_id: string;
    release_id: string | null;
    reference_type: string;
  }>;
  const sourceFieldIds = [...new Set(specRefRows.map((r) => r.field_id))];
  const nameByFieldId = new Map<string, string>();
  if (sourceFieldIds.length > 0) {
    const { data: srcFields, error: sfErr } = await client
      .from('spec_fields')
      .select('id, name')
      .in('id', sourceFieldIds);
    if (sfErr) throw new Error(`duplicateDocument.sourceFields: ${sfErr.message}`);
    for (const f of (srcFields ?? []) as Array<{ id: string; name: string }>) {
      nameByFieldId.set(f.id, f.name);
    }
  }
  const refsByBlock = new Map<string, typeof specRefRows>();
  for (const r of specRefRows) {
    const list = refsByBlock.get(r.block_id) ?? [];
    list.push(r);
    refsByBlock.set(r.block_id, list);
  }

  let blocksResolved = 0;
  let blocksPlaceholdered = 0;
  let blocksCarriedOver = 0;
  const placeholderNotes = new Set<string>();

  const toPlaceholder = async (newBlockId: string, fragmentName: string, sectionName: string | null) => {
    const { error: upErr } = await client
      .from('blocks')
      .update({ source: 'placeholder', last_edited_by: userId })
      .eq('id', newBlockId);
    if (upErr) throw new Error(`duplicateDocument.toPlaceholder.block: ${upErr.message}`);
    const { error: insErr } = await client.from('placeholder_brief_references').insert({
      workspace_id: ws,
      block_id: newBlockId,
      document_id: newDoc.id,
      entity_type: 'product',
      entity_id: targetProductId,
      fragment_key: fragmentKeyFor(fragmentName),
      section_name: sectionName,
    });
    if (insErr) throw new Error(`duplicateDocument.toPlaceholder.ref: ${insErr.message}`);
    blocksPlaceholdered += 1;
    placeholderNotes.add(fragmentName);
  };

  // Spec-referenced blocks: re-link when every referenced field matches a
  // populated target field; otherwise the block becomes a placeholder.
  for (const [blockId, refs] of refsByBlock) {
    const newBlockId = idMap.get(blockId);
    if (!newBlockId) continue;
    const resolved: Array<{ ref: (typeof refs)[number]; targetId: string; versionId: string | null }> = [];
    const missing: string[] = [];
    for (const ref of refs) {
      const name = nameByFieldId.get(ref.field_id) ?? '';
      const target = name ? targetByName.get(name.toLowerCase()) : undefined;
      if (target && target.populated) resolved.push({ ref, targetId: target.id, versionId: target.versionId });
      else missing.push(name || 'a spec field');
    }
    if (missing.length === 0) {
      for (const m of resolved) {
        const { error } = await client.from('block_spec_references').insert({
          workspace_id: ws,
          block_id: newBlockId,
          document_id: newDoc.id,
          field_id: m.targetId,
          field_version_id: m.versionId,
          release_id: m.ref.release_id ?? null,
          reference_type: m.ref.reference_type,
        });
        if (error) throw new Error(`duplicateDocument.relinkSpecRef: ${error.message}`);
      }
      blocksResolved += 1;
    } else {
      await toPlaceholder(newBlockId, missing[0]!, null);
    }
  }

  // Brief-referenced blocks: the target may have no brief, so each becomes a
  // placeholder noting the originating fragment.
  const { data: briefRefs, error: brErr } = await client
    .from('block_brief_references')
    .select('block_id, fragment_key')
    .eq('document_id', sourceDocumentId);
  if (brErr) throw new Error(`duplicateDocument.briefRefs: ${brErr.message}`);
  for (const r of remap((briefRefs ?? []) as Array<{ block_id: string; fragment_key: string }>)) {
    await toPlaceholder(r.newBlockId, r.fragment_key, null);
  }

  // Existing placeholder blocks: carry over, re-pointing product placeholders at
  // the target product (component placeholders keep their workspace-level entity).
  const { data: phRefs, error: phErr } = await client
    .from('placeholder_brief_references')
    .select('block_id, entity_type, entity_id, fragment_key, section_name')
    .eq('document_id', sourceDocumentId);
  if (phErr) throw new Error(`duplicateDocument.placeholderRefs: ${phErr.message}`);
  for (const r of remap(
    (phRefs ?? []) as Array<{
      block_id: string;
      entity_type: string;
      entity_id: string;
      fragment_key: string;
      section_name: string | null;
    }>,
  )) {
    const { error } = await client.from('placeholder_brief_references').insert({
      workspace_id: ws,
      block_id: r.newBlockId,
      document_id: newDoc.id,
      entity_type: r.entity_type,
      entity_id: r.entity_type === 'product' ? targetProductId : r.entity_id,
      fragment_key: r.fragment_key,
      section_name: r.section_name ?? null,
    });
    if (error) throw new Error(`duplicateDocument.copyPlaceholderRef: ${error.message}`);
    blocksCarriedOver += 1;
  }

  return { blocksResolved, blocksPlaceholdered, blocksCarriedOver, placeholderNotes: [...placeholderNotes] };
}
