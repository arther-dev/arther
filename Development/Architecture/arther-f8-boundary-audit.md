# Arther — F8.5 / F8.6 boundary audit

**Date:** 15 June 2026 · **Auditor:** agent session · **Status:** ✅ Both gates closed
**Scope:** every untrusted-input boundary (route handlers, server actions, page
`searchParams`/`params`, middleware) and every lifecycle trigger handler in
`apps/app` + `packages/db` + `supabase/migrations`.
**Method:** read the code (not just tested) — the launch-gate rule for §6 of
[`vibecode-best-practices.md`](./vibecode-best-practices.md). Two parallel sweeps:
input-validation/least-privilege (F8.5) and single-handler (F8.6).

---

## F8.5 — Input validation sweep ([best-practices §2/§3](./vibecode-best-practices.md))

**Zod at every server-action boundary — already held.** All 16 server actions
across the four `actions.ts` files (`(auth)`, `(shell)/specs`,
`(shell)/settings`, `(shell)/specs/import`) `safeParse` their `FormData` before
any use, and the `auth/callback` route guards the open-redirect
(`next` must be a same-origin path). No gaps.

**Least-privilege responses — already held.** `packages/db` has **zero**
`select('*')`: every read names its columns (`FIELD_COLUMNS`, `SESSION_COLUMNS`,
`id, name, email`, …) and reads use `.maybeSingle()`, so a valid-but-missing id
returns `null` (handled) and no internal columns leak to the client.

**Gap found & fixed — unvalidated page-boundary params.** Server-component
pages cast untrusted `searchParams`/dynamic `params` straight to a branded id
(`field as SpecFieldId`, `sessionId`) that then reached a `uuid`-typed
`.eq('id', …)`. RLS still protected the data, but a malformed value
(`?field=abc`, `/specs/import/not-a-uuid`) threw a Postgres cast error → **500**,
violating "Zod at every boundary". Fixed by validating at the page boundary with
the existing branded-id schemas (`specFieldIdSchema`/`productIdSchema`,
`safeParse(…).data`) — invalid/absent now degrades to "no detail panel" / "first
product" / the existing "Import not found" state instead of crashing:

| File | Param | Fix |
|---|---|---|
| `(shell)/specs/page.tsx` | `field`, `product` | `specFieldIdSchema`/`productIdSchema.safeParse().data` |
| `(shell)/specs/library/page.tsx` | `field` | `specFieldIdSchema.safeParse().data` |
| `(shell)/specs/import/[sessionId]/page.tsx` | `sessionId` | `z.string().uuid()` guard → not-found state |
| `(shell)/specs/import/page.tsx` | `product` | constrained to an existing product (`products.find`) |

Middleware in both apps trusts no request-supplied header for an auth/redirect
decision (it reads `x-forwarded-host`/`-proto` only to build same-host redirect
URLs, already shipped F8.3-adjacent). No change.

## F8.6 — Single-handler audit ([best-practices §6](./vibecode-best-practices.md))

Every lifecycle trigger has exactly **one** canonical handler — no duplicate or
overlapping workflows (the silent vibe-coding failure mode). Confirmed by reading
each path end to end:

| Trigger | Single handler | Path |
|---|---|---|
| Signup (password) | ✓ | `signUp()` → Supabase `auth.signUp` → PKCE callback |
| Signup (Google OAuth) | ✓ | `continueWithGoogle()` → `signInWithOAuth` → same PKCE callback |
| User-row creation | ✓ | `on_auth_user_created` → `handle_new_user()` (`0002`, `on conflict do nothing`) — the only place a `public.users` row is minted; no app-side duplicate |
| Invite create | ✓ | `inviteMemberAction()` → `createInvitation()` → one `workspace_invitations` insert |
| Invite accept | ✓ | `acceptInviteAction()` → `acceptInvitation()` → `accept_workspace_invitation` RPC (`0014`) |
| Workspace creation | ✓ | `createWorkspace()` → `create_workspace` RPC (`0003`, atomic: workspace + owner member + seeded defaults) |
| First-run bootstrap | ✓ | one decision point — `dashboard/page.tsx` `getActiveWorkspace()` → `/welcome` |

The PR-#21 duplicate-limiter (a parallel F8.2 rate limiter) was already closed in
a prior session; no second copy resurfaced. Sorting every action/route/RPC by
name surfaced no near-duplicate pair.

**Verdict:** F8.5 and F8.6 closed. Gates `pnpm turbo lint typecheck test build`
green (38/38), migration drift in sync (no schema change).
