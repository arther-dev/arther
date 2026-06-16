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
  deleteBlock,
  getActiveWorkspace,
  getEntityBrief,
  insertBlocks,
  listUnits,
  loadBlockRegenContext,
  loadGenerationFields,
  loadRevisionBlocks,
  membershipLookupFor,
  reorderBlocks,
  updateBlock,
} from '@arther/db';
import {
  blockContentSchema,
  blockPlainText,
  defaultBlockContent,
  formatFieldValue,
  INSERTABLE_BLOCK_TYPES,
  type BlockContent,
  type BlockId,
  type DocumentId,
  type DocumentRevisionId,
  type FieldVersionId,
  type InsertableBlockType,
  type SpecFieldId,
  type UserId,
  type WorkspaceId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../../lib/supabase/server';

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface InsertResult extends SaveResult {
  block?: { id: string; content: BlockContent; type: string; source: string };
  orderedIds?: string[];
}

type Authorized = { supabase: SupabaseClient; userId: UserId; workspaceId: WorkspaceId };

/**
 * Every document mutation is editor-gated with RLS behind it. Defaults to
 * `doc.write`; regeneration (a model call) gates on `doc.generate`, matching the
 * generation flow.
 */
async function authorizeDocWrite(
  action: 'doc.write' | 'doc.generate' = 'doc.write',
): Promise<Authorized | { error: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace.' };
  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, action, { workspaceId: workspace.id }))) {
    return { error: 'Viewers can’t edit documents.' };
  }
  return { supabase, userId: user.id as UserId, workspaceId: workspace.id };
}

/**
 * G4.3 — persist one block's edited content. Re-validated through
 * `blockContentSchema` (ADR-012; a malformed tree never reaches the DB), FTS
 * projection recomputed. Called on editor blur; G5 layers debounced auto-save.
 */
export async function updateBlockContentAction(blockId: string, content: unknown): Promise<SaveResult> {
  if (!z.string().uuid().safeParse(blockId).success) return { ok: false, error: 'Invalid block.' };
  const parsed = blockContentSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: 'Invalid block content.' };

  const auth = await authorizeDocWrite();
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    await updateBlock(auth.supabase, blockId as BlockId, {
      content: parsed.data,
      textContent: blockPlainText(parsed.data),
      userId: auth.userId,
    });
  } catch {
    return { ok: false, error: 'Could not save the block.' };
  }
  return { ok: true };
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
  const auth = await authorizeDocWrite();
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

export async function deleteBlockAction(blockId: string): Promise<SaveResult> {
  if (!z.string().uuid().safeParse(blockId).success) return { ok: false, error: 'Invalid block.' };
  const auth = await authorizeDocWrite();
  if ('error' in auth) return { ok: false, error: auth.error };
  try {
    await deleteBlock(auth.supabase, blockId as BlockId);
  } catch {
    return { ok: false, error: 'Could not delete the block.' };
  }
  return { ok: true };
}

export async function reorderBlocksAction(orderedBlockIds: string[]): Promise<SaveResult> {
  const parsed = z.array(z.string().uuid()).max(1000).safeParse(orderedBlockIds);
  if (!parsed.success) return { ok: false, error: 'Invalid order.' };
  const auth = await authorizeDocWrite();
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

  const auth = await authorizeDocWrite('doc.generate');
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
