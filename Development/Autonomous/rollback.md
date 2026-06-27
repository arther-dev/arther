# Rollback & recovery

`main` is a self-merging trunk during trip mode, so a bad change can land without a human in the
loop. This is the recovery playbook.

## Anchor: known-good SHA

Before the trip, record a SHA you trust as the rollback floor. Update it as the loop ships good work.

- **Known-good `main`:** `f5ecbc57` (the autonomous-loop bootstrap; update before leaving).

## Revert a single bad merge (the common case)

1. Find the offending squash-merge commit on `main`.
2. Open a revert PR: `git revert <sha>` → push to a `claude/revert-<sha>` branch → PR titled
   `Revert: <original title>`, body `Reverts #<pr>`.
3. Let CI run; merge when green (same gate as any PR).

> ⚠️ **Guardrail caveat:** if the commit being reverted touched a *protected* path
> (`supabase/migrations/**`, `packages/authz|db/**`, `apps/*/src/middleware.ts`, billing logic,
> `.github/workflows/**`), the **revert PR also touches that path** and so will fail the
> `Guardrails` check. It then needs the owner's `human-approved` label to merge — a protected
> change can't be undone fully autonomously, by design.

## Hard reset to the anchor (escalation)

If several bad merges compounded and reverting individually is hopeless:

1. **Stop the loop first** (see [README — Emergency stop](./README.md#emergency-stop-kill-switch)):
   create the `PAUSE-LOOP` issue / `STOP` file *and* disable the schedules in the web UI.
2. From a phone you can do a UI revert per commit; a true `git reset --hard <anchor>` + force-push
   to `main` needs a real terminal — defer to when you're back unless it's an emergency. Never let
   an agent force-push `main`.

## Data / database

- Code reverts do **not** undo applied migrations. Schema changes are guardrailed (need
  `human-approved`) precisely because they aren't cleanly reversible.
- Ensure **PITR or daily backups** are enabled on whatever DB the agents target (the *staging*
  project — never prod). Confirm this before the trip; restoring data is the owner's lever of last
  resort. See [GO-LIVE.md](./GO-LIVE.md).
