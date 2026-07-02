-- 0030 — index for the workspace-wide Releases view.
--
-- `listReleases` reads product_releases by workspace_id ordered by created_at
-- desc (the /specs/releases surface), and the RLS predicate is also
-- workspace-scoped — but 0003 only indexed product_id. Every comparable
-- list surface (audit_log, import_sessions, field_versions) already carries a
-- (scope, time desc) index; this closes the one gap.

create index if not exists product_releases_ws_time_idx
  on public.product_releases (workspace_id, created_at desc);
