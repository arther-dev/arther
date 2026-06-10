# Arther — Phase 1 (Foundation) Build Breakdown

**Date:** 8 June 2026 · **Status:** Proposed · Companions: [`arther-architecture.md`](./arther-architecture.md) · [`arther-data-model.md`](./arther-data-model.md) · [`migrations/`](./migrations)

Phase 1 builds the foundation the rest of the product stands on (PRD §13.2): project + infrastructure, the data layer with its guardrails, authentication and authorization, Workspace Admin, and the Spec Database including AI-powered import. It produces no AI-generated documents yet — it produces the **system of record** they will be generated from.

Tasks are grouped into epics in dependency order (F0 → F8). Each task has a short outcome and acceptance criteria. The estimate column is rough relative sizing (S ≈ <½ day, M ≈ 1–2 days, L ≈ 3–5 days) for a solo founder with AI assistance, not a commitment.

**Definition of done for Phase 1:** a new user can sign up, create a workspace, invite a teammate, import a real Excel spec sheet into a version-controlled graph of products and components, edit field values with full history, and create a named release — with hard tenant isolation provable by the second-user RLS probe.

---

## F0 — Project & infrastructure setup

| # | Task | Outcome | Est |
|---|---|---|---|
| F0.1 | Monorepo scaffold | pnpm + Turborepo with `apps/app`, `apps/portal` (stub), `packages/{types,db,ui,block-renderer (stub),config}` ([ADR-003](./arther-adrs.md#adr-003)) | M |
| F0.2 | Supabase project | Dev + prod projects (separate), region chosen for residency, CLI + local migrations wired ([ADR-005](./arther-adrs.md#adr-005)) | S |
| F0.3 | Vercel project | `apps/app` deploys; preview + prod; env vars set server-side only | S |
| F0.4 | Error monitoring | Sentry wired into app (client + server); source maps; PII scrubbing on | S |
| F0.5 | Env & secrets policy | `.env` gitignored; typed env loader (Zod) that fails fast on missing keys; no secret in client bundle | S |
| F0.6 | CI | Lint + typecheck + migration-apply on PR; block merge on red | S |

**Acceptance:** clean `pnpm install && pnpm build`; a trivial authed page deploys to a real URL over HTTPS; a thrown error shows in Sentry; CI is green and required.

---

## F1 — Data foundation & conventions

Implements [`migrations/0001_conventions.sql`](./migrations/0001_conventions.sql) and the patterns every later table inherits.

| # | Task | Outcome | Est |
|---|---|---|---|
| F1.1 | Extensions & schema | `pgcrypto`, `pg_trgm`, `citext`; a `private` schema for security-definer helpers | S |
| F1.2 | Attribution convention | `created_by/at` + `updated_by/at` on every entity; `set_updated_at()` trigger (guardrail 2) | S |
| F1.3 | Audit log | `audit_log` table + write helper; immutable (no update/delete) | M |
| F1.4 | Immutability trigger | `prevent_mutation()` applied to append-only tables (field versions, audit) | S |
| F1.5 | Tenancy helpers | `private.current_workspace_ids()`, `is_workspace_member()`, `has_workspace_role()`, `shares_workspace()` — security-definer, recursion-safe | M |
| F1.6 | Data-access layer | Thin `packages/db` wrapper that **requires** `workspace_id` on every service-role query (lint rule + runtime guard) ([ADR-010](./arther-adrs.md#adr-010)) | M |

**Acceptance:** helper functions return correct sets for a seeded user; a service-role query without `workspace_id` fails the lint rule; updating a `field_versions` row raises.

---

## F2 — Authentication & identity (decoupled)

| # | Task | Outcome | Est |
|---|---|---|---|
| F2.1 | Supabase Auth | Email/password with **email verification required**; Google OAuth ([ADR-005](./arther-adrs.md#adr-005), guardrail 3) | M |
| F2.2 | Identity tables | `users` (app profile) + `auth_providers`; `handle_new_user()` mirrors `auth.users` → `public.users` | M |
| F2.3 | Session handling | Server-side session in `apps/app`; auth middleware; sign-in/up/out flows | M |
| F2.4 | Identity boundary | App reads identity only from `public.users` — no provider-specific token used as identity (guardrail 3) | S |

**Acceptance:** sign up → verify email → profile row exists; Google sign-in links an `auth_providers` row to the same `users` row; unverified users can't reach app data.

---

## F3 — Authorization guardrails (`canDo`)

| # | Task | Outcome | Est |
|---|---|---|---|
| F3.1 | `canDo` module | Single `canDo(user, action, resource)` authority; every mutation routes through it (guardrail 1) | M |
| F3.2 | Role + seat model | Owner/Admin/Member/Viewer; seat tier (Editor paid / Viewer free) derived from role; role→seat change timestamped | M |
| F3.3 | RLS defence-in-depth | App connects with the user JWT so RLS is active behind `canDo` | S |

Reference shape for F3.1 (the one place permission is decided):

```ts
type Action = 'spec.read' | 'spec.write' | 'doc.generate' | 'doc.publish'
            | 'workspace.manage' | 'member.invite' | /* … */ string;

export async function canDo(user: AuthUser, action: Action, resource: Resource): Promise<boolean> {
  const m = await membership(user.id, resource.workspaceId);   // null ⇒ not a member ⇒ deny
  if (!m) return false;
  switch (action) {
    case 'workspace.manage':
    case 'member.invite':   return m.role === 'owner' || m.role === 'admin';
    case 'spec.write':
    case 'doc.generate':    return m.role !== 'viewer';        // Editor seats only
    case 'spec.read':
    case 'doc.read':        return true;                       // any member, incl. viewer
    default:                return m.role === 'owner';         // closed by default
  }
}
```

**Acceptance:** a Viewer is denied `spec.write` by `canDo` *and* by RLS; flipping a role to Viewer writes a timestamped seat change; no feature checks roles inline (grep confirms single call site).

---

## F4 — Workspace & membership (Workspace Admin)

Implements the identity domain of [`migrations/0002_identity_workspace.sql`](./migrations/0002_identity_workspace.sql).

| # | Task | Outcome | Est |
|---|---|---|---|
| F4.1 | Workspace CRUD | Create workspace; **immutable slug** (validated unique); logo; `seed_workspace_defaults()` runs on create | M |
| F4.2 | Membership | Add/remove members; role changes take effect immediately; removal blocked until ownership transferred | M |
| F4.3 | Invitations | Email invite (Resend), 7-day expiry, accept/revoke flow | M |
| F4.4 | Ownership transfer | Owner → Admin with confirmation; exactly one owner enforced | S |
| F4.5 | Settings shell | Workspace settings surface (name, logo, members, slug shown read-only) | M |

**Acceptance:** slug can't be changed after set; a removed member's attribution persists; an expired invite can't be accepted; ownership transfer leaves exactly one owner.

> Document Types and Brand Profiles (also Workspace Admin) are prerequisites for *generation* — schedule them at the seam between Phase 1 and Phase 2 so the Spec Database can ship and be dogfooded first.

---

## F5 — Spec Database core (the system of record)

Implements [`migrations/0003_spec_database.sql`](./migrations/0003_spec_database.sql). This is the heart of Phase 1.

| # | Task | Outcome | Est |
|---|---|---|---|
| F5.1 | Units & categories | Global built-in unit registry; per-workspace categories seeded from built-ins; custom units/categories | M |
| F5.2 | Products & components | Independent entities, both with archive lifecycle | M |
| F5.3 | Graph edges | `product_components` (parent nesting, quantity); product tree computed at read (invariant 3) | M |
| F5.4 | Spec fields + 8 types | scalar, range, toleranced, boolean, enum, multi_enum, table, reference; Zod-validated `value` per type | L |
| F5.5 | Field version history | Append-only `field_versions`; `current_version_id` pointer; structured diffs (row-level for tables) | M |
| F5.6 | Product-level overrides | `product_component_overrides` (scalar types only); type-change blocked when overrides exist | M |
| F5.7 | Releases | Named snapshots pinning a `FieldVersion` per field; delete blocked when documents reference (guard extended in Phase 2) | M |
| F5.8 | Field comments | Field-attached comments with version context markers + value snapshot | M |
| F5.9 | Reference & circular check | Reference fields; circular-reference detection at save | S |
| F5.10 | Archive/delete rules | `archived_at` everywhere; hard delete only at zero references (FK `restrict` + guard triggers) (invariant 7) | M |

**Acceptance:** a component shared by two products has one field history; editing it flags both products; an override doesn't mutate the component; field history is immutable; archiving a component preserves data and can be restored; the staleness join (defined in the data model) runs against seeded data.

---

## F6 — Spec Database UI

| # | Task | Outcome | Est |
|---|---|---|---|
| F6.1 | Three-panel layout | Sidebar (Products / Component Library / Releases) · field grid · field detail + history | L |
| F6.2 | Graph navigation | Product tree from the graph; shared-component badge + "used in N products" | M |
| F6.3 | Per-type field editors | Inline editing UIs for all 8 types incl. the table mini-spreadsheet with Excel paste + chart preview | L |
| F6.4 | Shared-component affordances | Edit (global) vs. Override (product-specific); override indicators | M |
| F6.5 | Version & comment feed | Unified chronological feed (value changes + comments with "at this comment" context) | M |

**Acceptance:** matches the spec's three-panel model; switching a unit converts the displayed value; pasting from Excel into a table field maps columns; overrides are visibly distinct from global values.

---

## F7 — AI-powered import (SpecReconciler v1)

| # | Task | Outcome | Est |
|---|---|---|---|
| F7.1 | Upload & parse | Excel/CSV upload to Storage; sheet/row extraction | M |
| F7.2 | Claude structural interpretation | Claude maps sheets→components, detects ranges/toleranced/tables, extracts/normalises units, assigns categories (via `ai-gateway`, Zod-typed output) ([ADR-007](./arther-adrs.md#adr-007)) | L |
| F7.3 | SpecReconciler | Shared service: normalised payload vs. current state → structured diff (additive by default; absent fields flagged, not deleted) | L |
| F7.4 | Two-step review screen | Dedicated screen: structural review, then field-level review; accept/correct/skip each element | L |
| F7.5 | Validation pass | Unknown units, embedded-unit cells, note-rows, duplicate names surfaced before commit | M |
| F7.6 | Commit as release | Applies the diff and auto-creates the initial named release | M |
| F7.7 | Import sessions | Dry-run state persisted in `import_sessions` (proposal, per-row decisions, commit record) — survives refresh, auditable | M |

**Acceptance:** a real customer spreadsheet imports into a correct field graph; re-importing an updated sheet shows an accurate diff and deletes nothing; commit creates a release entry. (Long imports run as a durable job — first use of [ADR-006](./arther-adrs.md#adr-006).)

---

## F8 — Foundation hardening (launch-readiness gate)

Maps to [`vibecode-best-practices.md`](../vibecode-best-practices.md).

| # | Task | Outcome | Est |
|---|---|---|---|
| F8.1 | RLS probe test | Automated test: a second user/workspace cannot read or mutate the first's rows (the #1 missed control) | M |
| F8.2 | Rate limiting | Upstash limits on auth, invitation, and import endpoints | S |
| F8.3 | Security headers | CSP, X-Frame-Options, HSTS, etc. on both apps | S |
| F8.4 | Backups verified | PITR confirmed; documented restore runbook; dev never shares prod data | S |
| F8.5 | Input validation sweep | Zod at every route/server-action boundary; least-privilege responses (no raw rows) | M |
| F8.6 | Single-handler audit | One handler per trigger (signup, invite) — no duplicate workflows | S |
| F8.7 | Workspace deletion (Danger Zone) | Soft delete via `request_workspace_deletion` RPC, 14-day grace + restore, `purge-deleted-workspaces` cron (replica-mode purge) | M |

**Acceptance:** the RLS probe test is green in CI; DevTools shows no secrets or over-broad responses; a restore from backup succeeds in a scratch project.

---

## Dependency graph & sequencing

```
F0 ─▶ F1 ─▶ F2 ─▶ F3 ─┐
                       ├─▶ F4 ─▶ F5 ─▶ F6
                       │              └─▶ F7
                       └────────────────────▶ F8 (runs alongside F4–F7, gates Phase-1 exit)
```

Critical path is F0→F1→F2→F3→F4→F5; F6 (UI) and F7 (import) can proceed in parallel once F5's schema lands; F8 hardening is continuous and is the exit gate. A pragmatic milestone order:

1. **M1 — Tenancy spine:** F0–F4. Sign up, workspace, invite, isolation proven (F8.1 early).
2. **M2 — Spec graph:** F5 + F6.1–F6.3. Create/edit specs by hand with history.
3. **M3 — Import:** F7. Real spreadsheets in; this is the adoption moment.
4. **M4 — Harden & dogfood:** finish F6/F8; enter the spec data for a real product.

---

## Out of scope for Phase 1 (next phases)

Document Types & Brand Profiles (Phase 1/2 seam), AI Document Generator, Block Editor, Smart Spec Tracking, Collaboration & Review, Publishing Portal, Content Reuse, Variants, Analytics surfaces, Ask Arther. The migrations for those domains are written in later migration files; only conventions + identity + spec database are needed now.

---

*Arther — Phase 1 (Foundation) Build Breakdown v0.1. Nine epics, dependency-ordered, exit-gated on provable tenant isolation and a real spreadsheet import. Pairs with the architecture, data model, and the `migrations/` SQL.*
