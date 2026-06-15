'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import { createAiGateway } from '@arther/ai-gateway';
import {
  commitImportSession,
  createImportSession,
  getImportSession,
  getActiveWorkspace,
  listUnits,
  loadCurrentSpecState,
  membershipLookupFor,
  updateImportSession,
  type ImportInterpretation,
  type ImportSessionRow,
} from '@arther/db';
import {
  buildInterpretationPrompt,
  interpretedImportSchema,
  normalizeImport,
  parseWorkbook,
  reconcile,
  SpreadsheetParseError,
  type ImportDecisions,
  type ParsedWorkbook,
  type PlannedMutation,
} from '@arther/spec-import';
import { parseFieldValue, type ProductId, type UserId } from '@arther/types';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { CATEGORIES } from '../shared';
import { parseDecisions, recomputePlan } from './plan';

export interface ImportFormState {
  error?: string;
}

const STORAGE_BUCKET = 'spec-imports';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Import is spec mutation — editor-gated end to end (canDo + RLS behind it). */
async function authorize() {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' as const };
  const canDo = createCanDo(membershipLookupFor(supabase));
  const allowed = await canDo({ id: user.id as UserId }, 'spec.write', {
    workspaceId: workspace.id,
  });
  if (!allowed) return { error: 'Viewers can’t import specs — ask for an Editor seat.' as const };
  return { supabase, userId: user.id as UserId, workspace };
}

type Authorized = Exclude<Awaited<ReturnType<typeof authorize>>, { error: string }>;

const uploadSchema = z.object({
  targetProductId: z.string().uuid().optional().or(z.literal('')),
});

export async function uploadAndInterpretAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const head = uploadSchema.safeParse({ targetProductId: formData.get('targetProductId') });
  if (!head.success) return { error: 'Invalid import request.' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an .xlsx or .csv file first.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: 'That file is over 15 MB — export a leaner sheet and retry.' };
  }

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  // Each interpretation spends Anthropic tokens — bound runs per editor (F8.2).
  const limited = await checkRateLimit('import:run', auth.userId);
  if (limited) return { error: limited };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let workbook: ParsedWorkbook;
  try {
    workbook = await parseWorkbook({ filename: file.name, bytes });
  } catch (e) {
    return {
      error: e instanceof SpreadsheetParseError ? e.message : 'Could not read that file.',
    };
  }

  const targetProductId = head.data.targetProductId
    ? (head.data.targetProductId as ProductId)
    : undefined;
  const sessionId = await createImportSession(auth.supabase, {
    workspaceId: auth.workspace.id,
    targetProductId,
    filename: file.name,
    createdBy: auth.userId,
  });

  // F7.1: the raw upload is the audit trail. Best-effort — a missing bucket
  // must not block the import (the parsed bytes are already in hand).
  const storageKey = `${auth.workspace.id}/${sessionId}/${sanitizeFilename(file.name)}`;
  const uploaded = await auth.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storageKey, bytes, { contentType: file.type || 'application/octet-stream' });
  if (!uploaded.error) {
    await auth.supabase
      .from('import_sessions')
      .update({ file_storage_key: storageKey, updated_by: auth.userId })
      .eq('id', sessionId);
  }

  await interpretAndPropose(auth, sessionId, workbook, targetProductId ?? null);
  redirect(`/specs/import/${sessionId}`);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(-120);
}

/**
 * F7.2/F7.3: Claude structural interpretation → registry normalisation →
 * SpecReconciler plan, persisted on the session (F7.7). Failures land in
 * status='failed' with an honest message — never a half-written proposal.
 */
async function interpretAndPropose(
  auth: Authorized,
  sessionId: string,
  workbook: ParsedWorkbook,
  targetProductId: ProductId | null,
): Promise<void> {
  await updateImportSession(auth.supabase, sessionId, {
    status: 'interpreting',
    userId: auth.userId,
  });

  const gateway = createAiGateway({
    apiKey: process.env.ANTHROPIC_API_KEY,
    onUsage: (usage) => console.info('[ai-gateway] import interpretation', JSON.stringify(usage)),
  });
  if (!gateway.provisioned) {
    await updateImportSession(auth.supabase, sessionId, {
      status: 'failed',
      error:
        'AI interpretation isn’t provisioned yet (ANTHROPIC_API_KEY, IMPLEMENTATION_PLAN.md §6). The uploaded file is kept — retry once the key is set.',
      userId: auth.userId,
    });
    return;
  }

  const units = await listUnits(auth.supabase, auth.workspace.id);
  let targetProductName: string | null = null;
  if (targetProductId) {
    const { data } = await auth.supabase
      .from('products')
      .select('name')
      .eq('id', targetProductId)
      .maybeSingle();
    targetProductName = (data?.name as string) ?? null;
  }

  try {
    const { system, user } = buildInterpretationPrompt({
      workbook,
      units,
      categories: CATEGORIES,
      targetProductName,
    });
    const interpreted = await gateway.structured({
      schema: interpretedImportSchema,
      system,
      user,
    });
    const normalized = normalizeImport(interpreted, workbook, units, CATEGORIES);
    const interpretation: ImportInterpretation = {
      interpreted,
      normalized,
      warnings: normalized.warnings,
    };
    const current = await loadCurrentSpecState(auth.supabase, {
      workspaceId: auth.workspace.id,
      targetProductId,
      componentNames: normalized.components.map((c) => c.name),
    });
    const plan = reconcile(normalized, current);
    await updateImportSession(auth.supabase, sessionId, {
      status: 'proposed',
      interpretation,
      proposedMutations: plan.mutations,
      userId: auth.userId,
    });
  } catch (e) {
    // Surface the real cause: log the full error for Vercel runtime logs, and
    // persist a concise reason so the owner sees what actually failed instead
    // of a generic "Interpretation failed".
    console.error('[import] interpretation failed for session', sessionId, e);
    const detail = e instanceof Error ? e.message : String(e);
    await updateImportSession(auth.supabase, sessionId, {
      status: 'failed',
      error: `Interpretation failed: ${detail.slice(0, 400)} — retry; your upload is kept.`,
      userId: auth.userId,
    });
  }
}

/** Re-run interpretation from the stored upload (error state → Retry). */
export async function retryInterpretationAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse({
    sessionId: formData.get('sessionId'),
  });
  if (!parsed.success) return { error: 'Invalid session.' };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  // Retry re-runs interpretation (more Anthropic tokens) — same bound (F8.2).
  const limited = await checkRateLimit('import:run', auth.userId);
  if (limited) return { error: limited };

  const session = await getImportSession(auth.supabase, parsed.data.sessionId);
  if (!session) return { error: 'Import session not found.' };
  if (session.status !== 'failed') return { error: 'Only failed imports can be retried.' };
  if (!session.file_storage_key) {
    return { error: 'The original upload isn’t in storage — start a new import with the file.' };
  }
  const download = await auth.supabase.storage
    .from(STORAGE_BUCKET)
    .download(session.file_storage_key);
  if (download.error || !download.data) {
    return { error: 'Could not fetch the stored upload — start a new import with the file.' };
  }
  let workbook: ParsedWorkbook;
  try {
    workbook = await parseWorkbook({
      filename: session.source_filename ?? 'upload.xlsx',
      bytes: new Uint8Array(await download.data.arrayBuffer()),
    });
  } catch {
    return { error: 'The stored upload could not be parsed — start a new import.' };
  }
  await interpretAndPropose(auth, session.id, workbook, session.target_product_id);
  revalidatePath(`/specs/import/${session.id}`);
  redirect(`/specs/import/${session.id}`);
}

/** Shared session+decisions loader for the review-step actions. */
async function loadProposed(
  auth: Authorized,
  sessionId: string,
): Promise<{ session: ImportSessionRow; decisions: ImportDecisions } | { error: string }> {
  const session = await getImportSession(auth.supabase, sessionId);
  if (!session) return { error: 'Import session not found.' };
  if (session.status !== 'proposed') {
    return { error: `This import is ${session.status} — review is closed.` };
  }
  if (!session.interpreted_structure) return { error: 'This import has no proposal yet.' };
  return { session, decisions: parseDecisions(session) };
}

/** Structural review (F7.4 step 1): skip/rename components. */
export async function saveStructuralDecisionsAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse({
    sessionId: formData.get('sessionId'),
  });
  if (!parsed.success) return { error: 'Invalid session.' };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };
  const loaded = await loadProposed(auth, parsed.data.sessionId);
  if ('error' in loaded) return { error: loaded.error };

  const normalized = loaded.session.interpreted_structure!.normalized;
  const decisions = loaded.decisions;
  for (const component of normalized.components) {
    const skip = formData.get(`skip:${component.key}`) === 'on';
    const name = String(formData.get(`name:${component.key}`) ?? '').trim();
    decisions.components[component.key] = {
      ...(skip ? { skip: true } : {}),
      ...(name && name !== component.name ? { name } : {}),
    };
  }
  await updateImportSession(auth.supabase, loaded.session.id, {
    decisions,
    userId: auth.userId,
  });
  revalidatePath(`/specs/import/${loaded.session.id}`);
  redirect(`/specs/import/${loaded.session.id}?step=fields`);
}

/** Field-level review (F7.4 step 2): skip/rename/re-unit/re-categorise. */
export async function saveFieldDecisionsAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse({
    sessionId: formData.get('sessionId'),
  });
  if (!parsed.success) return { error: 'Invalid session.' };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };
  const loaded = await loadProposed(auth, parsed.data.sessionId);
  if ('error' in loaded) return { error: loaded.error };

  const normalized = loaded.session.interpreted_structure!.normalized;
  const decisions = loaded.decisions;
  const allFields = [
    ...normalized.productFields,
    ...normalized.components.flatMap((c) => c.fields),
  ];
  for (const field of allFields) {
    // Fields of skipped components aren't rendered — leave their decisions be.
    if (!formData.has(`present:${field.key}`)) continue;
    const include = formData.get(`include:${field.key}`) === 'on';
    const name = String(formData.get(`name:${field.key}`) ?? '').trim();
    const unit = formData.get(`unit:${field.key}`);
    const category = String(formData.get(`category:${field.key}`) ?? '').trim();
    const decision: ImportDecisions['fields'][string] = {};
    if (!include) decision.skip = true;
    if (name && name !== field.name) decision.name = name;
    if (unit !== null && field.unitId !== null) {
      const unitId = String(unit);
      if (unitId !== field.unitId) decision.unitId = unitId === '' ? null : unitId;
    }
    if (category && category !== field.category) decision.category = category;
    decisions.fields[field.key] = decision;
  }
  await updateImportSession(auth.supabase, loaded.session.id, {
    decisions,
    userId: auth.userId,
  });
  revalidatePath(`/specs/import/${loaded.session.id}`);
  redirect(`/specs/import/${loaded.session.id}?step=validate`);
}

/**
 * F7.6 — commit: recompute the plan from stored interpretation + decisions
 * against LIVE state, Zod-validate every applied value (the one-schema rule —
 * nothing reaches the RPC unvalidated), persist the final plan for audit,
 * then apply atomically via the 0015 RPC and land on the product.
 */
export async function commitImportAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse({
    sessionId: formData.get('sessionId'),
  });
  if (!parsed.success) return { error: 'Invalid session.' };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };
  const loaded = await loadProposed(auth, parsed.data.sessionId);
  if ('error' in loaded) return { error: loaded.error };

  const { plan } = await recomputePlan(
    auth.supabase,
    auth.workspace.id,
    loaded.session,
    loaded.decisions,
  );
  try {
    validatePlanValues(plan.mutations);
  } catch (e) {
    return {
      error: `A proposed value didn’t validate: ${e instanceof Error ? e.message : 'unknown'} — adjust the field review and retry.`,
    };
  }
  await updateImportSession(auth.supabase, loaded.session.id, {
    proposedMutations: plan.mutations,
    decisions: loaded.decisions,
    userId: auth.userId,
  });

  let productId: ProductId;
  try {
    productId = await commitImportSession(auth.supabase, loaded.session.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Commit failed — nothing was applied.' };
  }
  revalidatePath('/specs');
  revalidatePath('/specs/releases');
  redirect(`/specs?product=${productId}`);
}

export async function discardImportAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse({
    sessionId: formData.get('sessionId'),
  });
  if (!parsed.success) return { error: 'Invalid session.' };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };
  const session = await getImportSession(auth.supabase, parsed.data.sessionId);
  if (!session) return { error: 'Import session not found.' };
  if (session.status === 'committed') return { error: 'This import is already committed.' };
  await updateImportSession(auth.supabase, session.id, {
    status: 'discarded',
    userId: auth.userId,
  });
  revalidatePath('/specs/import');
  redirect('/specs/import');
}


/** Every value the RPC will write must pass the FieldValue union (ADR-012). */
function validatePlanValues(mutations: PlannedMutation[]): void {
  for (const m of mutations) {
    if (m.kind === 'create_field' && m.value !== null) {
      parseFieldValue(m.fieldType, m.value);
    }
    if (m.kind === 'set_value') {
      parseFieldValue(m.fieldType, m.newValue);
    }
  }
}
