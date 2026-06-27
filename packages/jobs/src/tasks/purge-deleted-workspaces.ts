import { schedules } from '@trigger.dev/sdk';
import { createServiceClient } from '@arther/db';

/**
 * F8.7 — daily hard-delete of workspaces past their 14-day soft-delete grace.
 * The service-role RPC `purge_deleted_workspaces()` (migration 0016) does the
 * destructive work under `session_replication_role = replica` (bypassing the
 * no-delete guards); this durable schedule is the only thing that calls it. Until
 * this ran, a "deleted" workspace's data lived forever past the promised purge —
 * a data-retention gap this closes.
 *
 * Runs on Trigger.dev's compute, so the project env needs SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_ANON_KEY, which the typed env loader
 * validates) — the same secrets the generate-variants task needs.
 */
export const purgeDeletedWorkspacesTask = schedules.task({
  id: 'purge-deleted-workspaces',
  cron: '0 3 * * *', // daily at 03:00 UTC
  run: async () => {
    const service = createServiceClient();
    const { data, error } = await service.rpc('purge_deleted_workspaces');
    if (error) throw new Error(`purge_deleted_workspaces: ${error.message}`);
    const purged = typeof data === 'number' ? data : 0;
    return { purged };
  },
});
