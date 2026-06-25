-- ============================================================================
-- Arther — LOCAL/CI/STAGING seed (idempotent, minimal).
--
-- Creates one auth user and one workspace via the app's own create_workspace()
-- RPC (which auto-seeds workspace defaults: document types, brand profile,
-- quality standards). This gives the autonomous QA/PM agents a real logged-in
-- account with populated settings to exercise — without hand-inserting rows
-- across the deep schema.
--
-- Documents and published portal content are deliberately NOT seeded: the QA
-- agent creates those by USING the app, which is the point of end-to-end QA.
--
-- Safe to re-run: every step is guarded with `on conflict` / existence checks.
-- Applied by scripts/db-seed.sh and validated on every CI run (DB job).
--
-- NOTE: this uses the local auth shim's auth.users table. On a real Supabase
-- project, create the QA user through normal signup (GoTrue) instead; see
-- Development/Autonomous/staging.md.
-- ============================================================================

\set qa_email '\'qa@arther.test\''

-- 1. Auth user (the 0002 trigger mirrors it into public.users). Idempotent.
insert into auth.users (email, raw_user_meta_data)
values (:qa_email, jsonb_build_object('full_name', 'QA Agent'))
on conflict (email) do nothing;

-- 2. Create the workspace AS that user, via the sanctioned RPC. We impersonate
--    the authenticated role exactly as the app (and the RLS probes) do: set the
--    JWT claims so auth.uid() resolves, switch to the authenticated role, call
--    the RPC, then reset. Skipped if the workspace slug already exists.
do $$
declare
  v_uid uuid;
  v_exists boolean;
begin
  select id into v_uid from auth.users where email = 'qa@arther.test';
  if v_uid is null then
    raise notice 'seed: qa user missing, skipping workspace creation';
    return;
  end if;

  select exists(select 1 from public.workspaces where slug = 'qa-sandbox') into v_exists;
  if v_exists then
    raise notice 'seed: workspace qa-sandbox already exists, skipping';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text,
                     true);
  set local role authenticated;
  perform public.create_workspace('QA Sandbox', 'qa-sandbox'::citext);
  reset role;
end
$$;
