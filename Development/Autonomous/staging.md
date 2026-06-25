# Seeded staging environment

The QA and PM agents need to **use Arther for real** — logged in, with data. That requires a
provisioned app pointed at a database that has a known seed account. This is the one part that
needs the owner's cloud credentials; everything else in this loop runs without secrets.

## What the agents expect

Two things, provided as environment/secret values the scheduled sessions can read:

| Name | Meaning |
|------|---------|
| `ARTHER_STAGING_APP_URL` | Base URL of the running app the agents drive (e.g. a Vercel preview or a dedicated staging deploy of `apps/app`). |
| `ARTHER_STAGING_PORTAL_URL` | Base URL of the portal (`apps/portal`). |
| `ARTHER_QA_EMAIL` / `ARTHER_QA_PASSWORD` | Credentials of the seeded test user the agents log in as. |

If these are absent, the QA agent automatically falls back to an **unprovisioned** run (public/
auth-less surfaces only) and labels its findings accordingly. So the loop is useful even before
staging exists — it just can't exercise authenticated flows until you wire this up.

## Option A — point at a dedicated staging Supabase (recommended)

1. Use (or create) a **staging** Supabase project, separate from prod (the vibecode gate forbids
   sharing a DB across environments). Apply the canonical migrations with `supabase db push`
   (NOT the local auth shim — that's local/CI only).
2. Create the seed account through normal signup in the staging app (so GoTrue owns the auth
   user), then sign in once to confirm. Record its email/password as `ARTHER_QA_*`.
3. Optionally run the workspace/content seed below against staging to give the account a
   pre-populated workspace, so QA starts with something to look at instead of an empty state.
4. Deploy `apps/app` and `apps/portal` against the staging Supabase env vars and record the URLs
   as `ARTHER_STAGING_*`.

## Option B — ephemeral local stack (what CI validates)

For a fully local agent run (no cloud), the dockerized Postgres path works:

```
pnpm db:reset     # db:up + migrate + seed (drops & recreates) — see scripts/db-seed.sh
```

`db:reset` gives a clean DB with the seed account + one workspace (with its default document
types / brand profile / quality standards, created via the app's own `create_workspace` RPC).
The app must be run against this DB with the matching Supabase-local env for authenticated flows.
Note the local **auth shim** stands in for GoTrue, so password login differs from staging —
prefer Option A for true end-to-end auth.

## The seed

`scripts/sql/0001_seed.sql` is intentionally minimal and idempotent: it creates one auth user and
one workspace via `create_workspace()` (which auto-seeds workspace defaults). It is applied by
`scripts/db-seed.sh` and **validated on every CI run** (the `Migrations · smoke · RLS probe` job
applies it after migrations), so a broken seed fails CI and can never merge. Documents and
published portal content are intentionally **not** seeded — the QA agent creates those by using
the app, which is the point.

## Create the GitHub labels (one-time)

The loop relies on these labels. Create them once (owner, or any session with repo write):

```
qa-bug          #d73a4a   QA-found defect
visual          #fbca04   Visual / design-fidelity issue
a11y            #5319e7   Accessibility issue
ux              #0e8a16   UX / polish improvement
feature-small   #1d76db   Small single-PR feature
approved        #0e8a16   PM-approved, ready for the builder
blocked         #b60205   Blocked on a dependency
needs-human     #e99695   Needs the owner (guardrailed / judgment call)
human-approved  #0052cc   Owner approved a guardrailed PR to merge
digest          #c5def5   The daily digest issue
autonomous      #ededed   Created/handled by the autonomous loop
```

## Branch protection for self-merge

Self-merge needs the checks to be **required** so a red check actually blocks the merge button:
in repo settings → branches → `main`, require these status checks:
`Lint · typecheck · test · build`, `Playwright E2E (app + portal)`,
`Migrations · smoke · RLS probe`, and **`Guardrails`**. Do **not** require an approving review for
this trip (that's the historical mode; it would stall a no-human loop).
