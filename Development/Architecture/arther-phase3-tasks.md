# Arther — Phase 3 (Collaboration & Publishing) Build Breakdown

**Date:** 8 June 2026 · **Status:** Proposed · Companions: [`arther-architecture.md`](./arther-architecture.md) · [`arther-data-model.md`](./arther-data-model.md) · [`arther-phase2-tasks.md`](./arther-phase2-tasks.md) · [`migrations/`](./migrations)

Phase 3 completes the document lifecycle: review and sign-off, the unified notification system, and the branded Publishing Portal with frozen snapshots, PDF, gated access, and custom domains. This is where the second deployment (the portal), Resend, the Vercel Domains API, and the Playwright PDF task come online ([ADR-002](./arther-adrs.md#adr-002), [ADR-008](./arther-adrs.md#adr-008), [ADR-009](./arther-adrs.md#adr-009), [ADR-011](./arther-adrs.md#adr-011)).

Epics in dependency order (C0 → C9), each with outcome, acceptance criteria, and rough sizing (S/M/L). Persistence is in migrations [`0007`](./migrations/0007_collaboration.sql)–[`0008`](./migrations/0008_publishing_portal.sql).

**Definition of done for Phase 3:** an author submits a Draft for review, the required approver roles sign off (AND-logic), and the owner publishes — producing a frozen, versioned snapshot served as a branded SSR page at a custom domain with a downloadable PDF. Gated documents require a magic link; published content stays frozen while spec changes continue to flag only the working copy.

---

## C0 — Document lifecycle state machine

Drives `document_revisions.state` (column shipped in Phase 2) through its transitions. Flow in [collaboration spec](../../Features/Spec%20Docs/arther-collaboration-review.md).

| # | Task | Outcome | Est |
|---|---|---|---|
| C0.1 | Transitions | Draft→Review→Approved→Published, plus Review→Draft (pullback/reject) and Published→Draft (new revision), each gated by `canDo` (invariant: working copy vs. snapshot) | M |
| C0.2 | Revision creation | New revision = working copy from the current published snapshot; explicit, not automatic | M |
| C0.3 | Protect docs in review | Any change that compromises a doc in Review returns it to Draft (PRD §7.13) | S |
| C0.4 | Submit metadata | Optional review brief + due date on submission | S |

**Acceptance:** transitions only fire when `canDo` allows; creating a revision clones the snapshot into an editable working copy; editing a structural dependency of a doc in Review sends it back to Draft.

---

## C1 — Approval workflow

Implements approval tables in [`0007_collaboration.sql`](./migrations/0007_collaboration.sql); roles configured in Phase 2 (G0.3).

| # | Task | Outcome | Est |
|---|---|---|---|
| C1.1 | AND-logic gate | All required Document-Type roles must approve before Approved; any member of a role can approve for it | M |
| C1.2 | Approval records | Append-only `approval_records` (approved/rejected/owner_override) with mandatory reason on reject/override | M |
| C1.3 | Reset on rejection | Rejection returns to Draft and clears all collected approvals; owner re-submits | S |
| C1.4 | Approver minor edits | Approvers may make minor text corrections in Review without a rejection cycle | M |
| C1.5 | Owner override | Owner can force-advance past outstanding approvals; logged to `audit_log` | S |

**Acceptance:** a doc can't reach Approved until every required role has an approval; a rejection wipes prior approvals; an owner override is recorded in the audit log with a reason.

---

## C2 — Comments

| # | Task | Outcome | Est |
|---|---|---|---|
| C2.1 | Threads & replies | Block-anchored and text-range-anchored threads; one-level replies | M |
| C2.2 | Resolve / reopen | Open ↔ resolved status | S |
| C2.3 | Orphaning | Block deleted/regenerated or anchored text edited → thread `orphaned` (preserved, flagged) | M |
| C2.4 | Revision-scoped carry-forward | Unresolved comments carry to a new revision, marked inherited | M |
| C2.5 | @mentions | Mention workspace members; routes through notifications (C3) | S |

**Acceptance:** a text-range comment survives unrelated edits but orphans when its anchor text changes; unresolved comments appear on the next revision flagged as inherited; an @mention notifies the mentioned member.

---

## C3 — Unified notification system

Feature 6 owns delivery for the **whole** product (invariant 8). Implements `notifications` + `notification_preferences`.

| # | Task | Outcome | Est |
|---|---|---|---|
| C3.1 | Notification model | Typed events + payloads; in-app rows; per-user read state | M |
| C3.2 | Preferences | Per-user, per-event in-app / email toggles | S |
| C3.3 | Dispatch task | Trigger.dev fan-out: write in-app rows + send email via Resend per prefs ([ADR-011](./arther-adrs.md#adr-011)) | M |
| C3.4 | In-app panel | Notification panel + unread badge | M |
| C3.5 | Wire all producers | Smart Spec Tracking, Content Reuse, review requests, @mentions all dispatch through this one system | M |
| C3.6 | Due-date reminders | Daily `review-reminders` cron: pending approvers reminded at `review_due_date`, owner escalated the day after (collab spec) | M |

**Acceptance:** every notifying feature delivers through this system (no feature sends its own email); disabling an event's email preference suppresses only that email; the in-app panel shows unread counts.

---

## C4 — Publish pipeline & frozen snapshot resolver

Implements `published_snapshots`. Flow in architecture §5.3.

| # | Task | Outcome | Est |
|---|---|---|---|
| C4.1 | Pre-flight checks | Blocking (vacant approval role, placeholder/error blocks) + advisory (stale blocks, missing alt text) with logged acknowledgement | M |
| C4.2 | Snapshot resolver | Resolve every spec token to a concrete value, flatten snippets, compute ToC → `ResolvedBlock[]` + `resolution_manifest` | L |
| C4.3 | Immutable snapshot | Write versioned `published_snapshots` (`pdf_ready=false`); content frozen by DB guard; presentation/access editable | M |
| C4.4 | Versioning | Semantic version per published revision; previous snapshots retained for rollback | S |
| C4.5 | Search extraction | Publish pipeline writes `published_snapshots.search_text` (plain-text projection of the resolved tree) — feeds the portal FTS index | S |
| C4.6 | Unpublish = archive | `archived_at` on snapshots (rows are never deleted); access-config changes audit-logged by DB trigger | S |

**Acceptance:** publishing resolves all dynamic content into a self-contained snapshot; the snapshot's content cannot be mutated afterward (DB rejects it); a later spec change does not alter any published snapshot.

---

## C5 — PDF generation

| # | Task | Outcome | Est |
|---|---|---|---|
| C5.1 | Playwright PDF task | Trigger.dev task prints the portal's SSR HTML via `@media print` ([ADR-008](./arther-adrs.md#adr-008)) | L |
| C5.2 | Degradation contracts | Per-block-type PDF degradation honoured by the shared renderer | M |
| C5.3 | Ready gate | Document appears on the portal only when `pdf_ready=true`; PDF failure fails the publish with retry | M |
| C5.4 | Storage + download | PDF stored in Supabase Storage; portal serves a direct download | S |

**Acceptance:** publishing yields a PDF that matches the web rendering with correct per-block degradation; the document is not portal-visible until the PDF is ready; a failed PDF job is retryable without re-running the whole publish.

---

## C6 — Publishing portal app

Separate Next.js deployment ([ADR-003](./arther-adrs.md#adr-003)); reads only `published_snapshots`.

| # | Task | Outcome | Est |
|---|---|---|---|
| C6.1 | Portal deploy | `apps/portal` on Vercel; service-role data path scoped by workspace/host | M |
| C6.2 | SSR + hydration | Server-render snapshot HTML; hydrate interactive blocks (accordion, step wizard, hotspot, video) | L |
| C6.3 | Navigation | Product grid homepage · product landing · document page; versioned URLs | L |
| C6.4 | Portal search | Full-text over `published_snapshots.search_tsv` (GIN), latest non-archived snapshot per document only | M |
| C6.5 | Caching | CDN-cache snapshots; revalidate affected paths on publish | M |

**Acceptance:** a published document renders server-side (crawlable, readable without JS) and hydrates its interactive blocks; the homepage updates automatically on publish; versioned URLs are stable.

---

## C7 — Access control & magic links

| # | Task | Outcome | Est |
|---|---|---|---|
| C7.1 | Access tiers | Per-document public / open magic link / allowlisted magic link | M |
| C7.2 | Magic link issue/validate | Signed, time-limited tokens; 24-hour sessions; not Supabase accounts | M |
| C7.3 | Allowlist | Email and domain allowlisting for gated docs | S |
| C7.4 | Revocation & changes | Immediate revocation; access-config changes affect new requests only (active sessions run to expiry) | S |
| C7.5 | Access logging | Every access event logged (consumption analytics + audit) | S |

**Acceptance:** a public doc loads anonymously; an allowlisted doc rejects an off-list email and admits an on-list one via link; revoking a link blocks new requests; access events are logged.

---

## C8 — Custom domains

| # | Task | Outcome | Est |
|---|---|---|---|
| C8.1 | Slug subdomain | `{slug}.arther.io` via wildcard domain | S |
| C8.2 | Custom domain onboarding | CNAME flow + Vercel Domains API add + automatic TLS ([ADR-009](./arther-adrs.md#adr-009)) | M |
| C8.3 | Routing & canonical | Host→workspace resolution; custom domain canonical for SEO | M |

**Acceptance:** a customer points a CNAME and enters their domain; Arther provisions a certificate and serves the portal there with canonical tags pointing at the custom host.

---

## C9 — Phase 3 hardening

| # | Task | Outcome | Est |
|---|---|---|---|
| C9.1 | Snapshot immutability test | Confirm content columns reject updates; only `pdf_ready`/access mutate | S |
| C9.2 | Portal isolation | Portal cannot read drafts/specs; only snapshots; verify with a probe | M |
| C9.3 | SEO | `sitemap.xml` from published snapshots; canonical/meta; robots | M |
| C9.4 | Magic-link rate limiting | Upstash limits on link requests; abuse protection | S |
| C9.5 | Accessibility | Portal meets the WCAG bar from the existing a11y audit | M |
| C9.6 | Analytics events | `document_state_changed`, portal `document_viewed` / `document_downloaded` / `portal_searched` | S |

**Acceptance:** the snapshot-immutability and portal-isolation probes are green; a published portal is crawlable and accessible; magic-link endpoints are rate-limited; lifecycle and consumption events fire.

---

## Dependency graph & sequencing

```
C0 ─▶ C1 ─▶ C4 ─▶ C5 ─▶ C6 ─▶ C7 ─▶ C8
       │            └────────────────────▶ C9 (continuous; Phase-3 exit gate)
C2 ─▶ C3 ─┘   (notifications underpin review requests, mentions, staleness email)
```

`C3` (notifications) is built early because review requests, @mentions, and the Phase 2 staleness alerts all deliver through it. `C0`→`C1` establish sign-off; `C4`→`C5`→`C6` build the publish→snapshot→PDF→portal chain; `C7`/`C8` gate and brand it. Milestone order:

1. **M9 — Sign-off:** C0–C3. Review, approve, and notify end-to-end (inside the app).
2. **M10 — Publish:** C4–C6. Frozen snapshot → PDF → branded SSR portal.
3. **M11 — Gate & brand:** C7–C8. Access tiers, magic links, custom domains.
4. **M12 — Harden & launch-ready:** C9. The full lifecycle, dogfood-published.

---

## Out of scope for Phase 3 (Phase 4)

Content Reuse (snippets/templates + the snippet review wiring), Product Variants (delta model, generate-merge, portal variant picker), Analytics surfaces (dashboards over the events), and Ask Arther. Their tables land in `0009+`.

---

*Arther — Phase 3 (Collaboration & Publishing) Build Breakdown v0.1. Ten epics completing the lifecycle through review, sign-off, notifications, and a frozen-snapshot branded portal with PDF, gated access, and custom domains. Pairs with migrations 0007–0008.*
