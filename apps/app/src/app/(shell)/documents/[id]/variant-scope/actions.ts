'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo } from '@arther/authz';
import { getActiveWorkspace, membershipLookupFor, setBlockVariantScope } from '@arther/db';
import {
  BLOCK_VARIANT_SCOPE_MODES,
  type BlockVariantScopeMode,
  type ComponentId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../../lib/supabase/server';

export interface ScopeActionResult {
  ok: boolean;
  error?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * V.4 — set a block's variant scope (§3.4). Editor-gated (`doc.write`); the block
 * row is workspace-scoped by RLS. ALL clears the lists; DERIVED needs a gating
 * component; MANUAL needs at least one variant.
 */
export async function setBlockVariantScopeAction(
  documentId: string,
  blockId: string,
  mode: string,
  variantIds: string[],
  derivedComponentId: string | null,
): Promise<ScopeActionResult> {
  if (!UUID_RE.test(documentId) || !UUID_RE.test(blockId)) {
    return { ok: false, error: 'Invalid reference.' };
  }
  if (!(BLOCK_VARIANT_SCOPE_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: 'Invalid scope mode.' };
  }
  const m = mode as BlockVariantScopeMode;
  const ids = variantIds.filter((v) => UUID_RE.test(v));
  if (m === 'MANUAL' && ids.length === 0) {
    return { ok: false, error: 'Pick at least one variant for a manual scope.' };
  }
  if (m === 'DERIVED' && !(derivedComponentId && UUID_RE.test(derivedComponentId))) {
    return { ok: false, error: 'Pick the component this block depends on.' };
  }

  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { ok: false, error: 'No workspace yet.' };
  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.write', { workspaceId: workspace.id }))) {
    return { ok: false, error: 'Only editors can scope blocks.' };
  }

  try {
    await setBlockVariantScope(supabase, {
      workspaceId: workspace.id,
      blockId,
      mode: m,
      variantIds: ids,
      derivedComponentId: m === 'DERIVED' ? (derivedComponentId as ComponentId) : null,
      userId: user.id as UserId,
    });
  } catch {
    return { ok: false, error: 'Could not save the block scope.' };
  }
  revalidatePath(`/documents/${documentId}/variant-scope`);
  revalidatePath(`/documents/${documentId}`);
  return { ok: true };
}
