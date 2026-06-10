# Arther — App-Wide Information Architecture (Skeleton)

**Version:** 0.3
**Date:** 4 June 2026
**Status:** App-wide IA skeleton — the **parent placement map** for the whole product. Places every planned feature on its home screen and names the per-screen IA passes that expand each region. Not a per-page IA.
**Builds on:** `Feature IA/arther-app-shell-ia.md` (the global frame) and the 18 feature specs + PRD + Product Overview.
**Children:** `Feature IA/arther-editor-ia.md` (done) and the per-screen IAs still to be written (see §9). *(Per-screen/feature IAs live in the `Feature IA/` subfolder; this parent map stays at the top of `Design/IA/`.)*
**v0.2 (4 Jun 2026) — planning gaps resolved (decision log in §11):** assistant reconciled to **read+write, opened from the top-bar Help icon** (shortcut **⌘J**), `⌘K` stays with the command palette, the assistant owns spotlight, **no floating character**; **Brand Profiles consolidated into Settings** (Portal → Branding removed); **Document Quality Standards** gets its own Settings section; medium/low gaps resolved with defaults. The required **source-spec edits have now been applied** (Ask Arther v1.1, Onboarding v1.1, Workspace Admin v1.1, Publishing Portal v1.3, Block Editor copy fix) — see §11.2.
**v0.3 (4 Jun 2026):** **Reviews & Approvals is now a dedicated rail view in Documents** (Library · **Reviews** · Templates · Archive) — a workspace review/approval queue; the per-document Review surface remains the drill-in. This **overrides** the App Shell IA's "Review is not a rail item" note (shell doc updated to match). See §11 Decision 12.

---

## 1. Purpose & Scope

This is the **connective tissue between the App Shell IA and the per-screen IA docs.** The App Shell IA defines the *frame* (six modes, five regions, the tab system). The per-screen IAs (Editor done; the rest queued) define the *interior* of one surface in depth. This document sits between them and answers one question for the whole product:

> **Every feature in every spec — which screen does it live on, and what still needs designing?**

It exists so that as we design each section of Arther, we already know what belongs where, nothing is orphaned, and the planning gaps are visible before we start drawing pixels.

**In scope:** the app-wide sitemap; a mode-by-mode placement of every feature and sub-feature with a light content sketch; the cross-cutting layer (assistant, notifications, command palette, connectivity, overlays); the public portal as its own visitor domain; a feature→screen coverage matrix; the per-screen IA roadmap; app-wide naming and URL strategy; and a decision log (§11) with the source-spec edits still required.

**Out of scope (deferred to each per-screen IA):** detailed content hierarchy, component-level layout, interaction states, micro-flows, and all visual / design-system work. Contested placements are **resolved in §11** (decisions taken 4 Jun 2026).

**Sources placed:** Spec Database v1.5, AI Document Generator v1.2, Visual Block Editor v1.2, Smart Spec Tracking v1.3, Publishing Portal & Export v1.2, Collaboration & Review v1.1, Content Reuse v1.1, Product Variants v1.2, External Sync v1.1 *(deferred)*, Workspace Admin v1.0, Onboarding v1.0, Analytics v1.0, Billing v1.0, Error Handling & Lifecycle v1.0, Connectivity v1.0, Enterprise Readiness *(guardrails)*, Ask Arther v1.0, Product Synthesis.

---

## 2. How to Use This Document

1. **To place a feature:** find it in the §7 coverage matrix → it points you to the mode/surface and the per-screen IA that owns its detail.
2. **To design a screen:** read that mode's entry in §4–§6 (what lives there + the content sketch), then open or commission its per-screen IA (§9).
3. **To see what's decided:** §11 is the decision log — every gap's resolution plus the source-spec edits still required to fully close the conflicts.

**The three-layer IA model:**

```
Feature IA/arther-app-shell-ia.md  → the FRAME   (regions, modes, tabs, nav)   [done]
arther-app-ia.md  (this doc)       → the MAP     (every feature → its screen)  [this pass]
Feature IA/arther-<screen>-ia.md   → the INTERIOR (one surface, in depth)      [editor done; rest queued]
```

---

## 3. App-Wide Sitemap

Three planes: the **authoring app** (the shell, one page, in-app tabs), the **cross-cutting layer** (present on every mode), and the **public portal** (a separate visitor domain). URL patterns follow the shell's `/{module}/{object-type}/{id}/{sub-view?}`.

### 3.1 Authoring app (behind login)

```
Dashboard  /dashboard
  └─ Action items (section reviews · approvals · override reviews · snippet reviews ·
                   placeholder-brief · mentions · review requests)  ← Smart Spec Tracking + Collaboration
  └─ Admin setup checklist (first-run)                              ← Onboarding
  └─ Activity (optional segmented view)

Specs  /specs
  ├─ Products            /specs/product/{id}
  │   ├─ Field grid + detail/history/comments (3-panel)
  │   ├─ Product Brief tab (entity-level narrative fragments)   ← AI Generator
  │   ├─ Variants tab → Variant delta editor
  │   ├─ Domain Ownership panel (per-product)
  │   ├─ Spec Coverage report (tab)
  │   └─ Export · Release history · Create release
  ├─ Component Library   /specs/component/{id}
  └─ Releases            /specs/release/{id}
  └─ [flow] Import / Re-import  (full-canvas) → commits a release

Documents  /documents
  ├─ Library             /documents              (list · saved views)
  ├─ Reviews             /documents/reviews       (review & approval queue — rail view)  ← Collaboration
  ├─ Templates           /documents/templates    (document templates — Content Reuse)
  ├─ Archive             /documents/archive
  ├─ Editor              /documents/{id}/edit     ← arther-editor-ia.md
  │   ├─ Inspector: Properties · Comments · History · (Variants) · (Analytics) · (Library)
  │   ├─ Preview: Portal / PDF
  │   ├─ Canonical ⇄ Variant preview
  │   └─ "Go to Product Brief" → opens the brief tab in Specs (not edited here)
  ├─ Review surface      /documents/{id}/review   (read-only; per-document; drill-in from Reviews)
  ├─ Publish dialog      /documents/{id}/edit?dialog=publish
  └─ [flow] New Document wizard (full-canvas) → drops into Editor   ← AI Document Generator
  └─ [flow] Duplicate document (full-canvas)                        ← Content Reuse

Snippets  /snippets
  ├─ Snippets            /snippets/{id}
  ├─ Block Library       /snippets/library
  └─ Library item editor (full-canvas)

Portal  /portal   (management of the public site — not the site itself)
  ├─ Published           /portal/published   (releases · versions · archive)
  ├─ Domains             /portal/domains      (custom domain · TLS)
  ├─ Access & Leads      /portal/access       (gating · allowlists · magic links · audit log)
  └─ Analytics           /portal/analytics    (consumption + workspace analytics)
       (Branding moved to Settings → Brand Profiles in v0.2)

Settings  /settings   (Owner/Admin, except Notifications which is per-user)
  ├─ Workspace                  /settings/workspace
  ├─ Members                    /settings/members
  ├─ Document Types             /settings/document-types       (schema · approval roles · default brand)
  ├─ Document Quality Standards /settings/quality-standards    ← AI Generator (own section, v0.2)
  ├─ Brand Profiles             /settings/brand-profiles       (profile · editor · portal apply · custom CSS · staged apply · preview)
  ├─ Domain Ownership           /settings/domain-ownership     ← Smart Spec Tracking
  ├─ Spec Categories            /settings/categories           ← Spec Database
  ├─ Units                      /settings/units                ← Spec Database
  ├─ Notifications              /settings/notifications        ← Collaboration (per-user)
  ├─ Integrations               /settings/integrations         ← External Sync  [POST-LAUNCH placeholder]
  └─ Billing                    /settings/billing              ← Billing        [POST-LAUNCH placeholder]
```

### 3.2 Cross-cutting layer (every mode — no mode of its own)

```
Top bar         module switcher · universal tabs · ⌘K command palette/search · utility cluster
Utility cluster notifications (unified) · Help (opens Ask Arther) · workspace switcher [reserved] · account · connectivity indicator
Ask Arther      read+write assistant · opened from top-bar Help (⌘J) · slide-in panel · owns spotlight · no floating character (v0.2)
Overlays        spotlight (Ask Arther) · archive-block dialog · pre-flight checks · modals · toasts
Empty states    per-mode first-run states
```

### 3.3 Public portal (separate domain — its own visitor IA, §6)

```
{workspace}.arther.io/                              Homepage (product grid)
  └─ /{product-slug}/                               Product landing (description · docs by type · variant picker)
       └─ /{product-slug}/{doc-slug}/               Document (latest release)
            └─ /{product-slug}/{doc-slug}/v{n.n}    Document (specific release)
       └─ /{product-slug}/{variant-slug}/           Variant page (variant switcher)
  └─ magic-link access (email entry → session)      gated documents
  └─ search · PDF download
```

---

### 3.4 Primary Cross-Mode User Flows

The critical paths that *cross* modes — they show how the screens connect and why the placement is what it is. Detailed in-screen flows belong to each per-screen IA (§9).

**Flow A — Spec → Document → Portal (the core pipeline)**
1. **Specs** — author or **Import** a product (full-canvas import → commits a release).
2. **New Document** flow — pick doc type · product · brand profile · brief; pre-flight completeness shows populated vs. null fields → atomic generate.
   - Null *required* field → **placeholder block** (will block publish until filled).
3. **Editor** — refine prose around locked spec tokens; clear placeholders.
4. **Send for review** → **Review** surface — assigned roles comment/approve (AND-logic).
   - Rejected → Draft (approvals reset). · Approved → **Publish dialog** (version, visibility) → frozen snapshot + PDF → **Public Portal**.

**Flow B — Spec change → staleness → republish (the differentiator)**
1. **Specs** — edit a field; **pre-commit note** shows blast radius ("triggers review in N documents").
2. Save → auto-cascade: structured tokens/tables auto-update in working copies; prose is flagged.
3. **Dashboard** — domain owners receive **section_review** items → **review modal** (git-diff) → Approve / Edit prose.
4. All sections cleared → **document_approval** item for the owner → **Publish** → portal snapshot updates.
   - The portal keeps serving the last approved snapshot until republish.

**Flow C — Reuse content**
1. **Editor** — select blocks → **Save to Library** (snippet = live / template = copy).
2. **Snippets** — snippet embedded across documents via transclusion.
3. A spec token inside the snippet changes → **Dashboard** **snippet_review** (owner resolves once at source) → embedding doc owners notified.

**Flow D — First-run onboarding (admin)**
1. Enter workspace → **Dashboard** setup checklist.
2. **Settings** — create Brand Profile + Document Type (generation prerequisites); invite team.
3. **Specs** — add/import the first product.
4. **New Document** → publish. *(Ask Arther — the Help assistant — is available throughout.)*

---

## 4. Mode-by-Mode Feature Placement

Each mode lists: its purpose, the rail views and regions it uses (per the shell), the features/sub-features that live there (with source spec), a 3–4 point content sketch, and its per-screen IA status.

### 4.1 Dashboard — `/dashboard`

**Purpose:** the home base for everything that requires the user's attention. It is the **Action Dashboard** from Smart Spec Tracking, generalized to carry items from every feature.
**Regions:** single surface (no rail; optional Overview/Activity segmented control). No Inspector.

| Lives here | Source |
|---|---|
| Action items — `section_review`, `document_approval`, `override_review`, `snippet_review`, `placeholder_brief`, `comment_mention`, `review_requested` | Smart Spec Tracking §3.5 / Collaboration |
| Two interaction modes: **act-here** cards (override reviews) and **review modal** (git-diff prose review) | Smart Spec Tracking §3.6 |
| Admin **setup checklist** (first-run: brand profile, doc type, invite, first product) | Onboarding §7.10 |
| Member first-run empty state ("Generate your first document") | Onboarding |
| "Show resolved" toggle; items scoped to the current user, ordered most-recent-first | Smart Spec Tracking |
| Source-changed snippet flags; variant AI-merge conflicts (non-blocking) route here | Content Reuse / Variants |
| Live workspace **stale-count tile** (full analytics live in Portal → Analytics) | Analytics / Smart Spec Tracking — v0.2 |

**Content sketch:** (1) the action queue — the reason to open the app each morning; (2) the review modal as the focused work surface over the queue; (3) first-run checklist/empty state for new admins/members; (4) optional activity overview. The Dashboard is the **personal, cross-feature** action queue ("what needs me now"); the document **review/approval pipeline** ("state of all reviews") lives in **Documents → Reviews** — review items here deep-link into it.
**Per-screen IA:** **needed** (Dashboard + review-modal IA). High priority — it is the daily landing surface and the home of two cross-feature systems.

### 4.2 Specs — `/specs`

**Purpose:** the source of truth. Browse/author products, shared components, and releases; manage variants, domain ownership, coverage, import/export.
**Regions:** rail (Products · Component Library · Releases) + Navigator (component tree/list) + content (field grid) + Inspector (field detail · version+comment history).

| Lives here | Source |
|---|---|
| Three views: **Products** (author entry), **Component Library** (engineer entry, Figma component/instance model), **Releases** (doc-manager entry) | Spec DB §5.2 |
| Three-panel layout: sidebar · field list (grouped by category) · field detail + inline version history | Spec DB §5.3 |
| Eight field-type editors (scalar/range/toleranced/boolean/enum/multi-enum/table/reference); table = mini-spreadsheet with Excel paste + chart preview | Spec DB §5.5 |
| Shared-component banner + per-field **Edit (global) / Override (product-specific)** | Spec DB §5.4 |
| **Spec field comments** — unified chronological comment+version feed with value-at-comment markers | Spec DB §3.11/§6.7 |
| **Product Brief tab** — entity-level narrative fragments (plain-text) on each product/component page; per-key completeness ("needed by N docs"), "referenced by" + guidance panels; component briefs propagate | AI Generator §5.7 |
| **Variants tab** on a product → **Add variant** modal → **Variant delta editor** (3-panel: base graph · delta list · resolved preview) | Variants §3 |
| **Domain Ownership panel** (per-product resolved owners + override) | Smart Spec Tracking §3.4 |
| **Spec Coverage report** (tab on component field list; product-level summary count) | Smart Spec Tracking §3.7 |
| **Pre-commit impact note** + `[!]` downstream-impact badge on changed fields | Smart Spec Tracking §5.1 |
| Archival / orphaned-token management; field-type-change blocking when overrides exist | Spec DB §3.10 |
| Per-product **Export** (resolved spec sheet, xlsx/csv) and **Create Release** | Spec DB §6.5/§3.8 |
| First-use entry: **Import from Excel** / **Start from template** | Spec DB §6.1 |

**Content sketch:** (1) the field grid is the work — fast, grouped, inline-editable; (2) the Inspector carries the field's full narrative (value · history · comments · owner); (3) shared-component and override affordances must be unmistakable; (4) impact/coverage/staleness signals live *next to the data*, not in a separate analytics screen.
**Per-screen IA:** **done** — `Feature IA/arther-specs-ia.md` (content-area tabs Spec Fields/Product Brief/Variants/Coverage; 3-panel inside Spec Fields; tabbed Inspector Detail/History/Comments; full-canvas variant delta editor + import). Covers Products/Component/Release views, field grid, coverage, domain-ownership panel.

### 4.3 Documents — Library · Reviews · Editor — `/documents`

**Purpose:** find, generate, edit, review, and publish documents. The Editor is the 80%-of-time surface and already has its own IA.
**Regions:** rail (Library · **Reviews** · Templates · Archive) + Navigator (outline in Editor; saved views/filters in Library & Reviews) + content (block canvas) + Inspector (tabbed).

| Lives here | Source |
|---|---|
| **Library** — document list, filters, saved views; **Templates** (document templates); **Archive** | Visual Block Editor / Content Reuse |
| **Reviews** (rail view) — the workspace **review & approval queue**: documents In Review / Awaiting my approval / Changes requested, with per-role approval status; filter mine vs. all; opens a document's Review surface | Collaboration §7.6 — *rail view, v0.3* |
| **New Document wizard** (full-canvas flow): doc type → product → brand profile → product brief → pre-flight completeness summary → atomic generation → Editor | AI Generator §7.2 |
| **Editor** — 20 block types, inline spec tokens, Edit ⇄ Preview, Outline + tabbed Inspector (Properties/Comments/History) | Visual Block Editor / `arther-editor-ia.md` |
| **Review surface** (per-document, read-only) — opened from Reviews / notifications; reviewer reads, comments, Approve / Request changes; document state machine Draft→Review→Approved→Published | Collaboration §7.6 |
| Send-for-review **brief** + **pre-flight check** (blocking + advisory); reviewer status; rejection modal/banner; owner-override modal | Collaboration / Error Handling §7.13 |
| Block-level + text-range **comments**, @mentions, detached/orphaned comment section | Collaboration §6 |
| **Variants in the document**: canonical view, variant-preview mode, variant badges, manual scope override, blocking merge-conflict panel, comparison view (internal, full-canvas) | Variants §3 |
| Content reuse in the doc: block-library insert panel, save-to-library, snippet signalling + edit warning, override flow | Content Reuse §7.7 |
| **Publish dialog** (version, visibility) → frozen snapshot; **Duplicate document** flow | Portal §3 / Content Reuse §7.7 |
| Per-document **consumption panel** (published docs: views, downloads, identified viewers) | Analytics §7.11 |
| Placeholder blocks link out to the **Product Brief** (authored in Specs, §4.2); saving a brief fragment fires a **review-and-generate** offer (full-canvas, §11 Decision 5) | AI Generator §5.4/§5.7 |
| Connectivity: blocked-operation messaging, block-level conflict resolution on reconnect | Connectivity §7.14 |

**Content sketch:** (1) Library answers "where's my work / start something new"; (2) **Reviews** is the approval pipeline — what's in review, what's waiting on me, who's blocking; (3) the Editor (own IA) is the refine surface; (4) the per-document Review surface (opened from Reviews) is Comments-first; the New Document and Duplicate flows are full-canvas and hand off into the Editor.
**Per-screen IA:** Editor **done**. **Needed:** Library/Templates/Archive IA; **New Document flow IA**; **Reviews & Review-flow IA** (the Reviews queue + the per-document Review surface, state machine, AND-logic approvals, comments surfacing); **Variants-in-editor IA**.

### 4.4 Snippets — `/snippets`

**Purpose:** the workspace's reusable-content library — live snippets (transclusion) and templates (copy-on-insert), plus the block library.
**Regions:** rail (Snippets · Block Library) + Navigator (list/folders) + content + Inspector (usage + properties).

| Lives here | Source |
|---|---|
| **Block Library** view — snippets + templates, with name, type, owner, embed count, search | Content Reuse §7.7 |
| **Library item editor** (full-canvas, same block editor) for authoring snippets/templates | Content Reuse |
| Snippet lifecycle: versioning, rollback, override states (`live`/`overridden`/`source_changed`), deletion-block (archive only) | Content Reuse §7.7 |
| **Snippet review at source** (owner resolves stale prose once; embedders notified) | Smart Spec Tracking §5.5 |
| Stale-prose flag on the source snippet (owner view) | Content Reuse / Smart Spec Tracking |

**Content sketch:** (1) browse/search the library; (2) author/edit an item in a focused full-canvas editor; (3) the Inspector surfaces *usage* (where embedded) and lifecycle state; (4) source-level review is the canonical place to resolve snippet staleness.
**Per-screen IA:** **needed** (Snippets + library-item editor + insert-panel-in-Editor). Medium priority — depends on the block model being stable.

### 4.5 Portal — `/portal`

**Purpose:** manage the public site (publish, gate, measure). This mode is the **inside** of the portal; the visitor-facing site is a separate domain (§6). *(Branding moved to Settings → Brand Profiles in v0.2.)*
**Regions:** rail (Published · Domains · Access & Leads · Analytics) + Navigator (conditional list) + Inspector (conditional config).

| Lives here | Source |
|---|---|
| **Published** — published documents/releases, semantic versions, release history, portal archival (manual/explicit) | Portal §3–§4 |
| **Domains** — custom domain (CNAME), TLS via Let's Encrypt, canonical-host handling | Portal §9 |
| **Access & Leads** — per-document gating (public / open magic link / allowlisted), email + domain allowlists, magic-link issuance/expiry/revocation, **access audit log** (who read which version when) | Portal §7 |
| **Analytics** — portal **consumption** (views, unique visitors, downloads, top/zero-result searches, by variant) + **workspace** analytics (generation success, review cycle time, rejection rate, staleness count); Owners/Admins only | Analytics §7.11 |
| **Pre-flight checks at publish** — blocking (placeholders, broken refs, vacant approval role) + advisory (stale, alt-text, word-count, empty pin labels) | Portal §10 / Error Handling |
| PDF pre-render at publish (headless Chrome); publish fails if PDF fails | Portal §6 |

**Content sketch:** (1) Published is the operational center — what's live, at what version, served to whom; (2) Access & Leads doubles as the lead-capture + compliance audit surface; (3) Analytics is the single place the team sees how the outside world consumes the docs (the Dashboard carries a live stale-count tile only). *(Portal/brand styling now lives in Settings → Brand Profiles.)*
**Per-screen IA:** **needed** (Portal-management IA covering the four rail views). The public-portal visitor IA is a separate, later pass.

### 4.6 Settings — `/settings`

**Purpose:** the backstage — workspace identity, people, the configuration that gates everyone else's work. Owner/Admin only, **except** per-user Notifications.
**Regions:** Navigator as a labeled section list (no icon rail); no Inspector.

| Section | Lives here | Source |
|---|---|---|
| **Workspace** | name, logo, immutable URL slug | Workspace Admin §4 |
| **Members** | member list, email invite + role, role changes, removal (blocked until ownership transferred), **ownership transfer** (password-confirmed) | Workspace Admin §5 |
| **Document Types** | name/description, **schema editor**, **approval-role config** (named, required/optional, member assignment, vacant-role warning), default Brand Profile | Workspace Admin §6 |
| **Document Quality Standards** | standalone DQS entities (section length, reading level, required sections, block-type rules) referenced by Document Types; create/edit/duplicate/archive | AI Generator §3.5/§4.4 — *own section, v0.2* |
| **Brand Profiles** | create/rename/duplicate/archive profile entities; **Brand Profile editor** (voice, palette, type, logo) with live preview; workspace default; **portal apply · custom CSS · staged apply · preview** | Workspace Admin §7 / AI Generator / Portal §8 — *absorbed Portal Branding, v0.2* |
| **Domain Ownership** | workspace-level category→owner matrix (default owners; per-product override counts) | Smart Spec Tracking §3.4 — *adopted v0.2* |
| **Spec Categories** | workspace category list (built-in + custom, reassign-before-delete) | Spec DB §5.6 — *adopted v0.2* |
| **Units** | custom unit registry entries (name, symbol, dimension, SI factor) | Spec DB §3.6 — *adopted v0.2* |
| **Notifications** | **per-user** event×channel preferences (in-app/email) | Collaboration §6 — *per-user, not Admin-only* |
| **Integrations** *(post-launch)* | External Sync config, entity mapping, dry-run, conflict queue, event log, health dashboard, Tier-3 review | External Sync — placeholder "Coming soon" |
| **Billing** *(post-launch)* | subscription, seats, payment | Billing — placeholder "Coming soon" |
| *(post-launch)* | Audit log, SSO config, advanced RBAC, multi-workspace | Enterprise Readiness — guardrails only |

**Content sketch:** (1) the launch-blocking essentials a new admin sets first (Brand Profile, Document Type) lead; (2) Members + roles is the recurring task; (3) Brand Profiles now also owns portal styling (apply · CSS · preview); (4) the spec-governance sections (Domain Ownership, Categories, Units) are admin-rare but underpin Specs + staleness; placeholders (Integrations, Billing) ship in nav from day one.
**Per-screen IA:** **needed** (Settings IA). Section list **reconciled in v0.2** — 9 launch sections (Workspace · Members · Document Types · Document Quality Standards · Brand Profiles · Domain Ownership · Spec Categories · Units · Notifications) + 2 post-launch placeholders (Integrations · Billing); scope = Owner/Admin for all **except per-user Notifications**.

---

## 5. Cross-Cutting Layer (no mode of its own)

These are present on every mode and are carried by the shell, not by any single screen. Several have **no clear owner spec** for their global behavior — flagged in §11.

| System | Where it lives | Source | Notes |
|---|---|---|---|
| **Ask Arther assistant** | Opened from the top-bar **Help** icon (shortcut `⌘J`); slide-in panel, **no floating character**; read + write actions with progressive-batch confirmation; session-only memory; suggested prompts; **owns spotlight** | Ask Arther v1.0 | **Resolved v0.2** — supersedes the Onboarding explain-only assistant; the Ask Arther spec needs revision (drop `⌘K`/"no palette" + the persistent character) — see §11 |
| **Unified notifications** | Top-bar utility cluster → slide-over; the single delivery channel for *all* features (staleness, reviews, comments, mentions, snippet updates, sync) | Collaboration §6 (owns delivery) | Per-user preferences in Settings → Notifications |
| **Command palette / global search** | Top-bar center, `⌘K` — jump to modules/objects, run actions, search | App Shell IA §5.4 | **`⌘K` confirmed for the palette (v0.2)**; the assistant uses `⌘J` |
| **Connectivity indicator** | Top-bar utility cluster (Connected / Saving / Offline) | Connectivity §7.14 | Drives editor offline behavior |
| **Spotlight overlay** | Global overlay layer — the assistant highlights a UI element (dim + ring + label, auto-dismiss) | Onboarding §7.10 | **Owned by Ask Arther (v0.2)** |
| **Archive-block dialog** | Global modal on any delete-with-dependents (Specs, Settings) — shows dependency list + "Archive instead" | Error Handling §7.13 | Applies to products, components, fields, doc types, brand profiles, snippets |
| **Pre-flight checks** | Modal/panel at send-for-review and at publish | Error Handling / Collaboration / Portal | Same check family, two trigger points (review submission, publish) |
| **Empty states** | Per-mode first-run content (description + primary action + one-time assistant nudge) | Onboarding §7.10 | Consistent pattern across all modes |
| **Seat enforcement (Billing)** | Inline everywhere — Viewer (free) sees disabled create/edit; Editor (paid) for Owner/Admin/Member | Billing §7.12 | `canDo()` abstraction; upsell UI deferred |
| **Attribution / audit** | Internal on every mutation (created_by/updated_by) | Enterprise Readiness | No v1 UI; audit-log surface is post-launch |

**Per-screen IA:** a short **cross-cutting IA** is worth writing for the assistant + notifications + command-palette triad; their boundaries are **resolved in v0.2** (assistant = Help/`⌘J`, read+write; palette = `⌘K`), so the IA can go straight to panel/slide-over detail.

---

## 6. Public Portal (separate visitor domain)

The published portal is a **separate domain** (`{workspace}.arther.io` or custom) with its own visitor-facing IA. It is included here so every portal feature has a home, but its detail is a **distinct later IA pass** (visitor IA), not part of the authoring-app shell.

**Audience:** customers, distributors, installers, partners — never inside the authoring app.
**Model:** frozen artifact (content baked at publish; presentation/branding maintainable live).

| Visitor surface | URL | Lives here | Source |
|---|---|---|---|
| **Homepage** | `/` | Product grid (card per published product, most-recent-first); not-found when empty | Portal §4.2 |
| **Product landing** | `/{product-slug}/` | Portal description (admin-authored), published docs grouped by type, **variant picker** | Portal §4.3 / Variants §3 |
| **Document page** | `/{product-slug}/{doc-slug}/` | Rendered snapshot (13 block types, interactive), version picker, **PDF download**, access gate | Portal §4.4 |
| **Versioned document** | `/{…}/v{n.n}` | Specific historical release (stable URL; not indexed) | Portal §3–§4 |
| **Variant page** | `/{product-slug}/{variant-slug}/` | Per-variant canonical page + persistent **variant switcher** | Variants §3 |
| **Search** | persistent input | Full-text over latest released snapshots only | Portal §4.5 |
| **Magic-link access** | gate | Branded email-entry → time-limited session (open or allowlisted) | Portal §7 |

**Content sketch:** (1) product-first navigation mirrors how hardware companies think; (2) the document page is the product — interactive first, PDF as fallback; (3) variant switching and version picking are first-class wayfinding; (4) gating is per-document and doubles as lead capture.
**Brand-controlled vs. Arther-controlled:** the customer controls *look* (logo, color, type, custom CSS); Arther controls *structure* (nav, page layout, block order).
**Per-screen IA:** **needed — its own visitor IA** (last in the project queue). Must cover SEO/SSR structure, gating UX, variant/version wayfinding, and mobile (the portal *is* the mobile-facing surface; the authoring app is desktop-only).

---

## 7. Feature → Screen Coverage Matrix

Every feature in the spec suite and where its surfaces live. This is the "nothing is orphaned" check at sub-feature granularity. **D** = deferred/post-launch.

| # | Feature | Key surfaces / sub-capabilities | Home screen(s) |
|---|---|---|---|
| 1 | **Spec Database** | products/components/releases · field grid + editors · version history · shared-component overrides · field comments · archival/orphaned tokens · import/export · templates · categories · units | **Specs** (all 3 views); **Settings → Categories/Units**; **Import** = full-canvas flow |
| 2 | **AI Document Generator** | doc-type + product + brand + brief selection · pre-flight completeness · atomic generation · placeholder blocks · Product Brief · Brand Profiles · Document Quality Standards | **New Document** full-canvas flow → **Editor**; **Product Brief tab in Specs**; config in **Settings → Document Types / Document Quality Standards / Brand Profiles** |
| 3 | **Visual Block Editor** | 20 block types · inline spec tokens · Edit/Preview · Outline + tabbed Inspector · find/replace · PDF degradation | **Documents · Editor** *(IA done)* |
| 4 | **Smart Spec Tracking** | action dashboard · review modal · pre-commit note · `[!]` badges · domain ownership · spec coverage · override/snippet review · variant-aware staleness | **Dashboard** (items+modal); **Specs** (badges, coverage, per-product ownership); **Settings → Domain Ownership**; signals in **Editor** |
| 5 | **Publishing Portal & Export** | publish + frozen snapshot · pre-flight · PDF · versioning · gating/magic links · audit log · branding · domains · search | **Portal** (mgmt, 4 views) + **Publish dialog** in Editor; **branding → Settings → Brand Profiles**; **Public Portal** (visitor) |
| 6 | **Collaboration & Review** | review/approval queue · state machine · approval roles · comments (block/range) · @mentions · detached comments · **unified notifications** · per-user prefs | **Documents → Reviews** (rail queue) + per-document **Review surface** + Editor Comments; **top-bar notifications**; **Settings → Notifications** |
| 7 | **Content Reuse** | snippets (transclusion) · templates (copy-on-insert) · block library · save-to-library · override model · duplication | **Snippets** mode + insert panel/flows in **Editor**; **Duplicate** = full-canvas flow |
| 8 | **Product Variants** | delta-from-base · variant delta editor · variant-aware docs (canonical/preview) · merge conflicts · comparison view · portal picker | **Specs** (delta editor); **Editor** (scopes, conflicts, comparison); **Public Portal** (picker/switcher) |
| 9 | **External Sync** *(D)* | integration config · entity mapping · dry-run · conflict queue · event log · health dashboard · Tier-3 review | **Settings → Integrations** *(placeholder now)*; conflict items → **Dashboard** + notifications |
| 10 | **Workspace Admin** | roles · members · ownership transfer · doc types · brand profiles · placeholders | **Settings** (Workspace/Members/Document Types/Brand Profiles) |
| 11 | **Onboarding & First-Run** | admin setup checklist · member first-run · empty states · assistant · spotlight | **Dashboard** (checklist/first-run); **all modes** (empty states); **cross-cutting** — assistant = **Ask Arther** (Help/`⌘J`), spotlight |
| 12 | **Analytics** | per-doc consumption · consumption analytics · workspace analytics · event model | **Editor** Inspector (per-doc); **Portal → Analytics** (cross-doc + workspace) |
| 13 | **Billing & Pricing** | seat tiers · enforcement · (admin UI *D*) | **Everywhere** (enforcement); **Settings → Billing** *(placeholder)* |
| 14 | **Error Handling & Lifecycle** | archive-only cascades · archive-block dialog · ownership-transfer · cascade notices · pre-flight | **Cross-cutting** (modals); **Settings → Members**; **Editor** (pre-flight, orphan flags) |
| 15 | **Connectivity** | indicator · local save queue · blocked-op messaging · block-level conflict resolution | **Top-bar** (indicator); **Editor** (messaging, conflict panel) |
| 16 | **Enterprise Readiness** | canDo · attribution · decoupled auth (guardrails); audit/SSO/RBAC/multi-workspace *(D)* | **No v1 UI**; post-launch in **Settings**; workspace-switcher slot reserved in top bar |
| — | **Ask Arther** (assistant) | read/write actions · context-awareness · suggested prompts · spotlight | **Cross-cutting** — opened from top-bar **Help** (`⌘J`); read+write (resolved v0.2) |

No feature is orphaned by the map. The two cross-cutting systems (staleness, review/notifications) and the assistant are carried by the Dashboard, per-surface signals, and the top bar rather than by dedicated modes.

---

## 8. Verification — every feature has a home (reconciled with App Shell IA §16)

The App Shell IA already mapped the 10 feature *buckets* to modes. This pass confirms that mapping at sub-feature granularity and records what it **adds** beyond the shell's verification:

| App Shell §16 bucket | Confirmed home | Added/refined this pass |
|---|---|---|
| Spec Database | Specs | + **Settings → Categories, Units**; coverage + per-product domain-ownership panels |
| AI Document Generator | New Document flow → Editor | + **Product Brief = Specs → product/component Brief tab** (AI Generator §5.7); DQS → **Settings → Document Quality Standards** (own section, v0.2) |
| Visual Block Editor | Documents · Editor | (IA done) |
| Smart Spec Tracking | Dashboard + Specs + Editor + notifications | + **Settings → Domain Ownership** matrix |
| Publishing Portal | Portal mode + Public Portal | + Public Portal promoted to its **own §6 section**; **Branding → Settings → Brand Profiles** (v0.2) |
| Collaboration & Review | Documents Review + notifications | + **Settings → Notifications** (per-user) |
| Content Reuse | Snippets | + insert/override/duplication flows in Editor |
| Product Variants | Specs + Editor | + comparison view = internal full-canvas; portal picker = visitor |
| External Sync | Settings → Integrations | corrected home to **Settings**, not Portal |
| Enterprise | Settings (deferred) | no change |
| — *(new)* | **Ask Arther** | not in the shell's table — a cross-cutting surface, **resolved in §11 (v0.2)** |

---

## 9. Per-Screen IA Roadmap & Status

The expansion plan — which screens have an IA, which are next. Order reflects the project notes (Spec DB → flows → mgmt → public portal) and build dependencies.

| Per-screen IA | Covers | Status | Priority |
|---|---|---|---|
| App Shell IA | global frame | **done** | — |
| Editor IA | Documents · Editor | **done** | — |
| **Specs IA** | Products/Component/Release views, field grid, variant delta editor, coverage, domain-ownership panel | **done** (`Feature IA/arther-specs-ia.md`) | — |
| **New Document flow IA** | generator wizard, pre-flight completeness, brand/brief selection, hand-off | to do | High |
| **Dashboard IA** | action queue, review modal, first-run checklist | to do | High |
| **Reviews & Review-flow IA** | the **Reviews** rail queue + per-document Review surface, state machine, AND-logic approvals, send-for-review, comments surfacing | to do | High |
| **Import / Re-import flow IA** | upload → AI mapping (structural + field) → validation → release | to do | Med |
| **Portal-management IA** | Published/Branding/Domains/Access&Leads/Analytics | to do | Med |
| **Settings IA** | reconciled section list + per-section detail | to do | Med |
| **Snippets IA** | library, item editor, insert panel | to do | Med |
| **Cross-cutting IA** | assistant + notifications + command palette boundaries | to do | Med (unblocks §11) |
| **Public Portal (visitor) IA** | homepage, product/doc/variant pages, gating, search, mobile | to do | Last per queue |

---

## 10. Naming Conventions (app-wide)

One word per concept, app-wide. Extends the shell + editor glossaries; flags collisions to resolve.

| Concept | Canonical label | Note |
|---|---|---|
| Top-level destination | **Module / mode** | Users see names, not "module" |
| Within-mode destination | **View** | What the rail switches |
| Open object | **Surface / tab** | Active tab = mode |
| Spec unit shared across products | **Component** | Figma component/instance model |
| Spec attribute | **Field** | Eight types |
| Named spec snapshot | **Release** | Reused in Editor (History) and Portal |
| Spec-linked value in prose | **Spec token** | Not "variable" |
| Live reused content | **Snippet** | Transclusion |
| Copy-on-insert content | **Document Template** / **Block Template** | **Resolved v0.2:** three canonical labels — **Document Type** (gen schema) · **Spec Template** (Spec DB import scaffold) · **Document/Block Template** (Content Reuse). Never shorten any to "Template" alone. |
| Out-of-date | **Stale** · **Orphaned** (source archived) · **Placeholder** (null/brief-missing) | Three distinct states |
| Brand/voice config | **Brand Profile** | Not "Style Profile" (Synthesis correction) |
| Owner of a spec domain | **Domain owner** | Per category, per product |
| The help assistant | **Ask Arther** | **Resolved v0.2:** one assistant, opened from the top-bar **Help** icon — "Help" is the entry label, "Ask Arther" is its name. |
| Review/approval queue | **Reviews** (Documents rail view) | Workspace approval pipeline; distinct from the per-document **Review surface** (read-only doc tab) and the **Dashboard** personal action queue. |
| Action surface | **Dashboard** | The Action Dashboard = Dashboard mode home; personal cross-feature action items |

---

## 11. Resolved Decisions & Required Source-Spec Edits

The planning gaps this pass surfaced are **resolved below** (decisions taken 4 Jun 2026 — the four highest-stakes by Callum, the rest by recommended default). Where a decision contradicts a published feature spec, the spec edit needed to fully close the conflict is in §11.2 — until those land, **this IA is the authority**.

### 11.1 Decisions

| # | Gap | Decision (v0.2) | Propagated to |
|---|---|---|---|
| 1 | `⌘K` ownership | **Command palette keeps `⌘K`.** The assistant gets its own shortcut, **`⌘J`**. | §3.2 · §5 · §7 |
| 2 | Assistant scope | **Read + write.** Ask Arther (look up + create/edit specs, fields, docs, with progressive-batch confirmation) **supersedes** the Onboarding explain-only assistant. | §5 · §7 |
| 3 | Assistant entry / identity / spotlight | **Opened from the top-bar Help icon; no floating character.** One assistant; it **owns spotlight**. "Help" = entry label, "Ask Arther" = its name. | §3.2 · §5 · §7 · §10 |
| 4 | Settings section list | **Adopt the full list** — 9 launch sections (Workspace · Members · Document Types · Document Quality Standards · Brand Profiles · Domain Ownership · Spec Categories · Units · Notifications) + 2 placeholders (Integrations · Billing). Scope = Owner/Admin for all **except per-user Notifications**. | §3.1 · §4.6 |
| 5 | Auto-generation offer surface | A **full-canvas review-and-generate screen** (consistent with Import / New Document), launched from the **notification** and from the **Specs → Brief tab**. | §4.3 |
| 6 | Brand Profile home | **All in Settings → Brand Profiles** (entity + portal apply + custom CSS + staged apply + preview). **Portal → Branding removed.** | §3.1 · §4.5 · §4.6 · §7 |
| 7 | Variant delta editor form | **Full-canvas flow** launched from a product's Variants tab (3-panel: base graph · deltas · resolved preview). | §4.2 |
| 8 | Workspace analytics | **Portal → Analytics holds both** consumption + workspace analytics (single analytics home, Owners/Admins). The Dashboard carries only a live **stale-count tile**. | §4.1 · §4.5 |
| 9 | "Template" overload | Three canonical labels — **Document Type** · **Spec Template** · **Document/Block Template**. Never shorten to "Template" alone. | §10 |
| 10 | Document Quality Standards | **Own Settings section** (standalone entity referenced by multiple Document Types, like Brand Profiles). | §3.1 · §4.6 |
| 11 | Spec-vs-spec text drift | Editorial — fix at source (§11.2). | §11.2 |
| 12 | **Reviews as a Documents rail view** *(added v0.3)* | **Reviews & Approvals is a dedicated rail view in Documents** (Library · Reviews · Templates · Archive) — a workspace review/approval **queue**; the per-document Review surface stays as the drill-in. Coexists with the Dashboard (personal action items deep-link in). **Overrides** App Shell IA §6 ("Review not a rail item") — shell doc updated. | §3.1 · §4.1 · §4.3 · §7 · §9 · §10 · App Shell IA §6 |

### 11.2 Source-spec edits — applied 4 Jun 2026

These edits to the **feature specs** have been made, each with a changelog entry:

- ✓ **Ask Arther → v1.1** — dropped `⌘K` + "no command palette is planned" (now `⌘J`; the palette owns `⌘K`); replaced the persistent bottom-right floating character with a **top-bar Help entry + slide-in panel** (character kept as the panel avatar); read+write scope unchanged.
- ✓ **Onboarding → v1.1** — retired the "explains and directs only / no actions" scope; Ask Arther (read+write) is the assistant of record; Help moved to the top bar; spotlight owned by Ask Arther.
- ✓ **Workspace Admin → v1.1** — §3 expanded from 6 to **9 launch sections + 2 placeholders** (adds Document Quality Standards, Domain Ownership, Spec Categories, Units, per-user Notifications); §7.2 Brand Profiles absorbed portal branding.
- ✓ **Publishing Portal → v1.3** — §8 branding management (apply, custom CSS, staged apply, preview) moved to Workspace Admin → Brand Profiles; §8 now only describes how the portal renders with the Brand Profile.
- ✓ **Editorial drift** — Block Editor closing summary "19 block types" → **20**. (Product Overview already used "20 block types" + "Brand Profile"; Spec DB already at v1.5 — no further drift in the workspace specs. The remaining "Style Profile" mentions are in Product Synthesis and the AI Generator, where they correctly *document* the retired term.)

---

## 12. URL Strategy (app-wide)

- **Authoring app:** `/{module}/{object-type}/{id}/{sub-view?}` — one app page, in-app tabs; each tab maps to a URL; deep links open/focus the matching tab (App Shell §14).
- **Sub-views & panels:** query params — `?block={id}`, `&panel=properties|comments|history`, `?dialog=publish`, `?focus=1` (Editor IA §11).
- **List/library state:** query params — `?status=in_review&sort=updated`, `?q=…`.
- **Flows:** full-canvas flows (New Document, Import, Duplicate, Re-import review) are app states that return to the prior tab on exit.
- **Workspace prefix reserved:** `/{workspaceSlug}/…` for future multi-workspace (Enterprise/deferred) — reserve now to avoid migration.
- **Public portal:** **separate domain** `{workspace}.arther.io` (or custom), path `/{product-slug}/{doc-slug}/v{n.n}` and `/{product-slug}/{variant-slug}/` — its own SSR/SEO URL model, outside the app shell.

---

## 13. Deferred / Out of Scope (and where it will land)

Post-launch items are **placed now** so each screen's eventual scope is visible and placeholders are reserved.

| Deferred item | Future home | Pre-wired at v1? |
|---|---|---|
| External Sync (PLM/ERP) | **Settings → Integrations** (+ Dashboard conflict items, notifications) | Yes — SpecReconciler, provenance fields |
| Billing admin UI | **Settings → Billing** | Yes — seat tracking, role→seat timestamps |
| SSO / SCIM / advanced RBAC | **Settings** (auth, members) | Partly — canDo, decoupled auth |
| Audit-log surface | **Settings** | Yes — attribution fields |
| Multi-workspace | top-bar **workspace switcher** (slot reserved) | Slot reserved |
| DOCX export | Editor Preview / Publish | No |
| Curated portal homepage | **Portal → Published** / **Settings → Brand Profiles** | No |
| Historical-release search, scroll-depth analytics | Public Portal / Analytics | No |
| Assistant proactive mode, cross-session memory | Ask Arther (v2) | No |
| Real-time co-editing, nested snippets, multi-language | — (not planned for v1) | No |

**Genuinely out of scope (not just deferred):** real-time co-editing, DITA/XML authoring, ePub/SCORM export, AI image generation, canvas/vector tooling, advanced typography, native mobile apps, plugin API — per Product Overview. These should **not** be given screens.

---

*Arther — App-Wide Information Architecture (Skeleton). Version 0.3, 4 June 2026. The parent placement map: every feature in the 18-spec suite assigned to its home screen, with light content sketches, a feature→screen coverage matrix, a per-screen IA roadmap, and a decision log (§11). Sits between `arther-app-shell-ia.md` (the frame) and the per-screen IAs (Editor done; Specs next). v0.2 resolved the placement gaps (source-spec edits applied, §11.2); v0.3 makes **Reviews** a Documents rail view (§11 Decision 12). Expand each region in its own IA pass.*
