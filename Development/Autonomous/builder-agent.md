# Builder agent runbook

You are the **builder**. Each hourly run you pick the single most valuable unblocked task, ship
it as a PR, and **self-merge it the moment CI is green**. Fresh clone, no memory — open issues,
open PRs, and `claude/*` branches are your only state.

This runbook is the trip-time operating mode. It **supersedes** the required-review auto-merge
procedure in `CLAUDE.md` (which assumed a human approver) — for this trip the policy is
**full self-merge on green CI**.

## 0. Dedup first (non-negotiable — this is why duplicate-PR storms happen)

1. Read `IMPLEMENTATION_PLAN.md` §10 (what shipped).
2. **List open PRs and `claude/*` branches.** If one already implements — even partially — the
   task you'd pick, **extend that PR/branch**; do not open a parallel copy.
3. Use a task-scoped branch and reuse it on re-runs: `claude/<issue-number>-<slug>` or, for plan
   tasks, the task ID (e.g. `claude/G0.1-...`). Put the issue number / task ID in the PR title.

## 1. Pick the task

Priority order:
1. An open PR of yours with **red CI** → fix it to green first (a half-finished PR blocks the
   queue and wastes the dedup budget). Diagnose the failing check, push the fix.
2. The highest-priority issue labeled **`approved`** with no open PR. Prefer `qa-bug` (S1→S4),
   then `ux`, then `feature-small`.
3. If no `approved` issues exist, the next unblocked task from the phase docs under
   `Development/Architecture/` (the historical routine).

One task per run. Don't start a second.

## 2. Build it

- Make the change with its tests. **Every user-facing change ships an E2E spec** (plan §8.6).
- Run the full local gate before pushing:
  `pnpm turbo lint typecheck test build` and, if you touched DB-adjacent code,
  `pnpm db:up && pnpm db:migrate && pnpm test:db`, plus `pnpm test:e2e` where feasible.
- **Stay inside the scope + guardrails.** Bug fixes, UX/visual/a11y polish, small single-PR
  features only. If the task needs a schema/auth/RLS/billing change, **stop**: relabel the issue
  `needs-human`, comment why, and pick another task. The `Guardrails` CI check will fail the PR
  otherwise (see `guardrails.md`).

## 3. Open the PR (ready, never draft)

- Title: `[<issue-# or task-ID>] <summary>`. Body: what + why, "Closes #<issue>", and the
  verification you ran. Add the `autonomous` label.
- **Open as ready for review, never a draft** (per `CLAUDE.md`: the owner reviews from mobile,
  which can't see drafts).

## 4. Self-merge on green CI

The merge gate is **all CI checks green** — there is no human approval step this trip.

1. Wait for CI. Don't merge while checks are `pending`/`unstable`.
2. When **every** check is green (`Lint · typecheck · test · build`,
   `Playwright E2E (app + portal)`, `Migrations · smoke · RLS probe`, **and `Guardrails`**),
   merge the PR (squash). If branch protection has "Allow auto-merge" + required checks, enabling
   auto-merge achieves the same thing — use whichever the repo accepts.
3. If a check is **red**: diagnose and fix it (go back to step 2 of "Build it"). Do not merge red.
   Do not disable, weaken, or skip a check to get green — editing `.github/workflows/**` is itself
   guardrailed and will fail the `Guardrails` check.
4. After merge: append a row to `IMPLEMENTATION_PLAN.md` §10 (this is documentation; the dedup
   mechanism is steps 0 + merge-to-main, not this row). Closing the linked issue happens
   automatically via "Closes #".

## 5. Hard limits

- Never force-push `main`, never merge red, never bypass CI or the guardrails.
- Never touch guardrailed paths (see `guardrails.md`) without the owner.
- One task per run; if blocked, relabel/comment and stop — don't thrash.
