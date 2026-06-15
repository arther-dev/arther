'use server';

import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import { getActiveWorkspace, membershipLookupFor, updateBlock } from '@arther/db';
import { blockContentSchema, blockPlainText, type BlockId, type UserId } from '@arther/types';
import { getSupabaseServer } from '../../../../../lib/supabase/server';

export interface SaveResult {
  ok: boolean;
  error?: string;
}

/**
 * G4.3 — persist one block's edited content. The content is re-validated through
 * `blockContentSchema` at the boundary (ADR-012; a malformed tree never reaches
 * the DB), the FTS projection is recomputed, and the write is editor-gated
 * (`doc.write`) with RLS behind it. Called imperatively on editor blur; G5 wires
 * the debounced auto-save + offline queue on top of this.
 */
export async function updateBlockContentAction(blockId: string, content: unknown): Promise<SaveResult> {
  if (!z.string().uuid().safeParse(blockId).success) return { ok: false, error: 'Invalid block.' };

  const parsed = blockContentSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: 'Invalid block content.' };

  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { ok: false, error: 'No workspace.' };

  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.write', { workspaceId: workspace.id }))) {
    return { ok: false, error: 'Viewers can’t edit documents.' };
  }

  try {
    await updateBlock(supabase, blockId as BlockId, {
      content: parsed.data,
      textContent: blockPlainText(parsed.data),
      userId: user.id as UserId,
    });
  } catch {
    return { ok: false, error: 'Could not save the block.' };
  }
  return { ok: true };
}
