/**
 * @arther/jobs — Trigger.dev durable tasks (ADR-006). Task IMPLEMENTATIONS live
 * in `./src/tasks` and run on Trigger.dev's compute; this barrel exposes only the
 * pure helpers and the task TYPES (payload/result), so apps import types + trigger
 * tasks by id (`tasks.trigger('generate-variants', payload)`) without pulling task
 * runtime — or the Trigger.dev SDK — into their bundle (IMPLEMENTATION_PLAN.md §7.7).
 *
 * Tasks: generate-variants (V.5). Pending: generate-document, propagate-spec-change,
 * dispatch-notifications, publish-pdf, and the F8.7 purge-deleted-workspaces cron.
 */
export {
  variantPromptFields,
  variantResolverEntries,
  type UnitSymbol,
} from './variant-generation';
export type { GenerateVariantsPayload, GenerateVariantsResult } from './tasks/generate-variants';
