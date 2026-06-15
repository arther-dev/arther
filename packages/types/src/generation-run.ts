import { z } from 'zod';
import { requiredText } from './text';

/**
 * G1.4 — generation run state (migration 0005 `generation_runs` /
 * `generation_run_sections`). The persisted, member-readable progress the
 * product reads while a document generates: per-section status, the resume
 * record for partial failure + section-level retry, and per-run token/cost
 * accounting. The durable task (G1.2) and the generator (G2) WRITE these via the
 * service role — there is no authenticated write policy, so a run can't be
 * forged from a client. This is the one Zod source (ADR-012) for the enums, the
 * write-boundary inputs, and the pure progress-summary the poll/Realtime client
 * renders.
 */

// --- Enums (mirror the 0005 CHECK constraints) -------------------------------

export const GENERATION_RUN_KINDS = ['document', 'variant_set', 'block_regeneration'] as const;
export type GenerationRunKind = (typeof GENERATION_RUN_KINDS)[number];
export const generationRunKindSchema = z.enum(GENERATION_RUN_KINDS);

export const GENERATION_RUN_STATUSES = [
  'queued',
  'running',
  'partial',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type GenerationRunStatus = (typeof GENERATION_RUN_STATUSES)[number];
export const generationRunStatusSchema = z.enum(GENERATION_RUN_STATUSES);

export const GENERATION_SECTION_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
] as const;
export type GenerationSectionStatus = (typeof GENERATION_SECTION_STATUSES)[number];
export const generationSectionStatusSchema = z.enum(GENERATION_SECTION_STATUSES);

const TERMINAL_RUN_STATUSES: readonly GenerationRunStatus[] = [
  'partial',
  'succeeded',
  'failed',
  'cancelled',
];
/** A run in a terminal state no longer changes — `completed_at` is set. */
export function isTerminalRunStatus(status: GenerationRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

const TERMINAL_SECTION_STATUSES: readonly GenerationSectionStatus[] = [
  'succeeded',
  'failed',
  'skipped',
];
/** A section in a terminal state has finished (succeeded, failed, or skipped). */
export function isTerminalSectionStatus(status: GenerationSectionStatus): boolean {
  return TERMINAL_SECTION_STATUSES.includes(status);
}

// --- Progress summary (the poll/Realtime read model) -------------------------

export interface RunProgressSummary {
  total: number;
  byStatus: Record<GenerationSectionStatus, number>;
  /** Sections in a terminal state (succeeded + failed + skipped). */
  completed: number;
  /** 0–100, rounded; 0 when there are no sections. */
  percentComplete: number;
  /** Every section has reached a terminal state. */
  done: boolean;
}

/**
 * Reduce a run's sections to the progress the client renders — the same shape
 * whether it arrives by Realtime push or the poll fallback. Pure, so the editor
 * and the generation-status UI agree without a round-trip.
 */
export function summarizeRunProgress(
  sections: ReadonlyArray<{ status: GenerationSectionStatus }>,
): RunProgressSummary {
  const byStatus: Record<GenerationSectionStatus, number> = {
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };
  for (const section of sections) byStatus[section.status] += 1;
  const total = sections.length;
  const completed = byStatus.succeeded + byStatus.failed + byStatus.skipped;
  return {
    total,
    byStatus,
    completed,
    percentComplete: total === 0 ? 0 : Math.round((completed / total) * 100),
    done: total > 0 && completed === total,
  };
}

// --- Write-boundary inputs ----------------------------------------------------

/** One section to scaffold on a run (one per DocumentTypeSection, in order). */
export const generationRunSectionInputSchema = z.object({
  name: requiredText('Name the section.'),
  documentTypeSectionId: z.string().uuid().nullable().optional(),
  displayOrder: z.number().int().min(0),
});
export type GenerationRunSectionInput = z.infer<typeof generationRunSectionInputSchema>;

/** Create a run plus its section scaffold (status starts `queued`/`pending`). */
export const generationRunCreateSchema = z.object({
  productId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  brandProfileId: z.string().uuid().nullable().optional(),
  variantId: z.string().uuid().nullable().optional(),
  kind: generationRunKindSchema.default('document'),
  sections: z.array(generationRunSectionInputSchema).min(1).max(100),
});
export type GenerationRunCreate = z.infer<typeof generationRunCreateSchema>;
