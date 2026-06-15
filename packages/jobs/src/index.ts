/**
 * Stub (Phase 2 G1.2). Trigger.dev durable tasks live here (ADR-006):
 * generation, import, propagation, PDF, notification dispatch, crons.
 * Gets its own trigger.config.ts when Trigger.dev is provisioned; apps import
 * task types only — never task implementations (IMPLEMENTATION_PLAN.md §7.7).
 *
 * Pending cron to wire here (F8.7): purge-deleted-workspaces — a daily schedule
 * that calls the service-role `purge_deleted_workspaces()` RPC (migration 0016),
 * which hard-deletes workspaces past their 14-day grace under
 * session_replication_role = replica. Until this scheduler lands it can run via
 * Supabase pg_cron (`select cron.schedule('purge-deleted-workspaces',
 * '0 3 * * *', $$select public.purge_deleted_workspaces()$$);`).
 */
export type JobsPlaceholder = never;
