'use server';

import { revalidatePath } from 'next/cache';
import {
  acceptSourceForEmbed,
  createServiceClient,
  dispatchNotification,
  getActiveWorkspace,
  getDocument,
  getLibraryItem,
  keepOverrideForEmbed,
  overrideSnippetEmbed,
} from '@arther/db';
import {
  blockContentSchema,
  canManageDocumentLifecycle,
  type DocumentId,
  type LibraryItemId,
  type UserId,
  type WorkspaceId,
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
    .select('document_id, library_item_id')
    .eq('block_id', blockId)
    .maybeSingle();
  if (error || !embed) return { error: 'Snippet embed not found.' as const };
  const row = embed as { document_id: string; library_item_id: string };
  const document = await getDocument(supabase, row.document_id as DocumentId);
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
  return {
    supabase,
    userId: user.id as UserId,
    workspaceId: workspace.id,
    document,
    libraryItemId: row.library_item_id as LibraryItemId,
  };
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
    await notifyOverrideCreated(auth);
    revalidatePath(`/documents/${auth.document.id}`);
  } catch {
    return { ok: false, error: 'Could not override the snippet.' };
  }
  return { ok: true };
}

export async function acceptSourceForEmbedAction(blockId: string): Promise<EmbedActionResult> {
  const auth = await authorizeEmbedOwner(blockId);
  if ('error' in auth) return { ok: false, error: auth.error };

  // R.5 — accepting the source re-links the embed to the live snippet; that makes
  // no sense once the source is archived (a frozen static copy has nothing live to
  // follow). The panel hides the action; this guards the path defensively.
  const item = await getLibraryItem(auth.supabase, auth.libraryItemId);
  if (item?.archivedAt) {
    return { ok: false, error: 'The source snippet is archived — this is now a static copy.' };
  }

  try {
    await acceptSourceForEmbed(auth.supabase, { blockId, userId: auth.userId });
    revalidatePath(`/documents/${auth.document.id}`);
  } catch {
    return { ok: false, error: 'Could not accept the source.' };
  }
  return { ok: true };
}

/**
 * R.3b — keep the override on a `source_changed` embed: acknowledge the source
 * moved without adopting it, re-anchoring to the current source version so the
 * embed only re-flags on the next edit. Document-owner gated, like the others.
 */
export async function keepOverrideForEmbedAction(blockId: string): Promise<EmbedActionResult> {
  const auth = await authorizeEmbedOwner(blockId);
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    await keepOverrideForEmbed(auth.supabase, { blockId, userId: auth.userId });
    revalidatePath(`/documents/${auth.document.id}`);
  } catch {
    return { ok: false, error: 'Could not keep the override.' };
  }
  return { ok: true };
}

/**
 * R.3b — tell the snippet's owner that their snippet was overridden in a document
 * (`snippet_override_created`). Best-effort and service-role (the dispatch needs
 * the system write path); never fails the override. The actor and a snippet with
 * no distinct owner are skipped.
 */
async function notifyOverrideCreated(auth: {
  workspaceId: WorkspaceId;
  userId: string;
  document: { id: string; title: string };
  libraryItemId: LibraryItemId;
}): Promise<void> {
  try {
    const service = createServiceClient();
    const item = await getLibraryItem(service, auth.libraryItemId);
    if (!item?.ownerId || item.ownerId === auth.userId) return;
    const { data: actor } = await service
      .from('users')
      .select('name, email')
      .eq('id', auth.userId)
      .maybeSingle();
    await dispatchNotification(service, {
      workspaceId: auth.workspaceId,
      recipientIds: [item.ownerId],
      eventType: 'snippet_override_created',
      payload: {
        documentId: auth.document.id,
        documentTitle: auth.document.title,
        libraryItemId: auth.libraryItemId,
        snippetName: item.name,
        actorName:
          (actor?.name as string | null) ?? (actor?.email as string | undefined) ?? 'Someone',
      },
    });
  } catch {
    // ignore — the override succeeded; the notice is best-effort.
  }
}
