'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCanDo } from '@arther/authz';
import {
  deleteBlock,
  getActiveWorkspace,
  insertBlocks,
  loadRevisionBlocks,
  membershipLookupFor,
  reorderBlocks,
  updateBlock,
} from '@arther/db';
import {
  blockContentSchema,
  blockPlainText,
  type BlockContent,
  type BlockId,
  type DocumentId,
  type DocumentRevisionId,
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

/** Every document mutation is editor-gated (`doc.write`) with RLS behind it. */
async function authorizeDocWrite(): Promise<Authorized | { error: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace.' };
  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.write', { workspaceId: workspace.id }))) {
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
});

/** G4.6 — insert an empty paragraph after a block (or at the end), then reorder. */
export async function addBlockAfterAction(input: {
  revisionId: string;
  documentId: string;
  afterBlockId: string | null;
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
          type: 'paragraph',
          source: 'manual',
          displayOrder: current.length,
          content: { type: 'paragraph', content: { alignment: 'left', nodes: [] } },
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
