import { defineConfig } from '@trigger.dev/sdk';

/**
 * V.5 / ADR-006 — Trigger.dev durable-jobs config. The project ref is a public
 * identifier (not a secret), so it lives here, env-overridable per environment.
 * Tasks live in `./src/tasks`. Runtime secrets (TRIGGER_SECRET_KEY,
 * ANTHROPIC_API_KEY, SUPABASE_URL/SERVICE_ROLE_KEY) are set in the Trigger.dev
 * project's environment — never in this file. The apps trigger tasks by id and
 * import only task TYPES (IMPLEMENTATION_PLAN.md §7.7).
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_pqdpsurtxfhhvqkwmoic',
  dirs: ['./src/tasks'],
  maxDuration: 900, // long AI fan-outs (per-variant generation + merge)
});
