'use server';

import { revalidatePath } from 'next/cache';
import {
  acceptSourceForEmbed,
  getActiveWorkspace,
  getDocument,
  overrideSnippetEmbed,
} from '@arther/db';
import {
  blockContentSchema,
  canManageDocumentLifecycle,
  type DocumentId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../../lib/supabase/server';

export interface EmbedActionResult {
  ok: boolean;
  error?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const overrideBlocksSchema = blockContentSchema.array().min(1).max(200);

/**
 * R.3 — overriding (and accepting-source on) a snippet embed is a **document
 * owner** action (spec §3.4/§4.2: `override_created_by` must be the owner). We
 * resolve the embed → its document → owner and gate on `canManageDocumentLifecycle`
 * (owner or workspace admin), not just the editor seat.
 */
async function authorizeEmbedOwner(blockId: string) {
  if (!UUID_RE.test(blockId)) return { error: 'Invalid embed.' as const };
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet.' as const };

  const { data: embed, error } = await supabase
    .from('snippet_embeds')
    .select('document_id')
    .eq('block_id', blockId)
    .maybeSingle();
  if (error || !embed) return { error: 'Snippet embed not found.' as const };
  const document = await getDocument(supabase, (embed as { document_id: string }).document_id as DocumentId);
  if (!document) return { error: 'Document not found.' as const };
  if (
    !canManageDocumentLifecycle({
      documentOwnerId: document.owner_id,
      userId: user.id,
      role: workspace.role,
    })
  ) {
    return { error: 'Only the document owner can override snippets in it.' as const };
  }
  return { supabase, userId: user.id as UserId, workspaceId: workspace.id, document };
}

export async function overrideSnippetEmbedAction(
  blockId: string,
  blocks: unknown[],
): Promise<EmbedActionResult> {
  const parsed = overrideBlocksSchema.safeParse(blocks);
  if (!parsed.success) return { ok: false, error: 'Add at least one block, and check each one’s content.' };

  const auth = await authorizeEmbedOwner(blockId);
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    await overrideSnippetEmbed(auth.supabase, {
      workspaceId: auth.workspaceId,
      blockId,
      overrideBlocks: parsed.data,
      userId: auth.userId,
    });
    // R.3b — notify the snippet owner of the override (snippet.override_created).
    revalidatePath(`/documents/${auth.document.id}`);
  } catch {
    return { ok: false, error: 'Could not override the snippet.' };
  }
  return { ok: true };
}

export async function acceptSourceForEmbedAction(blockId: string): Promise<EmbedActionResult> {
  const auth = await authorizeEmbedOwner(blockId);
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    await acceptSourceForEmbed(auth.supabase, { blockId, userId: auth.userId });
    revalidatePath(`/documents/${auth.document.id}`);
  } catch {
    return { ok: false, error: 'Could not accept the source.' };
  }
  return { ok: true };
}
