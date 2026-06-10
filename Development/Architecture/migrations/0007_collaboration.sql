-- ============================================================================
-- Arther — Migration 0007: Collaboration & Review
-- Approval records (append-only), comment threads + comments, and the unified
-- notification system (the single delivery channel for the whole product).
-- The document state machine drives document_revisions.state (from 0005).
-- Depends on: 0001-0006.
-- ============================================================================

-- --- Approvals (append-only audit of sign-off) --------------------------------
create table public.approval_records (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  revision_id           uuid not null references public.document_revisions(id) on delete cascade,
  role_id               uuid references public.document_type_approval_roles(id) on delete set null,
  approver_id           uuid references public.users(id),
  action                text not null check (action in ('approved','rejected','owner_override')),
  reason                text,                          -- required on reject / override (enforced in app)
  override_on_behalf_of text,                          -- role label overridden, for owner_override
  recorded_at           timestamptz not null default now()
);
create index approval_records_revision_idx on public.approval_records (revision_id);
-- Append-only: no UPDATE/DELETE policy below + BOTH guards (update AND delete),
-- so even a service-role bug cannot rewrite or erase the approval audit trail.
-- (Workspace purge runs with session_replication_role = replica, which disables
--  these triggers — the one sanctioned removal path.)
create trigger approval_records_no_update before update on public.approval_records
  for each row execute function public.prevent_mutation();
create trigger approval_records_no_delete before delete on public.approval_records
  for each row execute function public.prevent_mutation();

-- --- Comments -----------------------------------------------------------------
create table public.comment_threads (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  revision_id     uuid not null references public.document_revisions(id) on delete cascade,
  block_id        uuid references public.blocks(id) on delete set null,  -- null when orphaned by block delete
  anchor_type     text not null check (anchor_type in ('block','text_range')),
  text_anchor     jsonb,                              -- { start_offset, end_offset, anchor_text }
  status          text not null default 'open' check (status in ('open','resolved','orphaned')),
  orphaned_reason text check (orphaned_reason in ('block_regenerated','text_edited')),
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  resolved_by     uuid references public.users(id),
  resolved_at     timestamptz
);
create index comment_threads_revision_idx on public.comment_threads (revision_id, status);
create index comment_threads_block_idx    on public.comment_threads (block_id);

create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  thread_id         uuid not null references public.comment_threads(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,   -- one level
  author_id         uuid references public.users(id),
  body              text not null,                    -- rich text; may contain @mention tokens
  created_at        timestamptz not null default now(),
  edited_at         timestamptz
);
create index comments_thread_idx on public.comments (thread_id, created_at);

-- --- Unified notifications (owned by Collaboration; invariant 8) ---------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  event_type   text not null,                         -- e.g. 'review_requested','comment_mention','spec_stale'
  payload      jsonb not null default '{}'::jsonb,    -- typed per event_type
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);

create table public.notification_preferences (
  workspace_member_id uuid not null references public.workspace_members(id) on delete cascade,
  event_type          text not null,
  in_app_enabled      boolean not null default true,
  email_enabled       boolean not null default true,
  primary key (workspace_member_id, event_type)
);

-- --- Row-Level Security -------------------------------------------------------
alter table public.approval_records         enable row level security;
alter table public.comment_threads          enable row level security;
alter table public.comments                 enable row level security;
alter table public.notifications            enable row level security;
alter table public.notification_preferences enable row level security;

-- Approvals: members read; ALL members append — approving/rejecting is a
-- spec'd VIEWER right (billing spec: viewers view/comment/approve), so this is
-- deliberately is_workspace_member, not is_workspace_editor. Never update/delete.
create policy approvals_read on public.approval_records for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy approvals_insert on public.approval_records for insert to authenticated
  with check (private.is_workspace_member(workspace_id));

-- Comments: ALL members including viewers (commenting is a spec'd viewer right) —
-- deliberately not editor-gated. Per-author edit/delete rules live in canDo.
create policy comment_threads_rw on public.comment_threads for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy comments_rw on public.comments for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- Notifications: only the recipient may read and mark read. Writes come from the
-- dispatch task (service role, bypasses RLS) — no authenticated INSERT policy.
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Preferences: a user manages only their own membership's preferences.
create policy notification_prefs_rw on public.notification_preferences for all to authenticated
  using (workspace_member_id in (select id from public.workspace_members where user_id = auth.uid()))
  with check (workspace_member_id in (select id from public.workspace_members where user_id = auth.uid()));
