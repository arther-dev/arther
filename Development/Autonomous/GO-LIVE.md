# GO-LIVE checklist (owner, ~20 min, phone-friendly)

The autonomous loop is **built and merged** but stays **inert and unsafe until you do these
steps** — they need dashboards/secrets/billing that no agent has tools for. Work top to bottom;
the loop cannot safely run until the **blockers** are done.

Verified state at authoring time: 0 of 11 labels exist, `main` is unprotected, only `arther-dev`
+ `arther-prod` Supabase projects exist (no staging), only ephemeral Vercel previews.

---

## 1. Create the labels — BLOCKER, unblocks everything

Nothing in the loop works without these (the builder filters `approved`, the override needs
`human-approved`, the PM applies the rest). There is no label-creation API in the agent's tools.
Run once (terminal with `gh`, or create them in the GitHub UI → Issues → Labels):

```bash
gh label create qa-bug         -c d73a4a -d "QA-found defect"                 --force
gh label create visual         -c fbca04 -d "Visual / design-fidelity issue" --force
gh label create a11y           -c 5319e7 -d "Accessibility issue"            --force
gh label create ux             -c 0e8a16 -d "UX / polish improvement"        --force
gh label create feature-small  -c 1d76db -d "Small single-PR feature"        --force
gh label create approved       -c 2da44e -d "PM-approved, ready for builder" --force
gh label create blocked        -c b60205 -d "Blocked on a dependency"        --force
gh label create needs-human    -c e99695 -d "Needs the owner (guardrailed / judgment)" --force
gh label create human-approved -c 0052cc -d "Owner approved a guardrailed PR to merge"  --force
gh label create digest         -c c5def5 -d "The daily digest issue"         --force
gh label create autonomous     -c ededed -d "Created/handled by the autonomous loop" --force
```

Then **add `digest` to issue #146 and pin it** (Issues → #146 → Labels + Pin).

## 2. Branch protection + auto-merge — BLOCKER (safety)

Settings → Branches → add a rule for `main`:

- ✅ Require status checks to pass. Add **all four**, names **exactly** (middle-dot `·`, not `-`):
  - `Lint · typecheck · test · build`
  - `Playwright E2E (app + portal)`
  - `Migrations · smoke · RLS probe`
  - `Guardrails`
- ❌ Do **not** require an approving review (trip policy is self-merge).
- ✅ Settings → General → "Allow auto-merge" = ON.

Why this is safety-critical: with no required checks, a green PR is immediately mergeable and the
builder's fallback direct-merge would **bypass the `Guardrails` gate** (it's a PR check, not a
branch rule) — letting an unreviewed schema/auth/billing change reach `main`. Also confirm the
bot/app identity the loop merges under is **not** exempt from required checks.

## 3. Staging Supabase + a real QA user — BLOCKER

Local auth is a Postgres *shim*, not GoTrue, so `/login` only works against a real project.

- Create an `arther-staging` Supabase project (separate from `arther-prod` — the env-isolation
  gate forbids sharing). Apply migrations: `supabase db push`.
- Create the QA user via **real signup** in the staging app, then sign in once to confirm.
- Enable **PITR or daily backups** on staging (see [rollback.md](./rollback.md)).

## 4. Staging deploy + secrets — BLOCKER

- Deploy `apps/app` + `apps/portal` on Vercel against the **staging** Supabase env, with a stable
  alias (not a per-PR preview URL).
- Set these as secrets the scheduled sessions can read:
  `ARTHER_STAGING_APP_URL`, `ARTHER_STAGING_PORTAL_URL`, `ARTHER_QA_EMAIL`, `ARTHER_QA_PASSWORD`.
- Use a **dedicated low-privilege QA account** on a throwaway staging workspace; rotate the
  password after the trip.

## 5. Durable scheduler — BLOCKER

The in-session cron expires in ~7 days and dies on restart — it can't cover 3 weeks. Create three
recurring Claude Code (web) triggers (QA ~2h, PM daily, Builder hourly) per
[README](./README.md#how-to-wire-the-schedules-one-time-from-the-webapp-ui), each pointed at
`main` with the prompt that reads the matching runbook. **Confirm** triggers persist across
sessions and inject the `ARTHER_*` secrets; if they don't, fall back to GitHub Actions `cron`.
Note where the **disable-trigger** control is — that's your real-time kill switch (step 7).

## 6. Spend cap + CI minutes — BLOCKER

Set a real spend cap in the Claude billing console (not just an intention) and confirm your
GitHub Actions minutes budget covers ~hourly CI for 3 weeks.

## 7. Kill switch — confirm both halves

- In-band (already wired): open a `PAUSE-LOOP` issue or commit `Development/Autonomous/STOP` →
  every next run no-ops.
- Real-time (yours to confirm): the web-UI control that **disables the triggers** mid-run. Bookmark it.

## 8. Bookmark your dashboard

Issue **#146** (daily digest) and the
[`autonomous` label filter](https://github.com/arther-dev/arther/issues?q=is%3Aissue+label%3Aautonomous).
That's your whole phone check-in.

---

### Quick status table

| # | Step | Blocker? | Who |
|---|------|----------|-----|
| 1 | Create 11 labels + tag/pin #146 | ✅ | owner |
| 2 | Branch protection + auto-merge | ✅ | owner |
| 3 | Staging Supabase + QA user + backups | ✅ | owner |
| 4 | Staging deploy + `ARTHER_*` secrets | ✅ | owner |
| 5 | Durable scheduler (3 triggers) | ✅ | owner |
| 6 | Spend cap + CI minutes | ✅ | owner |
| 7 | Confirm real-time kill switch | ✅ | owner |
| 8 | Bookmark #146 + label filter | — | owner |
