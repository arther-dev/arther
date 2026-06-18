'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCanDo } from '@arther/authz';
import { rateLimit } from '@arther/rate-limit';
import {
  buildFieldResolver,
  buildSectionPrompt,
  createAiGateway,
  regenerateBlock,
  type PromptField,
  type ResolverEntry,
} from '@arther/ai-gateway';
import {
  applyBlockRegeneration,
  createLibraryItem,
  createServiceClient,
  deleteBlock,
  getActiveWorkspace,
  getEntityBrief,
  getLibraryItem,
  insertBlocks,
  insertSnippetEmbed,
  listApprovalRoles,
  listLibraryItems,
  listUnits,
  loadBlockRegenContext,
  loadEditContextForBlock,
  loadEditContextForRevision,
  loadGenerationFields,
  loadRevisionBlocks,
  membershipLookupFor,
  recordAnalyticsEvent,
  recordAuditEvent,
  reorderBlocks,
  saveBlockContent,
  type ActiveWorkspace,
} from '@arther/db';
import {
  blockContentSchema,
  blockPlainText,
  createLibraryItemSchema,
  defaultBlockContent,
  formatFieldValue,
  INSERTABLE_BLOCK_TYPES,
  type BlockContent,
  type BlockId,
  type DocumentId,
  type DocumentRevisionId,
  type FieldVersionId,
  type InsertableBlockType,
  type LibraryItemId,
  type LibraryItemType,
  type SpecFieldId,
  type UserId,
  type WorkspaceId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../../lib/supabase/server';

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface BlockSaveResult extends SaveResult {
  /** The new server version token to use as the next save's expected value. */
  lastEditedAt?: string | null;
  /** Set when another member advanced the block since the editor last saw it. */
  conflict?: { content: BlockContent; lastEditedAt: string | null; lastEditedBy: string | null };
}

export interface InsertResult extends SaveResult {
  block?: { id: string; content: BlockContent; type: string; source: string };
  orderedIds?: string[];
}

type Authorized = {
  supabase: SupabaseClient;
  userId: UserId;
  workspaceId: WorkspaceId;
  workspace: ActiveWorkspace;
};

/** Signed in + a workspace; permission is decided per-action against the state. */
async function authorizeBase(): Promise<Authorized | { error: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace.' };
  return { supabase, userId: user.id as UserId, workspaceId: workspace.id, workspace };
}

/**
 * C0.3 / C1.4 — structural edits (insert / delete / reorder / paste / regenerate)
 * are **Draft-only**: a document in Review/Approved/Published is locked. Gated by
 * the seat right (`doc.write`, or `doc.generate` for regeneration) AND the
 * working revision being in Draft. Pass the block being changed, or the revision.
 */
async function authorizeStructuralEdit(opts: {
  blockId?: string;
  revisionId?: string;
  action?: 'doc.write' | 'doc.generate';
}): Promise<Authorized | { error: string }> {
  const base = await authorizeBase();
  if ('error' in base) return base;
  const action = opts.action ?? 'doc.write';
  const canDo = createCanDo(membershipLookupFor(base.supabase));
  if (!(await canDo({ id: base.userId }, action, { workspaceId: base.workspaceId }))) {
    return { error: 'Viewers can’t edit documents.' };
  }
  const ctx = opts.blockId
    ? await loadEditContextForBlock(base.supabase, opts.blockId as BlockId)
    : await loadEditContextForRevision(base.supabase, opts.revisionId as DocumentRevisionId);
  if (!ctx) return { error: 'Document not found.' };
  if (ctx.state !== 'draft') {
    return { error: `This document is in ${ctx.state} — structural changes need it back in Draft.` };
  }
  return base;
}

/**
 * C1.4 — content edits are allowed for editors in Draft, and for an **assigned
 * approver** in Review (minor corrections — typos/formatting — without a reject
 * cycle, spec §4.3); locked in Approved/Published. Returns whether the save is a
 * logged minor correction.
 */
async function authorizeContentEdit(
  blockId: string,
): Promise<(Authorized & { minorCorrection: boolean; documentId: DocumentId }) | { error: string }> {
  const base = await authorizeBase();
  if ('error' in base) return base;
  const ctx = await loadEditContextForBlock(base.supabase, blockId as BlockId);
  if (!ctx) return { error: 'Block not found.' };
  const canDo = createCanDo(membershipLookupFor(base.supabase));

  if (ctx.state === 'draft') {
    if (!(await canDo({ id: base.userId }, 'doc.write', { workspaceId: base.workspaceId }))) {
      return { error: 'Viewers can’t edit documents.' };
    }
    return { ...base, minorCorrection: false, documentId: ctx.documentId };
  }
  if (ctx.state === 'review') {
    const roles = await listApprovalRoles(base.supabase, ctx.documentTypeId);
    const isApprover = roles.some((r) =>
      r.assignments.some((a) => a.workspace_member_id === base.workspace.membershipId),
    );
    if (!isApprover) {
      return { error: 'This document is in review — only assigned approvers can make corrections.' };
    }
    return { ...base, minorCorrection: true, documentId: ctx.documentId };
  }
  return { error: 'This document is locked and can no longer be edited.' };
}

/**
 * G4.3 — persist one block's edited content. Re-validated through
 * `blockContentSchema` (ADR-012; a malformed tree never reaches the DB), FTS
 * projection recomputed. Called on editor blur; G5 layers debounced auto-save.
 */
export async function updateBlockContentAction(
  blockId: string,
  content: unknown,
  expectedLastEditedAt?: string | null,
): Promise<BlockSaveResult> {
  if (!z.string().uuid().safeParse(blockId).success) return { ok: false, error: 'Invalid block.' };
  const parsed = blockContentSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: 'Invalid block content.' };

  const auth = await authorizeContentEdit(blockId);
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    const outcome = await saveBlockContent(auth.supabase, blockId as BlockId, {
      content: parsed.data,
      textContent: blockPlainText(parsed.data),
      userId: auth.userId,
      expectedLastEditedAt,
    });
    if (outcome.status === 'conflict') {
      // G5.4 — the editor offers block-level keep-mine / use-theirs.
      return { ok: false, conflict: outcome.server, lastEditedAt: outcome.lastEditedAt };
    }
    // C1.4 — an approver's minor correction during Review is logged to the audit
    // trail (best-effort; never fails the save).
    if (auth.minorCorrection) {
      try {
        await recordAuditEvent(
          createServiceClient(),
          { workspaceId: auth.workspaceId },
          {
            action: 'document.minor_correction',
            resourceType: 'block',
            resourceId: blockId,
            actorUserId: auth.userId,
            metadata: { documentId: auth.documentId },
          },
        );
      } catch (e) {
        console.error('[audit] minor_correction failed', e);
      }
    }
    return { ok: true, lastEditedAt: outcome.lastEditedAt };
  } catch {
    return { ok: false, error: 'Could not save the block.' };
  }
}

const addSchema = z.object({
  revisionId: z.string().uuid(),
  documentId: z.string().uuid(),
  afterBlockId: z.string().uuid().nullable(),
  type: z.enum(INSERTABLE_BLOCK_TYPES).default('paragraph'),
});

/** G4.6 — insert an empty block of the chosen type after a block (or at the
 *  end), then reorder. Prose blocks are then edited inline; section header and
 *  divider via the inspector / as-is. */
export async function addBlockAfterAction(input: {
  revisionId: string;
  documentId: string;
  afterBlockId: string | null;
  type?: InsertableBlockType;
}): Promise<InsertResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };
  const auth = await authorizeStructuralEdit({ revisionId: parsed.data.revisionId });
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    const current = await loadRevisionBlocks(auth.supabase, parsed.data.revisionId as DocumentRevisionId);
    const [inserted] = await insertBlocks(auth.supabase, {
      workspaceId: auth.workspaceId,
      documentId: parsed.data.documentId as DocumentId,
      revisionId: parsed.data.revisionId as DocumentRevisionId,
      userId: auth.userId,
      blocks: [
        {
          type: parsed.data.type,
          source: 'manual',
          displayOrder: current.length,
          content: defaultBlockContent(parsed.data.type),
        },
      ],
    });
    if (!inserted) return { ok: false, error: 'Could not add the block.' };

    const existingIds = current.map((b) => b.id as string);
    const at = parsed.data.afterBlockId ? existingIds.indexOf(parsed.data.afterBlockId) : -1;
    const orderedIds = [...existingIds];
    orderedIds.splice(at >= 0 ? at + 1 : existingIds.length, 0, inserted.id as string);
    await reorderBlocks(auth.supabase, orderedIds as BlockId[], auth.userId);

    return {
      ok: true,
      block: {
        id: inserted.id as string,
        content: inserted.content,
        type: inserted.type,
        source: inserted.source,
      },
      orderedIds,
    };
  } catch {
    return { ok: false, error: 'Could not add the block.' };
  }
}

// The scalar envelope stays on classic zod (v3); the block array is validated
// with `blockContentSchema` (zod/v4) standalone — the two zod majors must never
// be mixed in one schema (a v4 schema inside a v3 `z.object` breaks the build).
const pasteEnvelopeSchema = z.object({
  revisionId: z.string().uuid(),
  documentId: z.string().uuid(),
  afterBlockId: z.string().uuid().nullable(),
});
const pasteBlocksSchema = blockContentSchema.array().min(1).max(100);

export interface PasteResult extends SaveResult {
  blocks?: { id: string; content: BlockContent; type: string; source: string }[];
  orderedIds?: string[];
}

/**
 * G4.6 — paste copied blocks (from the editor's localStorage clipboard) after a
 * block, or at the end. Each is re-validated through `blockContentSchema` and
 * inserted as a fresh `manual` block (the content travels, not the source doc's
 * spec/brief references), then the revision is reordered to land them in place.
 */
export async function pasteBlocksAction(input: {
  revisionId: string;
  documentId: string;
  afterBlockId: string | null;
  blocks: unknown[];
}): Promise<PasteResult> {
  const env = pasteEnvelopeSchema.safeParse(input);
  if (!env.success) return { ok: false, error: 'Invalid request.' };
  const parsedBlocks = pasteBlocksSchema.safeParse(input.blocks);
  if (!parsedBlocks.success) return { ok: false, error: 'Invalid request.' };
  const auth = await authorizeStructuralEdit({ revisionId: env.data.revisionId });
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    const current = await loadRevisionBlocks(auth.supabase, env.data.revisionId as DocumentRevisionId);
    const inserted = await insertBlocks(auth.supabase, {
      workspaceId: auth.workspaceId,
      documentId: env.data.documentId as DocumentId,
      revisionId: env.data.revisionId as DocumentRevisionId,
      userId: auth.userId,
      blocks: parsedBlocks.data.map((content, i) => ({
        type: content.type,
        source: 'manual',
        displayOrder: current.length + i,
        content,
        textContent: blockPlainText(content),
      })),
    });
    if (inserted.length === 0) return { ok: false, error: 'Could not paste the blocks.' };

    const existingIds = current.map((b) => b.id as string);
    const newIds = inserted.map((b) => b.id as string);
    const at = env.data.afterBlockId ? existingIds.indexOf(env.data.afterBlockId) : -1;
    const orderedIds = [...existingIds];
    orderedIds.splice(at >= 0 ? at + 1 : existingIds.length, 0, ...newIds);
    await reorderBlocks(auth.supabase, orderedIds as BlockId[], auth.userId);

    return {
      ok: true,
      blocks: inserted.map((b) => ({
        id: b.id as string,
        content: b.content,
        type: b.type,
        source: b.source,
      })),
      orderedIds,
    };
  } catch {
    return { ok: false, error: 'Could not paste the blocks.' };
  }
}

export interface SaveToLibraryResult extends SaveResult {
  /** The new library item id, for linking the author to it. */
  id?: string;
}

const saveToLibraryBlocksSchema = blockContentSchema.array().min(1).max(100);

/**
 * R.2 — the §5.1 promotion flow: turn the editor's selected blocks into a reusable
 * library item (snippet or template). The selected blocks' content travels (the
 * source doc's spec/brief references don't, like the clipboard), is re-validated
 * through `blockContentSchema`, and `createLibraryItem` records the first version.
 * Editor-seat gated (`doc.write`); reading content to promote it doesn't require
 * the document to be in Draft (it doesn't mutate the document — that replacement,
 * for a live snippet embed, is the next R.2 slice). The author gets a link to it.
 */
export async function saveSelectionToLibraryAction(input: {
  name: string;
  type: string;
  blocks: unknown[];
}): Promise<SaveToLibraryResult> {
  const meta = createLibraryItemSchema.safeParse({ name: input.name, type: input.type });
  if (!meta.success) return { ok: false, error: meta.error.issues[0]!.message };
  const blocks = saveToLibraryBlocksSchema.safeParse(input.blocks);
  if (!blocks.success) return { ok: false, error: 'Select one or more valid blocks to save.' };

  const base = await authorizeBase();
  if ('error' in base) return { ok: false, error: base.error };
  const canDo = createCanDo(membershipLookupFor(base.supabase));
  if (!(await canDo({ id: base.userId }, 'doc.write', { workspaceId: base.workspaceId }))) {
    return { ok: false, error: 'Viewers can’t save to the library.' };
  }

  try {
    const id = await createLibraryItem(base.supabase, {
      workspaceId: base.workspaceId,
      userId: base.userId,
      name: meta.data.name,
      type: meta.data.type,
      blocks: blocks.data,
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: 'Could not save to the library.' };
  }
}

export interface LibraryInsertListing {
  id: string;
  name: string;
  type: LibraryItemType;
}
export interface ListLibraryItemsResult extends SaveResult {
  items?: LibraryInsertListing[];
}

/**
 * R.6 — list the workspace's (non-archived) library items for the editor's
 * "Insert from Library" picker. Read-only; any signed-in member of the workspace
 * sees the library (the insert itself is editor-gated below).
 */
export async function listLibraryItemsForInsertAction(): Promise<ListLibraryItemsResult> {
  const base = await authorizeBase();
  if ('error' in base) return { ok: false, error: base.error };
  try {
    const items = await listLibraryItems(base.supabase, base.workspaceId);
    return { ok: true, items: items.map((i) => ({ id: i.id, name: i.name, type: i.type })) };
  } catch {
    return { ok: false, error: 'Could not load the block library.' };
  }
}

const insertTemplateSchema = z.object({
  revisionId: z.string().uuid(),
  documentId: z.string().uuid(),
  afterBlockId: z.string().uuid().nullable(),
  libraryItemId: z.string().uuid(),
});

/**
 * R.6 — insert a **template** from the library as an independent copy (§5.3:
 * copy-on-insert, no live link). Its blocks are placed after the selected block
 * as fresh `manual` blocks — the content travels, like paste. Structural, so it's
 * Draft-only + editor-gated. Snippets (a live `snippet_embeds` link) are a
 * follow-up; only templates are insertable here.
 */
export async function insertTemplateAction(input: {
  revisionId: string;
  documentId: string;
  afterBlockId: string | null;
  libraryItemId: string;
}): Promise<PasteResult> {
  const env = insertTemplateSchema.safeParse(input);
  if (!env.success) return { ok: false, error: 'Invalid request.' };

  const auth = await authorizeStructuralEdit({ revisionId: env.data.revisionId });
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    const item = await getLibraryItem(auth.supabase, env.data.libraryItemId as LibraryItemId);
    if (!item || item.archivedAt) return { ok: false, error: 'That library item isn’t available.' };
    if (item.type !== 'template') {
      return {
        ok: false,
        error: 'Only templates can be inserted as a copy right now — live snippet embedding is coming soon.',
      };
    }
    if (item.blocks.length === 0) return { ok: false, error: 'That template has no content.' };

    const current = await loadRevisionBlocks(auth.supabase, env.data.revisionId as DocumentRevisionId);
    const inserted = await insertBlocks(auth.supabase, {
      workspaceId: auth.workspaceId,
      documentId: env.data.documentId as DocumentId,
      revisionId: env.data.revisionId as DocumentRevisionId,
      userId: auth.userId,
      blocks: item.blocks.map((content, i) => ({
        type: content.type,
        source: 'manual',
        displayOrder: current.length + i,
        content,
        textContent: blockPlainText(content),
      })),
    });
    if (inserted.length === 0) return { ok: false, error: 'Could not insert the template.' };

    const existingIds = current.map((b) => b.id as string);
    const newIds = inserted.map((b) => b.id as string);
    const at = env.data.afterBlockId ? existingIds.indexOf(env.data.afterBlockId) : -1;
    const orderedIds = [...existingIds];
    orderedIds.splice(at >= 0 ? at + 1 : existingIds.length, 0, ...newIds);
    await reorderBlocks(auth.supabase, orderedIds as BlockId[], auth.userId);

    return {
      ok: true,
      blocks: inserted.map((b) => ({
        id: b.id as string,
        content: b.content,
        type: b.type,
        source: b.source,
      })),
      orderedIds,
    };
  } catch {
    return { ok: false, error: 'Could not insert the template.' };
  }
}

/**
 * R.2 — embed a **snippet** from the library as a live transclusion (§5.3): a
 * single `source='snippet'` placement block + a `snippet_embeds` row. The doc
 * keeps a reference (not a copy), so source edits propagate; the blocks are
 * materialized at publish. Structural, so Draft-only + editor-gated.
 */
export async function insertSnippetEmbedAction(input: {
  revisionId: string;
  documentId: string;
  afterBlockId: string | null;
  libraryItemId: string;
}): Promise<PasteResult> {
  const env = insertTemplateSchema.safeParse(input);
  if (!env.success) return { ok: false, error: 'Invalid request.' };

  const auth = await authorizeStructuralEdit({ revisionId: env.data.revisionId });
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    const res = await insertSnippetEmbed(auth.supabase, {
      workspaceId: auth.workspaceId,
      documentId: env.data.documentId as DocumentId,
      revisionId: env.data.revisionId as DocumentRevisionId,
      libraryItemId: env.data.libraryItemId as LibraryItemId,
      afterBlockId: env.data.afterBlockId,
      userId: auth.userId,
    });
    if ('error' in res) {
      const message =
        res.error === 'not_snippet'
          ? 'That item is a template — insert it as a copy instead.'
          : res.error === 'archived'
            ? 'That snippet is archived.'
            : res.error === 'empty'
              ? 'That snippet has no content.'
              : 'That snippet isn’t available.';
      return { ok: false, error: message };
    }
    return { ok: true, blocks: [res.block], orderedIds: res.orderedIds };
  } catch {
    return { ok: false, error: 'Could not embed the snippet.' };
  }
}

export async function deleteBlockAction(blockId: string): Promise<SaveResult> {
  if (!z.string().uuid().safeParse(blockId).success) return { ok: false, error: 'Invalid block.' };
  const auth = await authorizeStructuralEdit({ blockId });
  if ('error' in auth) return { ok: false, error: auth.error };
  try {
    await deleteBlock(auth.supabase, blockId as BlockId);
  } catch {
    return { ok: false, error: 'Could not delete the block.' };
  }
  return { ok: true };
}

export async function reorderBlocksAction(orderedBlockIds: string[]): Promise<SaveResult> {
  const parsed = z.array(z.string().uuid()).min(1).max(1000).safeParse(orderedBlockIds);
  if (!parsed.success) return { ok: false, error: 'Invalid order.' };
  // The blocks share a revision; authorize the lock against the first one.
  const auth = await authorizeStructuralEdit({ blockId: parsed.data[0] });
  if ('error' in auth) return { ok: false, error: auth.error };
  try {
    await reorderBlocks(auth.supabase, parsed.data as BlockId[], auth.userId);
  } catch {
    return { ok: false, error: 'Could not reorder the blocks.' };
  }
  return { ok: true };
}

/** Prose blocks whose surrounding text a spec change can semantically affect. */
const REGENERATABLE_TYPES = new Set(['paragraph', 'callout']);

export interface RegenerateResult extends SaveResult {
  content?: BlockContent;
}

/**
 * G7.1 — regenerate a single prose block against the current spec graph, reusing
 * the section contract (`regenerateBlock` → the same zero-hallucination gate as
 * generation). Manual today (the editor button), and the resolution for a
 * staleness-flagged block. Runs inline behind `doc.generate`; degrades honestly
 * without `ANTHROPIC_API_KEY`. Moves to the Trigger.dev runner with G1.2.
 */
export async function regenerateBlockAction(blockId: string): Promise<RegenerateResult> {
  if (!z.string().uuid().safeParse(blockId).success) return { ok: false, error: 'Invalid block.' };

  const auth = await authorizeStructuralEdit({ blockId, action: 'doc.generate' });
  if ('error' in auth) return { ok: false, error: auth.error };

  const ctx = await loadBlockRegenContext(auth.supabase, blockId as BlockId);
  if (!ctx) return { ok: false, error: 'Block not found.' };
  if (!REGENERATABLE_TYPES.has(ctx.blockType)) {
    return { ok: false, error: 'This block type can’t be regenerated yet.' };
  }

  const gateway = createAiGateway({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (!gateway.provisioned) return { ok: false, error: 'Not configured in this environment yet.' };

  // G8.5 — block regeneration is a paid AI call; share the per-member generation budget.
  const throttle = await rateLimit('generation', auth.userId);
  if (!throttle.success) {
    return { ok: false, error: `Too many generations in a short window — wait ${throttle.retryAfterSeconds}s.` };
  }

  try {
    const [fields, units, brief, product] = await Promise.all([
      loadGenerationFields(auth.supabase, ctx.productId),
      listUnits(auth.supabase, auth.workspaceId),
      getEntityBrief(auth.supabase, 'product', ctx.productId),
      auth.supabase.from('products').select('name').eq('id', ctx.productId).maybeSingle(),
    ]);

    const unitSymbol = new Map(units.map((u) => [u.id, u.symbol]));
    const display = (f: (typeof fields)[number]) =>
      formatFieldValue(f.type, f.value, f.unit_id ? unitSymbol.get(f.unit_id) : undefined);

    // Only fields with a current version (a real value) are citable.
    const citable = fields.filter((f) => f.current_version_id !== null);
    const resolverEntries: ResolverEntry[] = citable.map((f) => ({
      fieldId: f.id,
      fieldVersionId: f.current_version_id as string,
      displayValue: display(f),
      unitId: f.unit_id,
      productId: ctx.productId,
      componentId: f.component_id,
    }));
    const resolve = buildFieldResolver(resolverEntries);
    const versionByField = new Map(resolverEntries.map((e) => [e.fieldId, e.fieldVersionId]));
    const promptFields: PromptField[] = citable.map((f) => ({
      fieldId: f.id,
      name: f.name,
      category: f.category,
      value: display(f),
      owner: f.owner === 'component' ? (f.component_name ?? 'component') : 'product',
    }));

    const prompt = buildSectionPrompt({
      documentTypeName: 'the document',
      productName: (product.data?.name as string) ?? 'Product',
      sectionName: ctx.sectionName,
      fields: promptFields,
      briefFragments: brief.fragments.map((fr) => ({ key: fr.key, content: fr.content })),
      focus: { blockType: ctx.blockType, currentText: ctx.currentText },
    });

    const outcome = await regenerateBlock(gateway, { blockType: ctx.blockType, prompt }, resolve);
    if (outcome.status !== 'succeeded' || !outcome.block) {
      return { ok: false, error: 'Could not regenerate this block from the current spec.' };
    }

    const refs = (outcome.block.specRefs ?? [])
      .map((r) => ({ fieldId: r.fieldId, fieldVersionId: versionByField.get(r.fieldId) }))
      .filter((r): r is { fieldId: SpecFieldId; fieldVersionId: string } => Boolean(r.fieldVersionId))
      .map((r) => ({ fieldId: r.fieldId, fieldVersionId: r.fieldVersionId as FieldVersionId }));

    await applyBlockRegeneration(auth.supabase, {
      blockId: blockId as BlockId,
      documentId: ctx.documentId,
      workspaceId: auth.workspaceId,
      content: outcome.block.content,
      textContent: outcome.block.textContent ?? blockPlainText(outcome.block.content),
      refs,
      userId: auth.userId,
    });

    // G8.2 — metering hook (best-effort; never fails the regeneration).
    try {
      await recordAnalyticsEvent(
        createServiceClient(),
        { workspaceId: auth.workspaceId },
        {
          eventType: 'block_regenerated',
          actorUserId: auth.userId,
          documentId: ctx.documentId,
          payload: { blockId, blockType: ctx.blockType },
        },
      );
    } catch (e) {
      console.error('[analytics] block_regenerated failed', e);
    }

    return { ok: true, content: outcome.block.content };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === 'EnvNotProvisionedError'
          ? 'Not configured in this environment yet.'
          : 'Could not regenerate the block.',
    };
  }
}
