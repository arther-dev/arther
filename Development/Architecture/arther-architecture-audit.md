# Arther — Architecture Audit

**Date:** 9 June 2026 · **Auditor:** Claude (system-design review) · **Status:** ✅ ALL 20 FINDINGS RESOLVED (same day — see Resolution Log)
**Scope:** [`arther-architecture.md`](./arther-architecture.md) v0.1 · [`arther-adrs.md`](./arther-adrs.md) (12 ADRs) · [`arther-data-model.md`](./arther-data-model.md) v0.1 · migrations `0001`–`0011` · phase task docs 1–4
**Method:** every architecture/data-model claim cross-checked against the PRD, the 18 feature specs, and the actual migration SQL (line-level). Findings cite file and line — line numbers refer to the **pre-fix** files; the findings text below is preserved as written for the record.

---

## Resolution Log (9 June 2026)

All remediation was applied in place (the suite is greenfield — nothing deployed), then **verified against a real Postgres 17.5**: all 11 migrations apply cleanly from scratch (60 tables, 108 policies, 48 triggers, **0 tables without RLS**), and **37 behavioral probes pass** — including two-workspace isolation, viewer/editor/admin write tiers, snapshot forge/mutate/delete attempts under both JWT and service role, freeze and no-delete triggers, guard cascades, audit-trigger rows, FTS queries, and the soft-delete/restore/purge cycle.

| Finding | Resolution |
|---|---|
| **C1** snapshots forgeable/mutable/deletable | `0008` rewritten: members **select-only**; no authenticated INSERT (publish pipeline only) or DELETE; admin-gated UPDATE constrained by an extended freeze guard to `pdf_*`/`search_text`/`access_config`/archive; **no-delete trigger binds even the service role**; unpublish = `archived_at`; access/archive changes write `audit_log` rows from a DB trigger. Probes: viewer + owner forge/flip/delete all blocked; audit row verified. |
| **M1** search designed but unmodelled | `blocks.text_content` (editor-written) and `published_snapshots.search_text` (publish-extracted) + generated tsvectors + GIN in `0005`/`0008`; `documents.title` trgm. Extraction ownership documented (architecture §6, data model §5/§9/§14); portal queries latest non-archived snapshot only; tasks C4.5/C6.4/G4.7 updated. |
| **M2** releases/products/approvals unevenly immutable | `guard_release_frozen` (notes-only edits) + `release_field_values` no-update trigger + no delete policies (`0003`); `guard_product_hard_delete` blocks deletion with releases (`0003`) or variants (`0010`); `approval_records` no-delete trigger added (`0007`); `guard_document_hard_delete` protects publish history (`0005`). |
| **M3** viewers mint magic links | Issue/revoke now editor-gated; no delete policy (revocation = `revoked_at`); issuance + revocation audit-logged by DB trigger (`0008`). |
| **M4** generation run state had no home | `generation_runs` + `generation_run_sections` in `0005`: status, attempt, errors, token/cost accounting, produced blocks; members read (Realtime target), **service-role writes only** (probe: client forge blocked). FK to variants wired in `0010`. |
| **M5** no editor-engine decision | **ADR-013: TipTap (ProseMirror)** — atom inline nodes as spec tokens, stored tree = TipTap JSON = Zod schema (no converter); alternatives (Lexical, Slate, custom) recorded. Stack table + G4.3 updated. |
| **D1** role enforcement single-layered | `private.is_workspace_editor` helper (`0002`); every content table split read(member)/write(editor); Settings surfaces admin-gated; viewer rights preserved exactly where spec'd (comments, approvals — probed both directions). |
| **D2** import propagation storm | `propagate-batch` designed into architecture §5.2 + §8 (one pass per import session, items coalesced per (document, section, assignee), digest per assignee); task G6.2b added. |
| **D3** variant deltas escaped guards | Component guard extended to `variant_deltas` (all three FK roles) in `0010` (probed). |
| **D4** import dry-run state unmodelled | `import_sessions` in `0003`: proposal, per-row decisions, commit record, Storage key; no delete policy (audit trail); task F7.7. |
| **D5** reminders had no scheduler | `review-reminders` daily cron in architecture §8 + task C3.6 + partial index on `document_revisions(review_due_date) where state='review'` (`0005`). |
| **D6** 3 of 5 built-in Document Types | Quick Start + Declaration of Conformity seeded with section schemas (`0004`) — probe confirms 5. |
| **D7** workspace deletion = instant total loss | No JWT delete path; `request_workspace_deletion()` / `cancel_workspace_deletion()` RPCs (owner-only, audited), 14-day grace, tenancy helpers hide soft-deleted workspaces instantly, `purge-deleted-workspaces` cron purges via `session_replication_role = replica` (full cycle probed). |
| **D8** attribution overclaimed | `updated_by/at` + triggers added to `workspace_members` (= seat-transition record), `units`, `spec_categories`, `product_components`, `spec_templates`, `document_revisions`, `document_type_sections`, `document_type_approval_roles`, `custom_domains`, `snippet_embeds`, `block_variant_scopes`; guardrail re-worded to the actual rule (mutable entities; append-only = created-side). **Correction:** the original finding listed `comment_threads` as lacking `resolved_by` — the migration already had it (`0007:38`); withdrawn. |
| **N1** §13 misstated delete mechanism | Data model §13 rewritten: guards + targeted restrict + owned-children cascade. |
| **N2** ERD diverged from SQL | ERD now shows `component_id`/`product_id` + one-owner CHECK. |
| **N3** snippet embed dual representation | `position` dropped; `snippet_embeds.block_id` (unique) keys state to the placing block; invariant documented in `0009` + data model §8. |
| **N4** service-role-only inserts undocumented | Comments added (`0005` generation runs, `0008` snapshots; `0007`/`0011` already had them); pattern named in data model §10. |
| **N5** Upstash had no ADR | **ADR-014**: key scheme, delete-on-write invalidation, TTL backstop, never-authoritative rule, Redis-down degradation. |
| **N6** cross-spec tensions unrecorded | Five tension bullets added to architecture §15 with a recommended rule for each. |

Post-remediation dimension scores: Security & tenancy 72 → **95** (row-level seat boundary, pipeline-only snapshot creation, trigger-enforced immutability + audit); Data model & migrations 86 → **94**; Requirements coverage 88 → **95**. **Overall: 85 → ~94.** The remaining gap to 100 is execution risk (the app-owned extraction/`canDo` contracts), not design.

---

*The original audit follows, unchanged, for the record.*

---

## Verdict

**Overall: 85/100 — a strong, internally coherent architecture with one critical security inconsistency and a cluster of fixable gaps.** The stack fits the stated constraint set (solo founder, low cost, regulated rigor, low maintenance) unusually well, the ADRs are disciplined, and the data model realises nearly all of the spec set. The problems are concentrated where the documents *say* one thing and the migrations *do* another — exactly the kind of drift this suite was written to prevent.

| Dimension | Score | One-line assessment |
|---|---|---|
| High-level design & topology | 95 | Three-plane split is right; portal isolation is the best decision in the doc |
| Trade-off discipline (ADRs) | 92 | Real alternatives, fallbacks, revisit triggers; one major decision missing |
| Scale & reliability | 90 | Honest seams, no speculative infra; one fan-out scenario undesigned |
| Build readiness (phasing) | 90 | Dependency-ordered, RLS probes per phase, notifications built early |
| Requirements coverage | 88 | All 9 invariants + 3 guardrails mapped; search, seeds, reminders have gaps |
| Data model & migrations | 86 | ~57 tables, clean conventions; several doc-vs-SQL divergences |
| Security & tenancy | 72 | Excellent posture undermined by one policy that contradicts it (C1) |

Fix C1 before any real data exists; the Major items before Phase 3 (publishing); the rest are doc corrections and pre-wired additions.

---

## 1. What holds up well

Worth stating, because most of it should *not* change in remediation. The two-front-door topology gives the public surface a minimal attack footprint and makes portal traffic nearly free (frozen snapshots + CDN) — this is the architecture's best structural call. The shared block renderer (editor preview / portal SSR / PDF print) collapses the product's largest maintenance surface into one package. Zero-hallucination is engineered as a *checkable gate* (tool-use schema forces `InlineSpecToken{field_id, field_version_id}`, then a validation pass) rather than a prompt aspiration — that's the correct mechanism. Staleness as a single indexed join over `block_spec_references` is implemented exactly as specified (`bsr_staleness_idx`, `0005:103`). The RLS helper design is competent: security-definer membership helpers avoid policy recursion, `workspace_id` is denormalised onto child tables so policies stay single-predicate, built-in rows (`workspace_id is null`) are readable but not writable (`0003:255–266`, `0004:159–175`), and the workspace-creation bootstrap RPC solves the RLS chicken-and-egg. Append-only is genuinely enforced (trigger + no policy) for `audit_log`, `field_versions`, `magic_link_access_logs`, and `analytics_events`, with the field-version cascade carve-out correctly documented (`0003:140–144`). All twelve invariants/guardrails trace to concrete mechanisms in Appendix A, and the phase plan builds notifications early because three features deliver through it.

---

## 2. Critical

### C1 — `published_snapshots` RLS lets any member forge, mutate, or delete published documents

`0008:99–100`: `create policy snapshots_rw … for all to authenticated using (private.is_workspace_member(workspace_id))`.

`for all` grants **INSERT, UPDATE, and DELETE** to every workspace member — including Viewers (the free seat, per the billing spec the role given to external collaborators). The `guard_snapshot_frozen` trigger (`0008:33–47`) only protects `block_tree`, `resolution_manifest`, `version`, and `document_id`. Consequences, all reachable from a JWT client with zero app-code involvement:

- **Access exposure:** any member can flip `access_config` from `allowlist` to `public` on any published document. The architecture's own audit table (§11) classes publish actions as security-sensitive.
- **Forged publication:** any member can INSERT a snapshot row directly, bypassing the entire approval state machine and pre-flight pipeline (§5.3). Approval enforcement lives only in `canDo`.
- **History destruction:** any member can DELETE snapshots. Data model §12 lists `published_snapshots` as append-only, "never updated or deleted… enforced by convention + restricted grants (no `update`/`delete` for the app role)" — the migration grants exactly those.

This is the one place the defence-in-depth claim (ADR-010) actually inverts: the second layer *grants* what the first layer is supposed to deny, on the most compliance-sensitive table in the product. Contrast with `approval_records`, which gets it right (select + insert policies only, `0007:84–87`).

**Fix:** members get `select` only; INSERT/DELETE only via service role (publish pipeline), like `notifications` and `analytics_events`; UPDATE either service-role-only or an admin-gated policy restricted to `access_config` mutations; add a no-delete trigger (unpublish = archive flag, preserving history); write an `audit_log` row on any `access_config` change. Same review for `magic_links` (see M3).

---

## 3. Major

### M1 — Search is designed in prose but absent from the schema

Architecture §6 and data model §14 specify Postgres FTS: "GIN `tsvector` on document/block text and spec field names." The migrations contain **no tsvector column, no FTS index anywhere** — the only search index is one trigram index on `spec_fields.name` (`0003:124`). The README's claim that "nothing in the v1 spec set is left unmodelled" (`README:66`) is wrong on this point.

The deeper issue: the *design* is also incomplete. Portal search must index the **latest published release only** (analytics + portal specs), i.e. search runs over `published_snapshots.block_tree` — a single frozen JSONB blob that data model §11 says is "never queried piecemeal." Searching it requires an extracted searchable-text representation (generated column or side table populated at publish time), and nothing specifies one. In-app search over `blocks.content` (rich-text JSONB) has the same gap. This needs a half-page design decision — what gets extracted, when (publish-time for portal; write-time for app), and into what — plus a migration. It is cheap now and annoying later, because the extraction hook belongs inside the publish pipeline you're about to build in Phase 3.

### M2 — Entities the specs call immutable are unevenly protected

The append-only mechanism (trigger + no mutating policy) is applied to four tables but not to the rest of the stated set:

- **`product_releases` / `release_field_values`** — the spec calls releases "immutable snapshots," yet both have `for all` member policies (`0003:283–286`) and no mutation guard: any member can delete a release or edit its pinned values.
- **Products with releases can be hard-deleted.** There is no `guard_product_hard_delete` (verified: no such trigger exists in any migration). `documents.product_id` is `restrict` (`0005:13`) and `published_snapshots.product_id` is `restrict` (`0008:16`), so documented/published products are safe — but a product whose only dependents are releases cascades them away silently (`product_releases.product_id … on delete cascade`, `0003:75`), destroying pinned field history. Data model §13 lists products as archive-only entities; the migrations don't enforce it for this path.
- **`approval_records`** has a no-update trigger but no no-delete trigger (`0007:22–24`). RLS covers the JWT path (no delete policy → default deny), so this is defence-in-depth asymmetry rather than an open hole — but the trigger is the layer that catches service-role bugs, and approvals are the audit artifact regulated customers will ask about.

**Fix:** one pass that applies `prevent_mutation` (or guards) uniformly to the §12 list plus releases, and adds `guard_product_hard_delete` checking releases, variants, and briefs.

### M3 — Viewers can mint and revoke external access (magic links)

`magic_links_rw … for all` for any member (`0008:101–102`). A Viewer can create an open magic link to any gated document, revoke colleagues' links, or read every issued link's email + expiry. Magic-link issuance is an external-access grant — in the same security class as `custom_domains`, which *is* role-gated to owner/admin (`0008:105–107`). The inconsistency is the tell: gate link creation/revocation to member+ (or admin), keep token hashing (already correct — `token_hash`, `0008:54`), and log issuance to `audit_log`.

### M4 — The generation run's persisted state has no home

Architecture §5.1 and §16 are explicit: per-section progress and partial output are "persisted per section in Postgres and streamed to the client via Realtime," and partial failure saves completed sections with section-level retry. **No table models this.** It's absent from the data model's ~57 entities and all 11 migrations. Without it there is no Realtime subscription target, no resume-from-partial-failure record, and no per-workspace token/cost accounting row (§7 promises token logging). You need a `generation_runs` + `generation_run_sections` pair (status, attempt count, error, token counts, produced block ids) in the Phase 2 migration set. Trigger.dev holds execution state, but the product UX you specified reads from Postgres.

### M5 — The rich-text editor framework is the largest undecided dependency

The ADR set decides email vendors and UUID versions but not the engine for the product's core surface: a block editor with inline atomic spec tokens, one-level nesting, find/replace that must skip tokens, block-level comment anchoring with text ranges, and offline queueing. Whether this is TipTap/ProseMirror, Lexical, Slate, or custom determines the `blocks.content` JSONB node schema — which is already frozen into the data model and the AI tool-use contract. If the editor library's document model doesn't match the stored node tree, you'll either write a bidirectional converter forever or migrate every block. This needs an ADR-013 *before* Phase 2, with the token-as-atomic-inline-node requirement as the selection criterion (ProseMirror/TipTap's atom nodes and Lexical's decorator nodes both qualify; their JSON shapes differ materially).

---

## 4. Medium

**D1 — Role enforcement is single-layered for all content tables.** Every spec/document/brand table is writable by *any* member at the RLS layer (`…_rw for all` using membership only); the Editor-vs-Viewer seat boundary — which is also the **billing** boundary — exists only in `canDo`. ADR-010 frames RLS as tenancy-only, so this is a known trade-off, but the codebase already role-gates `workspaces`, `workspace_members`, `invitations`, and `custom_domains` (`0002:154–172`, `0008:105`), so the pattern and helpers exist. Adding `has_workspace_role(workspace_id, array['owner','admin','member'])` to write policies on content tables is ~30 lines across migrations and makes a `canDo` regression a non-event instead of a free-seat privilege escalation. Strongly recommended given Viewers are the external-collaborator seat.

**D2 — Bulk import will storm the propagation pipeline.** §5.2 designs single-field propagation (one task per `field_version` write). An Excel re-import that changes 300 fields enqueues 300 propagate tasks, each fanning out review items and notifications — the dashboard and inboxes flood, and the same document gets dozens of `SectionReviewItem`s. The import flow (`import-spec`, §8) needs a batch mode: one propagation pass per import commit, coalescing review items per (document, section, assignee) and notifications per assignee. The Smart Spec Tracking spec's grouped dashboard implies this; the architecture never says it.

**D3 — Variant deltas escape the archive guards.** `guard_component_hard_delete` checks `product_components` and `block_spec_references` (`0005:135–150`) but not `variant_deltas`, while `variant_deltas.component_id / replacement_component_id / new_component_id` all cascade (`0010:37–41`). A component referenced only as a variant's `COMPONENT_ADD`/`SWAP` target can be hard-deleted, silently deleting the delta and changing what the variant *means*. Extend the guard in `0010` (the migration already has the precedent: `0009` extends guards for library items).

**D4 — Import dry-run state is unmodelled.** The import flow is multi-step with a human confirm between diff and apply (§8; External Sync spec's dry-run/selective-commit applies to file import at v1). Where does the proposed diff live between "Claude interpreted the sheet" and "user committed"? Nothing models an `import_sessions` table (payload ref, proposed mutations, per-row accept/reject, status). Client-held state breaks on refresh and leaves no audit trail of what was approved — the audit trail being the point of the reconciler design.

**D5 — Due-date reminders have no scheduler.** Collaboration spec: reminder to pending approvers at the due date, escalation to the owner the day after. The job inventory (§8) has no scheduled task except post-launch sync, and Phase 3 captures the due date (`C0.4`) but never dispatches reminders. Add a daily Trigger.dev cron scanning `document_revisions.review_due_date` — small, but it's a spec'd v1 behavior that currently can't happen.

**D6 — Built-in Document Types: 3 seeded, spec says 5.** `0004:181–185` seeds Datasheet, Installation Manual, User Guide. The PRD/generator spec list five built-ins including **Quick Start** and **Declaration of Conformity** — the DoC being the one your regulated-industry positioning leans on. Either seed all five or record the descope.

**D7 — Workspace deletion is one statement away from total, immediate loss.** `workspaces_delete` is owner-only (`0002:159–160`) — correct — but `on delete cascade` from `workspaces` reaches every tenant table, so a single confirmed DELETE destroys all products, history, documents, and published portals instantly, with no recovery short of PITR. (`audit_log.workspace_id` has no FK — `0001` — so the audit trail survives; good, and worth keeping deliberate.) For the regulated posture, workspace deletion should be soft-delete + delayed purge (e.g. 14 days), which also matches the error-handling philosophy of archive-not-delete everywhere else in the product.

**D8 — The attribution guardrail is overclaimed.** Architecture §6 and data model §15 say `created_by/at` + `updated_by/at` are "mandatory on every entity from the first migration" (guardrail 2). In the SQL, 45 of 57 tables have no `updated_by`. Most are legitimately exempt (append-only tables; tables with domain-specific equivalents like `blocks.last_edited_by` or `overrides.set_by`), but several mutable, audit-relevant tables genuinely lack change attribution: `document_revisions` (state transitions — who submitted/returned a revision is the review workflow's spine), `custom_domains` (status changes on a security-sensitive table), `document_type_sections`, `units`, `spec_categories`, `snippet_embeds` (override-state changes), and `comment_threads` (no `resolved_by`). Either add the columns where mutation matters or rewrite the guardrail statement to name the actual rule (full attribution on core content entities; domain-specific or append-only elsewhere).

---

## 5. Minor

**N1 — Data model §13 misstates the delete mechanism.** "Foreign keys use `on delete restrict`" — in fact 7 FKs are `restrict`, 111 are `cascade`; the real mechanism is BEFORE-DELETE guards + targeted restricts. The implemented design is fine; the prose is wrong. Correct the doc so future-you trusts it.

**N2 — `spec_fields` ERD diverges from SQL.** Data model shows polymorphic `owner_type`/`owner_id` (`arther-data-model.md:151–153`); the migration uses `component_id` + `product_id` with `num_nonnulls(component_id, product_id) = 1` (`0003:118`). The SQL version is better (real FKs, real cascades); update the ERD to match.

**N3 — Snippet embeds have two representations.** A snippet placement exists both as a `blocks` row (`source='snippet'`, `snippet_id`) and a `snippet_embeds` row (with `position`). Document the invariant: the block row is the placement (position comes from `display_order`), `snippet_embeds` carries only override/staleness state — and drop `snippet_embeds.position`, or state who wins on disagreement.

**N4 — Insert paths that are service-role-only by omission should say so.** `analytics_events` and `notifications` have no JWT insert policy — correct (prevents spoofed events/notifications) but undocumented; a one-line comment in the migration prevents a future "fix" that adds the policy.

**N5 — Upstash has no ADR** despite holding the resolved-variant-spec cache — a correctness-relevant component (stale cache = wrong variant values in generation). Document invalidation keys and the cache-miss fallback (recompute from Postgres, which §16 already implies).

**N6 — Five tension points from the spec cross-read** worth a line each in the architecture's §15: variant "delta should be small" has no enforcement signal (when does the system suggest a separate product?); brand-profile render-time styling on frozen snapshots can shift the *semantics* of old documents if styling ever encodes value tiers; prose staleness resolves differently in snippets (source-level, propagates to all embeds) vs documents (per-block) — intended, but the dashboard should say which path a flag came from; domain-owner sign-off vs document-owner publish authority can deadlock a stale critical document if the owner is unavailable (the owner-override mechanism covers approvals, not domain reviews); placeholder-vs-omit behavior for missing brief fragments is an editorial policy that should be uniform across the 5 built-in Document Types.

---

## 6. Invariant re-verification

Appendix A of the architecture claims compliance; this audit re-checked each against the SQL.

| Invariant | Verified | Note |
|---|---|---|
| 1 Single source of truth | ⚠️ | Design yes; C1 lets members insert unsanctioned snapshot copies |
| 2 Block-first, six sources | ✅ | `blocks.source` check constraint, 6 values; 20 block types confirmed (`0005`) |
| 3 Graph not tree | ✅ | `product_components` edges + self-nest parent (`0003:74–77`) |
| 4 Two-speed update | ✅ | Propagation task design + `bsr_staleness_idx`; D2 (bulk) is the residual risk |
| 5 Working copy vs snapshot | ⚠️ | Split is clean; snapshot immutability not enforced (C1) |
| 6 Zero-hallucination | ✅ | Token-only contract + validation pass; M4 needed to make runs auditable |
| 7 Archive-only | ⚠️ | Guards exist for components/fields/library items; products (M2) and variant deltas (D3) escape |
| 8 Unified notifications | ✅ | One table, recipient-scoped RLS, service-role insert only (`0007:97–100`) |
| 9 Single LLM provider | ✅ | `ai-gateway` as instrumentation-not-abstraction is the right reading |
| G1 `canDo` | ✅ | Single authority; D1 recommends backstopping the role boundary |
| G2 Attribution | ⚠️ | Core content tables yes; 45/57 tables lack `updated_by`, several audit-relevant (D8) |
| G3 Decoupled auth | ✅ | `users` ⇄ `auth_providers` from `0002` |

---

## 7. Remediation order

1. **C1 + M3** — one migration: rewrite `0008` policies (snapshots select-only; magic links role-gated; service-role inserts), add snapshot no-delete trigger + access-config audit hook. Do before any real workspace exists; policy rewrites after launch are painful.
2. **M2 + D3 + D8** — the immutability/guard/attribution sweep migration (releases, product guard, approval no-delete, variant-delta guard, `updated_by` on the mutable tables that matter).
3. **M5** — editor-framework ADR-013 before any Phase 2 editor code; validate the `blocks.content` node schema against the chosen library.
4. **M4 + D4** — add `generation_runs`/`generation_run_sections` and `import_sessions` to the Phase 2 migrations.
5. **M1** — search-extraction design note + tsvector migration; hook extraction into the Phase 3 publish pipeline.
6. **D1, D2, D5, D6, D7** — fold into their phase task lists (D1 into Phase 1 hardening; D2/D5/D6 into Phases 2–3; D7 into Phase 1 admin).
7. **N1–N6** — documentation pass on the data model + architecture §15.

None of this changes a stack choice, a topology decision, or an ADR outcome — the remediation is policies, guards, four missing tables, one new ADR, and prose corrections. That's the sign of an architecture that's fundamentally right.

---

*Audit of Arther architecture suite v0.1 (8 June 2026 docs, 11 migrations, 4 phase plans) against the PRD, 18 feature specs, and line-level SQL. 1 Critical · 5 Major · 8 Medium · 6 Minor — all resolved 9 June 2026 (see Resolution Log at top; verified by 37 behavioral probes against Postgres 17.5). Post-remediation score ~94.*
