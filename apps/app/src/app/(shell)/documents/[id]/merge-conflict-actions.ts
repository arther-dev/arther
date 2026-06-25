'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo } from '@arther/authz';
import {
  getDocument,
  listMergeConflicts,
  membershipLookupFor,
  resolveMergeConflict,
} from '@arther/db';
import type { DocumentId, UserId } from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConflictActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Editor gate for resolving a document's merge conflicts (V.6). Authorizes against
 * the DOCUMENT'S OWN workspace (not the caller's active workspace) so a user who's
 * an editor in several workspaces can't resolve a conflict outside the document
 * they're acting on. `getDocument` is RLS-scoped (returns null unless the caller is
 * a member), so a non-member never gets past it.
 */
async function authorize(documentId: string) {
  if (!UUID_RE.test(documentId)) return { error: 'Invalid document.' as const };
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const document = await getDocument(supabase, documentId as DocumentId);
  if (!document) return { error: 'Document not found.' as const };
  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.write', { workspaceId: document.workspace_id }))) {
    return { error: 'Only editors can resolve merge conflicts.' as const };
  }
  return { supabase, userId: user.id as UserId };
}

/**
 * V.6 (Path A) — resolve a merge conflict by KEEPING BOTH variant versions. The
 * blocks are already MANUAL-scoped per variant by the V.5 merge, so each variant
 * shows its own version; this just clears the review item. Writing a single shared
 * version is done in the editor (the panel links there); re-generation is a
 * follow-up. Editor-gated; idempotent (the db guard only closes an `open` row).
 * Keep-both is a Path A resolution: it refuses a BLOCKING (human-edited) conflict,
 * which must be reconciled, not merely acknowledged.
 */
export async function resolveConflictKeepBothAction(
  documentId: string,
  conflictId: string,
): Promise<ConflictActionResult> {
  if (!UUID_RE.test(conflictId)) return { ok: false, error: 'Invalid conflict.' };
  const auth = await authorize(documentId);
  if ('error' in auth) return { ok: false, error: auth.error };

  // The conflict must belong to this document (RLS already scopes the read to the
  // caller's workspace); a blocking conflict can't be resolved by keep-both.
  const open = await listMergeConflicts(auth.supabase, documentId as DocumentId, { status: 'open' });
  const conflict = open.find((c) => c.id === conflictId);
  if (!conflict) return { ok: false, error: 'Conflict not found or already resolved.' };
  if (conflict.blocking) {
    return {
      ok: false,
      error: 'This conflict blocks publishing — reconcile it in the editor instead of keeping both.',
    };
  }

  try {
    await resolveMergeConflict(auth.supabase, {
      conflictId,
      documentId: documentId as DocumentId,
      resolution: 'keep_both',
      userId: auth.userId,
    });
    revalidatePath(`/documents/${documentId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not resolve the conflict.' };
  }
}
