# Cost guardrails audit (H.6)

Phase-4 task **H.6** — confirm the v1 cost posture matches
[architecture §13](arther-architecture.md). This is a *confirmation* audit: the
guardrails are already in the code (built across Phases 1–2 under G8.x); H.6
verifies each one against §13 with evidence and records the single deferred item.

§13 names the levers: **concurrency caps on generation**, **prompt caching**
(stable Document-Type prompt prefixes), **token accounting** via the
`document_generated` event, a **cache-served frozen-snapshot portal**, and **no
idle/always-on compute** (everything scales to zero). Each is checked below.

## 1. Prompt caching — ✅ wired and effective

Anthropic prompt caching needs two things: a **byte-stable prefix** and the call
must **request** caching. Both hold for multi-section document generation:

- **Stable prefix.** `buildSectionPrompt` (`packages/ai-gateway/src/generation.ts:82`)
  puts only the fixed rules in `system`; the section name, spec fields, and brief
  go in `user`. So every section of a run shares a byte-identical `system`.
  Guarded by the `generation.test.ts` "keeps the system rules byte-stable across
  sections" test.
- **Caching requested.** `generateDocument` calls `generateSection(…, true)`
  (`generation.ts:249`), and the gateway sends the stable system as a cacheable
  block — `cache_control: { type: 'ephemeral' }` (`index.ts:191`). A one-off block
  regeneration leaves it off (no prefix to reuse). Guarded by the two H.6
  `generation.test.ts` tests ("requests prompt caching for every section of a
  run" / "does not cache … a one-off section by default").

Net: section 1 writes the cache, sections 2..N read it — token cost stays
proportionate to real generation, exactly per §13.

## 2. Generation concurrency — ✅ bounded per run; ⏳ global cap deferred (Trigger.dev)

- **Per run:** `generateDocument` (`generation.ts:243`) generates sections
  **sequentially** (`for … of` + `await`) — never a parallel fan-out — so at most
  one Claude call per run is in flight. (This is also what lets the prompt cache
  hit, since the cache is written before the next read.)
- **Across runs:** §13 places the *global* concurrency cap on **Trigger.dev**
  (the single async system, architecture §11). Trigger.dev is **not provisioned at
  v1** (tasks V.5/V.6), so generation currently runs **inline** in the request.
  Inline generation is itself self-limiting (it occupies the request worker), but a
  workspace-level concurrency ceiling lands with the Trigger.dev migration.
  **Deferred → V.6.**

## 3. Token accounting (metering hook) — ✅ present

Every generation emits a `document_generated` analytics event carrying
`inputTokens` + `outputTokens` (`specs/generate/actions.ts:354`), fed by the
gateway's `onUsage` callback (`index.ts:205`). §13 calls this "the hook for
metering later, which v1 deliberately omits" — the data is captured now; the
billing/metering UI is post-launch (see also H.4 seat tracking).

## 4. Portal cache (the biggest cost lever) — ✅ ISR + tag-bust

Published documents are frozen snapshots served from cache, so portal traffic is
"nearly free regardless of volume" (§13):

- ISR `revalidate` on every portal route — library `= 600s`
  (`[workspace]/page.tsx:15`), document `= 600s`
  (`[workspace]/[product]/[document]/page.tsx:35`), immutable versioned snapshot
  `= 3600s` (`…/v/[version]/page.tsx:31`).
- Data reads wrapped in `unstable_cache` keyed by `portalTag(workspace)`.
- **On publish**, the app calls `/api/revalidate` (`apps/portal/src/app/api/revalidate/route.ts`)
  → `revalidateTag(portalTag(...))`, so a publish busts the cache immediately
  rather than waiting out the window.
- Only the genuinely dynamic routes opt out (`access` gate, `track` beacon — both
  `force-dynamic`).

## 5. No idle / always-on compute — ✅ scale-to-zero

- Both apps are **serverless** (Next.js on Vercel functions); there is no
  `app.listen` / `createServer` / `setInterval` / `while(true)` daemon in app code.
- Scheduled work is **on-demand Vercel cron**, not a worker: a single entry,
  `/api/cron/review-reminders` at `0 9 * * *` (`apps/app/vercel.json`); the portal
  has no crons (`apps/portal/vercel.json`).
- Postgres (Supabase) and the CDN scale with use; nothing is pinned "always on".

## Verdict

**YES** — the v1 cost posture matches architecture §13. The one open item is the
**global generation concurrency cap**, which is intrinsically tied to the
Trigger.dev async runner and lands with **V.6** (Trigger.dev is unprovisioned at
v1; generation runs inline and sequentially in the meantime). No idle compute, no
metering gaps, and the two dominant cost levers — Claude tokens and portal serving
— are both guarded (prompt caching + sequential generation; frozen-snapshot ISR).
