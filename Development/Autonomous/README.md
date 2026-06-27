# Autonomous QA + PM + Builder loop

This directory is the operating manual for running Arther **hands-off** while the owner is
away (e.g. a multi-week trip with phone-only check-ins). It turns the single "build the next
task" routine in `CLAUDE.md` into a self-sustaining loop that **finds** problems, **decides**
what's worth doing, and **ships** the fixes — landing them on `main` on its own.

The goal: Arther is measurably better at the end of the trip than the start, with the owner
doing nothing but reading a daily digest on their phone and occasionally nudging direction.

## The three roles

Each role is a separate scheduled Claude Code (web) session. They share **no memory** — a run
is a fresh ephemeral clone of `main`. All durable state lives in three places only:

1. **`main`** (merged code + the `IMPLEMENTATION_PLAN.md` §10 session log)
2. **GitHub Issues** (the bug / UX / feature backlog — the shared brain)
3. **Open PRs + `claude/*` branches** (work in flight)

| Role | Cadence | Reads | Writes | Never |
|------|---------|-------|--------|-------|
| [QA agent](./qa-agent.md) | every ~2h | the running app, Sentry | new GitHub issues (`qa-bug`), screenshots | does not change code |
| [PM agent](./pm-agent.md) | daily | the issue backlog, the app end-to-end | triage labels, `approved` issues, the **daily digest** | does not write feature code |
| [Builder agent](./builder-agent.md) | hourly | `approved` issues + the plan | PRs that **self-merge on green CI** | does not touch [guardrailed](./guardrails.md) paths |

```
QA finds ──▶ files issues ──▶ PM triages + prioritizes ──▶ approves a slice
                                                                   │
   owner reads daily digest on phone ◀── PM writes digest          ▼
                                                          Builder picks `approved`
                                                          issue ──▶ PR ──▶ green CI
                                                          ──▶ self-merge to main
```

## Merge policy (owner's decision for this trip)

**Full self-merge on green CI.** There is no human-approval gate. CI is the *only* gate, so
the [guardrails](./guardrails.md) and the three required checks
(`Lint · typecheck · test · build`, `Playwright E2E (app + portal)`,
`Migrations · smoke · RLS probe`) plus the new `Guardrails` check do all the protecting.
The builder merges its own PR the moment every check is green. See
[builder-agent.md](./builder-agent.md) for the exact merge procedure (this **supersedes** the
required-review auto-merge dance described in the historical `CLAUDE.md` text).

## Change-scope policy (owner's decision for this trip)

**Polish + bugs + small features.** Agents may fix bugs, improve UX/visual/a11y polish, and add
small, single-PR features. They may **not** make schema, auth, RLS, or billing changes without
the owner — those paths are hard-blocked by the `Guardrails` CI check (see
[guardrails.md](./guardrails.md)).

## Emergency stop (kill switch)

**Every role checks for a pause signal as step 0 and exits immediately if it's set.** To pause
the whole loop from your phone, do either:

- **Open an issue titled exactly `PAUSE-LOOP`** (any body), or
- **Commit an empty file `Development/Autonomous/STOP` to `main`.**

While either exists, every QA/PM/Builder run no-ops and ends. Remove the file / close the issue
to resume. ⚠️ **This only stops the *next* scheduled run** — a run already in flight finishes. To
halt a runaway *immediately*, also disable the schedule/trigger in the Claude Code web UI (the
platform-native stop is the owner's responsibility; the flag is the in-band convenience). See
[GO-LIVE.md](./GO-LIVE.md) for where that control lives.

## How to wire the schedules (one-time, from the web/app UI)

These runbooks are the *instructions*; the *schedule* is configured in Claude Code on the web
(see https://code.claude.com/docs/en/claude-code-on-the-web — triggers). Create three
recurring sessions against `arther-dev/arther`, each pointed at `main`, with the prompt:

> Read and follow `Development/Autonomous/<role>-agent.md` exactly. Do one full pass, then end
> your turn.

- **QA** → every 2 hours → `qa-agent.md`
- **PM** → once daily (e.g. 08:00 owner-local) → `pm-agent.md`
- **Builder** → hourly → `builder-agent.md`

If the platform can't run three schedules, collapse to one hourly "operator" session that runs
QA, then PM (if a day has passed), then Builder, in that order — but separate schedules are
cleaner and cheaper.

## Before you leave — go-live checklist

**→ [GO-LIVE.md](./GO-LIVE.md) is the copy-paste, phone-friendly version (label commands, exact
branch-protection settings, staging, scheduler, spend cap, kill switch).** Recovery if a bad
change lands: [rollback.md](./rollback.md). Secrets/seed detail: [staging.md](./staging.md). In short:

- [ ] **Create the 11 labels** + tag/pin digest issue #146 (BLOCKER — nothing works without them).
- [ ] **Branch protection + auto-merge** — require the 4 checks (incl. `Guardrails`), review OFF
      (BLOCKER — without it the builder's direct-merge bypasses the guardrail).
- [ ] **Staging Supabase + a real (GoTrue) QA user + backups** (BLOCKER — local shim can't log in).
- [ ] **Staging deploy + `ARTHER_*` secrets** (BLOCKER).
- [ ] **Durable scheduler** — 3 web triggers (BLOCKER; the in-session cron expires in 7 days).
- [ ] **Hard spend cap + CI-minutes budget** (BLOCKER).
- [ ] Confirm the real-time **kill switch** (disable-trigger control) + the in-band `PAUSE-LOOP`/`STOP` flag.
- [ ] Sentry visible to the QA agent (DSN already wired per `PROVISIONING.md`; QA polls it).

## Phone check-in

Bookmark the **daily digest** issue and the
[`autonomous` label filter](https://github.com/arther-dev/arther/issues?q=is%3Aissue+label%3Aautonomous).
That's your whole dashboard: what shipped, what's queued, what's stuck.
