import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generationRunCreateSchema,
  isTerminalRunStatus,
  isTerminalSectionStatus,
  type BlockId,
  type BrandProfileId,
  type DocumentId,
  type DocumentTypeId,
  type DocumentTypeSectionId,
  type GenerationRunCreate,
  type GenerationRunId,
  type GenerationRunKind,
  type GenerationRunSectionId,
  type GenerationRunStatus,
  type GenerationSectionStatus,
  type ProductId,
  type UserId,
  type WorkspaceId,
} from '@arther/types';
import { scopedServiceQuery, type WorkspaceScope } from './guard';

/**
 * Generation run repository (G1.4, migration 0005). Two paths, never mixed
 * (ADR-010):
 *
 *  - WRITES go through the SERVICE client and are scoped to a workspace
 *    (`scopedServiceQuery`, guardrail 1) — `generation_runs(_sections)` carry no
 *    authenticated write policy, so the durable task (G1.2) and the generator
 *    (G2) are the only writers and a run cannot be forged from a client. Every
 *    update also pins `workspace_id` so a service path can't cross tenants.
 *  - READS go through the USER client under RLS (members read) — the editor's
 *    progress UI subscribes via Realtime and falls back to polling these.
 *
 * `completed_at` / `started_at` are stamped here when a status reaches a terminal
 * (or running) state unless the caller supplies its own timestamp.
 */

const RUN_COLUMNS =
  'id, workspace_id, product_id, document_type_id, brand_profile_id, document_id, variant_id, kind, status, error, trigger_run_id, model, input_tokens, output_tokens, requested_by, created_at, completed_at, updated_at';
const SECTION_COLUMNS =
  'id, run_id, document_type_section_id, name, display_order, status, attempt, error, input_tokens, output_tokens, produced_block_ids, started_at, completed_at';

export interface GenerationRunRow {
  id: GenerationRunId;
  workspace_id: WorkspaceId;
  product_id: ProductId;
  document_type_id: DocumentTypeId;
  brand_profile_id: BrandProfileId | null;
  document_id: DocumentId | null;
  variant_id: string | null;
  kind: GenerationRunKind;
  status: GenerationRunStatus;
  error: string | null;
  trigger_run_id: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  requested_by: UserId | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface GenerationRunSectionRow {
  id: GenerationRunSectionId;
  run_id: GenerationRunId;
  document_type_section_id: DocumentTypeSectionId | null;
  name: string;
  display_order: number;
  status: GenerationSectionStatus;
  attempt: number;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  produced_block_ids: BlockId[];
  started_at: string | null;
  completed_at: string | null;
}

export interface GenerationRunWithSections {
  run: GenerationRunRow;
  sections: GenerationRunSectionRow[];
}

// --- Service-role writes (the generation pipeline) ---------------------------

/** Create a queued run and its pending section scaffold (one per DocumentTypeSection). */
export async function createGenerationRun(
  service: SupabaseClient,
  scope: WorkspaceScope,
  input: GenerationRunCreate & { requestedBy: UserId },
): Promise<GenerationRunWithSections> {
  const parsed = generationRunCreateSchema.parse(input);
  return scopedServiceQuery(scope, async ({ workspaceId }) => {
    const { data: run, error: runError } = await service
      .from('generation_runs')
      .insert({
        workspace_id: workspaceId,
        product_id: parsed.productId,
        document_type_id: parsed.documentTypeId,
        brand_profile_id: parsed.brandProfileId ?? null,
        variant_id: parsed.variantId ?? null,
        kind: parsed.kind,
        status: 'queued',
        requested_by: input.requestedBy,
      })
      .select(RUN_COLUMNS)
      .single();
    if (runError) throw new Error(`createGenerationRun: ${runError.message}`);

    const sectionRows = parsed.sections.map((section) => ({
      workspace_id: workspaceId,
      run_id: run.id,
      document_type_section_id: section.documentTypeSectionId ?? null,
      name: section.name,
      display_order: section.displayOrder,
      status: 'pending',
    }));
    const { data: sections, error: sectionError } = await service
      .from('generation_run_sections')
      .insert(sectionRows)
      .select(SECTION_COLUMNS);
    if (sectionError) throw new Error(`createGenerationRun.sections: ${sectionError.message}`);

    return {
      run: run as GenerationRunRow,
      sections: ((sections ?? []) as GenerationRunSectionRow[]).sort(
        (a, b) => a.display_order - b.display_order,
      ),
    };
  });
}

/** Move a run's status (and, at commit, the document/model/token totals). */
export async function setGenerationRunStatus(
  service: SupabaseClient,
  scope: WorkspaceScope,
  runId: GenerationRunId,
  patch: {
    status: GenerationRunStatus;
    error?: string | null;
    documentId?: DocumentId | null;
    model?: string | null;
    triggerRunId?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    completedAt?: string | null;
  },
): Promise<void> {
  await scopedServiceQuery(scope, async ({ workspaceId }) => {
    const update: Record<string, unknown> = { status: patch.status };
    if (patch.error !== undefined) update.error = patch.error;
    if (patch.documentId !== undefined) update.document_id = patch.documentId;
    if (patch.model !== undefined) update.model = patch.model;
    if (patch.triggerRunId !== undefined) update.trigger_run_id = patch.triggerRunId;
    if (patch.inputTokens !== undefined) update.input_tokens = patch.inputTokens;
    if (patch.outputTokens !== undefined) update.output_tokens = patch.outputTokens;
    if (patch.completedAt !== undefined) update.completed_at = patch.completedAt;
    else if (isTerminalRunStatus(patch.status)) update.completed_at = new Date().toISOString();
    const { error } = await service
      .from('generation_runs')
      .update(update)
      .eq('id', runId)
      .eq('workspace_id', workspaceId);
    if (error) throw new Error(`setGenerationRunStatus: ${error.message}`);
  });
}

/** Move a section's status, recording its tokens, retry attempt, and produced blocks. */
export async function setGenerationSectionStatus(
  service: SupabaseClient,
  scope: WorkspaceScope,
  sectionId: GenerationRunSectionId,
  patch: {
    status: GenerationSectionStatus;
    error?: string | null;
    attempt?: number;
    inputTokens?: number;
    outputTokens?: number;
    producedBlockIds?: BlockId[];
    startedAt?: string | null;
    completedAt?: string | null;
  },
): Promise<void> {
  await scopedServiceQuery(scope, async ({ workspaceId }) => {
    const update: Record<string, unknown> = { status: patch.status };
    if (patch.error !== undefined) update.error = patch.error;
    if (patch.attempt !== undefined) update.attempt = patch.attempt;
    if (patch.inputTokens !== undefined) update.input_tokens = patch.inputTokens;
    if (patch.outputTokens !== undefined) update.output_tokens = patch.outputTokens;
    if (patch.producedBlockIds !== undefined) update.produced_block_ids = patch.producedBlockIds;
    if (patch.startedAt !== undefined) update.started_at = patch.startedAt;
    else if (patch.status === 'running') update.started_at = new Date().toISOString();
    if (patch.completedAt !== undefined) update.completed_at = patch.completedAt;
    else if (isTerminalSectionStatus(patch.status)) update.completed_at = new Date().toISOString();
    const { error } = await service
      .from('generation_run_sections')
      .update(update)
      .eq('id', sectionId)
      .eq('workspace_id', workspaceId);
    if (error) throw new Error(`setGenerationSectionStatus: ${error.message}`);
  });
}

// --- RLS reads (the progress UI) ---------------------------------------------

/** A run with its sections in display order — the poll/Realtime read model. */
export async function getGenerationRun(
  client: SupabaseClient,
  runId: GenerationRunId,
): Promise<GenerationRunWithSections | null> {
  const { data: run, error } = await client
    .from('generation_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .maybeSingle();
  if (error) throw new Error(`getGenerationRun: ${error.message}`);
  if (!run) return null;

  const { data: sections, error: sectionError } = await client
    .from('generation_run_sections')
    .select(SECTION_COLUMNS)
    .eq('run_id', runId)
    .order('display_order', { ascending: true });
  if (sectionError) throw new Error(`getGenerationRun.sections: ${sectionError.message}`);
  return { run: run as GenerationRunRow, sections: (sections ?? []) as GenerationRunSectionRow[] };
}

/** Recent runs for a product, newest first (the generation history list). */
export async function listGenerationRunsForProduct(
  client: SupabaseClient,
  productId: ProductId,
  limit = 20,
): Promise<GenerationRunRow[]> {
  const { data, error } = await client
    .from('generation_runs')
    .select(RUN_COLUMNS)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listGenerationRunsForProduct: ${error.message}`);
  return (data ?? []) as GenerationRunRow[];
}
