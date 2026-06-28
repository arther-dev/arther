'use server';

import { revalidatePath } from 'next/cache';
import { setActionItemStatus } from '@arther/db';
import { getSupabaseServer } from '../../../lib/supabase/server';

/**
 * G6.5 — resolve / reopen a dashboard action item. Form actions (no client JS
 * needed); `dai_write` RLS scopes the write to a workspace the caller edits, so
 * these can't touch another tenant's queue.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function setStatus(formData: FormData, status: 'pending' | 'resolved'): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!UUID_RE.test(id)) return;
  const supabase = await getSupabaseServer();
  if (!supabase) return;
  await setActionItemStatus(supabase, id, status);
  revalidatePath('/dashboard');
}

export async function resolveActionItemAction(formData: FormData): Promise<void> {
  await setStatus(formData, 'resolved');
}

export async function reopenActionItemAction(formData: FormData): Promise<void> {
  await setStatus(formData, 'pending');
}
