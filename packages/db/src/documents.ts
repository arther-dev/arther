import type { SupabaseClient } from '@supabase/supabase-js';
import {
  blockContentSchema,
  blockBriefReferenceInputSchema,
  blockSpecReferenceInputSchema,
  blockTextContentSchema,
  degradationConfigSchema,
  placeholderBriefReferenceInputSchema,
  slugifyTitle,
  type BlockBriefReferenceId,
  type BlockContent,
  type BlockId,
  type BlockInput,
  type BlockReferenceType,
  type BlockSource,
  type BlockSpecReferenceId,
  type BlockType,
  type BrandProfileId,
  type BriefEntityType,
  type DegradationConfig,
  type DocumentId,
  type DocumentRevisionId,
  type DocumentState,
  type DocumentTypeId,
  type FieldVersionId,
  type PlaceholderBriefReferenceId,
  type ProductBriefId,
  type ProductId,
  type ReleaseId,
  type SpecFieldId,
  type UserId,
  type WorkspaceId,
} from '@arther/types';

/**
 * Documents & blocks repository (G3, migration 0005) over the user-JWT client —
 * RLS is active on every call (ADR-010): members read, editors write. This is
 * the persistence spine the generator (G2) commits into and the editor (G4)
 * reads/writes; the durable generation pipeline writes through the same tables
 * via the service client.
 *
 * Persistence model (see `@arther/types` document.ts): a top-level block is one
 * `blocks` row ordered by `display_order`; container interiors live inline in
 * `content`. `parent_block_id` is reserved (null this phase). Every block write
 * is Zod-gated through `blockContentSchema` so `blocks.content` can never hold a
 * shape the editor/renderer can't read (ADR-012).
 *
 * `createDocument` is a three-step PostgREST sequence (document → first revision
 * → wire `current_revision_id`), not atomic — acceptable for an authoring
 * action; the all-or-nothing path is the G2.6 generation-commit RPC. A failed
 * third step leaves `current_revision_id` null (a valid, nullable state).
 */

const DOCUMENT_COLUMNS =
  'id, workspace_id, product_id, document_type_id, brand_profile_id, title, slug, owner_id, current_revision_id, archived_at, created_at';
const REVISION_COLUMNS = 'id, document_id, revision_number, state, created_at';
const BLOCK_COLUMNS =
  'id, document_id, revision_id, type, parent_block_id, display_order, source, content, degradation, text_content, last_edited_at, last_edited_by';
const SPEC_REFERENCE_COLUMNS =
  'id, block_id, document_id, field_id, field_version_id, release_id, reference_type';

export interface DocumentRow {
  id: DocumentId;
  workspace_id: WorkspaceId;
  product_id: ProductId;
  document_type_id: DocumentTypeId;
  brand_profile_id: BrandProfileId | null;
  title: string;
  slug: string;
  owner_id: UserId | null;
  current_revision_id: DocumentRevisionId | null;
  archived_at: string | null;
  created_at: string;
}

export interface DocumentRevisionRow {
  id: DocumentRevisionId;
  document_id: DocumentId;
  revision_number: number;
  state: DocumentState;
  created_at: string;
}

export interface BlockRow {
  id: BlockId;
  document_id: DocumentId;
  revision_id: DocumentRevisionId;
  type: BlockType;
  parent_block_id: BlockId | null;
  display_order: number;
  source: BlockSource;
  content: BlockContent;
  degradation: DegradationConfig | Record<string, never>;
  text_content: string | null;
  /** Optimistic-lock version token (G5.1/G5.4): the last write's timestamp. */
  last_edited_at: string | null;
  last_edited_by: UserId | null;
}

export interface BlockSpecReferenceRow {
  id: BlockSpecReferenceId;
  block_id: BlockId;
  document_id: DocumentId;
  field_id: SpecFieldId;
  field_version_id: FieldVersionId;
  release_id: ReleaseId | null;
  reference_type: BlockReferenceType;
}

/** A reference whose anchored version is no longer the field's current one. */
export interface StaleSpecReference {
  referenceId: BlockSpecReferenceId;
  blockId: BlockId;
  documentId: DocumentId;
  fieldId: SpecFieldId;
  referencedVersionId: FieldVersionId;
  currentVersionId: FieldVersionId;
}

// --- Documents & revisions (G3.1) --------------------------------------------

/** Create a document and its first (draft) revision, wiring the current pointer. */
export async function createDocument(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    documentTypeId: DocumentTypeId;
    title: string;
    brandProfileId?: BrandProfileId | null;
    ownerId: UserId;
    createdBy: UserId;
  },
): Promise<{ document: DocumentRow; revision: DocumentRevisionRow }> {
  const base = slugifyTitle(input.title);
  let document: DocumentRow | null = null;
  for (const slug of [base, `${base}-${crypto.randomUUID().slice(0, 6)}`]) {
    const { data, error } = await client
      .from('documents')
      .insert({
        workspace_id: input.workspaceId,
        product_id: input.productId,
        document_type_id: input.documentTypeId,
        brand_profile_id: input.brandProfileId ?? null,
        title: input.title,
        slug,
        owner_id: input.ownerId,
        created_by: input.createdBy,
      })
      .select(DOCUMENT_COLUMNS)
      .single();
    if (!error) {
      document = data as DocumentRow;
      break;
    }
    // A clashing per-product slug gets one suffixed retry; anything else throws.
    if (error.code !== '23505') throw new Error(`createDocument: ${error.message}`);
  }
  if (!document) throw new Error('createDocument: could not allocate a unique slug');

  const { data: revisionData, error: revisionError } = await client
    .from('document_revisions')
    .insert({
      workspace_id: input.workspaceId,
      document_id: document.id,
      revision_number: 1,
      state: 'draft',
      created_by: input.createdBy,
    })
    .select(REVISION_COLUMNS)
    .single();
  if (revisionError) throw new Error(`createDocument.revision: ${revisionError.message}`);
  const revision = revisionData as DocumentRevisionRow;

  const { error: pointerError } = await client
    .from('documents')
    .update({ current_revision_id: revision.id })
    .eq('id', document.id);
  if (pointerError) throw new Error(`createDocument.pointer: ${pointerError.message}`);

  return { document: { ...document, current_revision_id: revision.id }, revision };
}

export async function getDocument(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<DocumentRow | null> {
  const { data, error } = await client
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .maybeSingle();
  if (error) throw new Error(`getDocument: ${error.message}`);
  return (data as DocumentRow) ?? null;
}

/** Live (non-archived) documents for a product, newest first. */
export async function listDocumentsForProduct(
  client: SupabaseClient,
  productId: ProductId,
): Promise<DocumentRow[]> {
  const { data, error } = await client
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('product_id', productId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listDocumentsForProduct: ${error.message}`);
  return (data ?? []) as DocumentRow[];
}

export async function setDocumentArchived(
  client: SupabaseClient,
  documentId: DocumentId,
  archived: boolean,
  userId: UserId,
): Promise<void> {
  const { error } = await client
    .from('documents')
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      archived_by: archived ? userId : null,
    })
    .eq('id', documentId);
  if (error) throw new Error(`setDocumentArchived: ${error.message}`);
}

// --- Block tree (G3.2) --------------------------------------------------------

/** Validate and persist a batch of top-level blocks into a revision. */
export async function insertBlocks(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentId: DocumentId;
    revisionId: DocumentRevisionId;
    blocks: BlockInput[];
    userId: UserId;
  },
): Promise<BlockRow[]> {
  if (input.blocks.length === 0) return [];
  const rows = input.blocks.map((block) => {
    const content = blockContentSchema.parse(block.content);
    if (content.type !== block.type) {
      throw new Error(
        `insertBlocks: block.type "${block.type}" does not match content.type "${content.type}"`,
      );
    }
    const degradation = block.degradation ? degradationConfigSchema.parse(block.degradation) : {};
    const textContent =
      block.textContent != null ? blockTextContentSchema.parse(block.textContent) : null;
    return {
      workspace_id: input.workspaceId,
      document_id: input.documentId,
      revision_id: input.revisionId,
      type: block.type,
      display_order: block.displayOrder,
      source: block.source,
      content,
      degradation,
      text_content: textContent,
      created_by: input.userId,
    };
  });
  const { data, error } = await client.from('blocks').insert(rows).select(BLOCK_COLUMNS);
  if (error) throw new Error(`insertBlocks: ${error.message}`);
  return (data ?? []) as BlockRow[];
}

/** A revision's top-level blocks in display order (container interiors are in `content`). */
export async function loadRevisionBlocks(
  client: SupabaseClient,
  revisionId: DocumentRevisionId,
): Promise<BlockRow[]> {
  const { data, error } = await client
    .from('blocks')
    .select(BLOCK_COLUMNS)
    .eq('revision_id', revisionId)
    .order('display_order', { ascending: true });
  if (error) throw new Error(`loadRevisionBlocks: ${error.message}`);
  return (data ?? []) as BlockRow[];
}

export async function updateBlock(
  client: SupabaseClient,
  blockId: BlockId,
  patch: {
    content?: BlockContent;
    textContent?: string | null;
    displayOrder?: number;
    userId: UserId;
  },
): Promise<void> {
  const update: Record<string, unknown> = {
    last_edited_by: patch.userId,
    last_edited_at: new Date().toISOString(),
  };
  if (patch.content !== undefined) update.content = blockContentSchema.parse(patch.content);
  if (patch.textContent !== undefined)
    update.text_content = patch.textContent == null ? null : blockTextContentSchema.parse(patch.textContent);
  if (patch.displayOrder !== undefined) update.display_order = patch.displayOrder;
  const { error } = await client.from('blocks').update(update).eq('id', blockId);
  if (error) throw new Error(`updateBlock: ${error.message}`);
}

export interface BlockSaveOutcome {
  status: 'saved' | 'conflict';
  /** The block's new (saved) or current (conflict) version token. */
  lastEditedAt: string | null;
  /** On conflict, the server's current state so the client can offer use-theirs. */
  server?: { content: BlockContent; lastEditedAt: string | null; lastEditedBy: UserId | null };
}

/**
 * G5.1/G5.4 — optimistic-locked content save. When `expectedLastEditedAt` is
 * given, the write only lands if the block's version token still matches what the
 * editor last saw (a conditional UPDATE); if another member advanced it meanwhile
 * the write is refused and the server's current block is returned so the editor
 * can offer block-level keep-mine / use-theirs. With no expected token (a block
 * the editor has no version for yet) it writes unconditionally. The returned
 * `lastEditedAt` is the canonical server value to use as the next expected token.
 */
export async function saveBlockContent(
  client: SupabaseClient,
  blockId: BlockId,
  input: {
    content: BlockContent;
    textContent: string | null;
    userId: UserId;
    expectedLastEditedAt?: string | null;
  },
): Promise<BlockSaveOutcome> {
  const update = {
    content: blockContentSchema.parse(input.content),
    text_content: input.textContent == null ? null : blockTextContentSchema.parse(input.textContent),
    last_edited_by: input.userId,
    last_edited_at: new Date().toISOString(),
  };

  let query = client.from('blocks').update(update).eq('id', blockId);
  if (input.expectedLastEditedAt !== undefined) {
    query =
      input.expectedLastEditedAt === null
        ? query.is('last_edited_at', null)
        : query.eq('last_edited_at', input.expectedLastEditedAt);
  }
  const { data, error } = await query.select('last_edited_at');
  if (error) throw new Error(`saveBlockContent: ${error.message}`);

  if ((data ?? []).length === 1) {
    return { status: 'saved', lastEditedAt: (data![0]!.last_edited_at as string | null) ?? null };
  }

  // No row updated — the version moved (or the block is gone). Read it back so
  // the editor can show the conflicting server state.
  const { data: current, error: readErr } = await client
    .from('blocks')
    .select('content, last_edited_at, last_edited_by')
    .eq('id', blockId)
    .maybeSingle();
  if (readErr) throw new Error(`saveBlockContent(read): ${readErr.message}`);
  if (!current) return { status: 'conflict', lastEditedAt: null };
  return {
    status: 'conflict',
    lastEditedAt: (current.last_edited_at as string | null) ?? null,
    server: {
      content: current.content as BlockContent,
      lastEditedAt: (current.last_edited_at as string | null) ?? null,
      lastEditedBy: (current.last_edited_by as UserId | null) ?? null,
    },
  };
}

export async function deleteBlock(client: SupabaseClient, blockId: BlockId): Promise<void> {
  const { error } = await client.from('blocks').delete().eq('id', blockId);
  if (error) throw new Error(`deleteBlock: ${error.message}`);
}

/** Rewrite `display_order` to the given block order (0-based) — the reorder spine (G4.6). */
export async function reorderBlocks(
  client: SupabaseClient,
  orderedBlockIds: BlockId[],
  userId: UserId,
): Promise<void> {
  for (let i = 0; i < orderedBlockIds.length; i += 1) {
    const { error } = await client
      .from('blocks')
      .update({ display_order: i, last_edited_by: userId, last_edited_at: new Date().toISOString() })
      .eq('id', orderedBlockIds[i]!);
    if (error) throw new Error(`reorderBlocks: ${error.message}`);
  }
}

// --- Reference tables (G3.3) --------------------------------------------------

export async function addSpecReference(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentId: DocumentId;
    blockId: BlockId;
    fieldId: SpecFieldId;
    fieldVersionId: FieldVersionId;
    releaseId?: ReleaseId | null;
    referenceType?: BlockReferenceType;
  },
): Promise<BlockSpecReferenceId> {
  const ref = blockSpecReferenceInputSchema.parse({
    blockId: input.blockId,
    fieldId: input.fieldId,
    fieldVersionId: input.fieldVersionId,
    releaseId: input.releaseId ?? undefined,
    referenceType: input.referenceType,
  });
  const { data, error } = await client
    .from('block_spec_references')
    .insert({
      workspace_id: input.workspaceId,
      document_id: input.documentId,
      block_id: ref.blockId,
      field_id: ref.fieldId,
      field_version_id: ref.fieldVersionId,
      release_id: ref.releaseId ?? null,
      reference_type: ref.referenceType,
    })
    .select('id')
    .single();
  if (error) throw new Error(`addSpecReference: ${error.message}`);
  return data.id as BlockSpecReferenceId;
}

export async function addBriefReference(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentId: DocumentId;
    blockId: BlockId;
    briefId: ProductBriefId;
    fragmentKey: string;
    contentSnapshot?: string;
  },
): Promise<BlockBriefReferenceId> {
  const ref = blockBriefReferenceInputSchema.parse({
    blockId: input.blockId,
    briefId: input.briefId,
    fragmentKey: input.fragmentKey,
    contentSnapshot: input.contentSnapshot,
  });
  const { data, error } = await client
    .from('block_brief_references')
    .insert({
      workspace_id: input.workspaceId,
      document_id: input.documentId,
      block_id: ref.blockId,
      brief_id: ref.briefId,
      fragment_key: ref.fragmentKey,
      content_snapshot: ref.contentSnapshot ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`addBriefReference: ${error.message}`);
  return data.id as BlockBriefReferenceId;
}

export async function addPlaceholderReference(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentId: DocumentId;
    blockId: BlockId;
    entityType: BriefEntityType;
    entityId: string;
    fragmentKey: string;
    sectionName?: string;
  },
): Promise<PlaceholderBriefReferenceId> {
  const ref = placeholderBriefReferenceInputSchema.parse({
    blockId: input.blockId,
    entityType: input.entityType,
    entityId: input.entityId,
    fragmentKey: input.fragmentKey,
    sectionName: input.sectionName,
  });
  const { data, error } = await client
    .from('placeholder_brief_references')
    .insert({
      workspace_id: input.workspaceId,
      document_id: input.documentId,
      block_id: ref.blockId,
      entity_type: ref.entityType,
      entity_id: ref.entityId,
      fragment_key: ref.fragmentKey,
      section_name: ref.sectionName ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`addPlaceholderReference: ${error.message}`);
  return data.id as PlaceholderBriefReferenceId;
}

export async function listSpecReferences(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<BlockSpecReferenceRow[]> {
  const { data, error } = await client
    .from('block_spec_references')
    .select(SPEC_REFERENCE_COLUMNS)
    .eq('document_id', documentId);
  if (error) throw new Error(`listSpecReferences: ${error.message}`);
  return (data ?? []) as BlockSpecReferenceRow[];
}

// --- Round-trip read & staleness ---------------------------------------------

export interface DocumentTree {
  document: DocumentRow;
  revision: DocumentRevisionRow;
  blocks: BlockRow[];
  specReferences: BlockSpecReferenceRow[];
}

/** A document with its current revision, block tree, and spec references (the G3 round-trip). */
export async function loadDocumentTree(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<DocumentTree | null> {
  const document = await getDocument(client, documentId);
  if (!document || !document.current_revision_id) return null;

  const { data: revisionData, error: revisionError } = await client
    .from('document_revisions')
    .select(REVISION_COLUMNS)
    .eq('id', document.current_revision_id)
    .maybeSingle();
  if (revisionError) throw new Error(`loadDocumentTree.revision: ${revisionError.message}`);
  if (!revisionData) return null;
  const revision = revisionData as DocumentRevisionRow;

  const [blocks, specReferences] = await Promise.all([
    loadRevisionBlocks(client, revision.id),
    listSpecReferences(client, documentId),
  ]);
  return { document, revision, blocks, specReferences };
}

/**
 * Spec references whose anchored version is no longer the field's current one —
 * the staleness join (`field_version_id <> spec_fields.current_version_id`).
 * The full two-speed detection/propagation is G6.1; this is the foundational
 * read the acceptance ("the staleness join returns affected blocks") rests on.
 */
export async function listStaleSpecReferences(
  client: SupabaseClient,
  scope: { workspaceId: WorkspaceId; documentId?: DocumentId },
): Promise<StaleSpecReference[]> {
  let query = client
    .from('block_spec_references')
    .select('id, block_id, document_id, field_id, field_version_id, spec_fields!inner(current_version_id)')
    .eq('workspace_id', scope.workspaceId);
  if (scope.documentId) query = query.eq('document_id', scope.documentId);
  const { data, error } = await query;
  if (error) throw new Error(`listStaleSpecReferences: ${error.message}`);

  const stale: StaleSpecReference[] = [];
  for (const row of (data ?? []) as Array<{
    id: string;
    block_id: string;
    document_id: string;
    field_id: string;
    field_version_id: string;
    spec_fields: { current_version_id: string | null } | { current_version_id: string | null }[];
  }>) {
    const field = Array.isArray(row.spec_fields) ? row.spec_fields[0] : row.spec_fields;
    const current = field?.current_version_id ?? null;
    if (current && current !== row.field_version_id) {
      stale.push({
        referenceId: row.id as BlockSpecReferenceId,
        blockId: row.block_id as BlockId,
        documentId: row.document_id as DocumentId,
        fieldId: row.field_id as SpecFieldId,
        referencedVersionId: row.field_version_id as FieldVersionId,
        currentVersionId: current as FieldVersionId,
      });
    }
  }
  return stale;
}
