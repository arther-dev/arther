# Arther Handoff · 04 — Screens, Part 2 (Supporting surfaces)

**Source file:** Arther — Screens · Figma key `pdMPtD58F3MeLrTzWsoX3E`
**Covers:** Snippets · Import/Re-import · Portal management · Settings · Auth & Account · System & Errors · Public Portal (visitor).
**Read first:** `01-foundations-design-system.md`, `02-app-shell-and-patterns.md`, and `03-screens-part-1-core.md`. Same per-surface format. File-wide a11y from doc 02 applies throughout.

---

## A. Snippets — `/snippets`

**Overview.** The workspace's reusable-content library — live **snippets** (transclusion: edit once, updates everywhere) and **templates** (copy-on-insert), plus governance (where embedded, stale-prose-at-source, versioning, deletion-block). Authoring + source governance live here; **insert + signalling + document-level override live in the Editor**.

**Route & shell.** Rail = **Snippets** (`/snippets`) · **Templates** (`/snippets/templates`) · **Archived** (`/snippets/archive`). Navigator = item list + folders + search. Content = item detail (preview) or full-canvas item editor. Inspector = **Usage + Lifecycle**.

**Layout.** List rows: name · type (Snippet/Template) · owner · **embed count** (snippets) · state/stale marker. Item detail = rendered preview + Edit/Duplicate/Archive. **Item editor** = the same block editor, full-canvas, with a persistent **"editing a snippet — applies to N documents"** banner; Save = new version. Inspector → **Usage** (embedded-in-N list with per-doc override state: live / overridden / source-changed) · **Lifecycle** (state, version history with rollback, delete-blocked → Archive).

**Lifecycle & override.** Per-embed states (shown in Usage): Live · Overridden · Source-changed. Versioning: every edit = a version; rollback propagates to **live** embeds automatically; **overridden** embeds get a review alert (not auto-applied). Stale prose: spec change flags the snippet → owner resolves at source (clears everywhere) or doc owner resolves locally (creates an override). **No nested snippets.** Deletion blocked while embeds exist → Archive.

**Components.** Block editor (reused) · Doc card / Table row, Field row, Section subhead · Status pill, Spec token, Avatar · Safety block / warning banner (the edit + stale-prose banners) · Button, Tab, Text field, Skeleton.

**States.** Snippets list · Templates list · Archived list · item detail · item editor (edit-warning banner) · stale-prose source review · Usage (embeds + override states) · Lifecycle (version history) · delete-blocked dialog · empty (first-run) · loading.

**Interactions.** Promote-from-document (Editor: select blocks → Save to Library → Snippet [live] or Template [copy]). Author directly (New item → editor). Edit at source → banner → Save → all live embeds update, overridden embeds alerted. Resolve stale prose once at source → flag clears everywhere (also a Dashboard `snippet_review`).

**Edge cases.** Deletion always routed to Archive while embedded. Usage paginates; embed count always visible (blast-radius awareness). Rollback alerts overridden embeds rather than overwriting.

**Data/RSC.** List server-rendered; item editor is the client block editor. Snippet embeds are `SnippetEmbed` references; transclusion resolves at render. Stale-prose flag routes via the propagate + notification tasks.

**a11y.** Edit-warning banner needs a text role, not color-only. Item editor inherits the Editor's light-paper a11y rule. Delete-blocked dialog semantics per doc 02 §11.

**Figma.** Page `304:911` · section `313:1165` (6 frames: Library · Templates · Item editor · Stale-prose · Empty · Loading).

---

## B. Import / Re-import — `/specs/import` · `/specs/product/{id}/reimport`

**Overview.** How existing spec sheets become structured Arther data — safely, non-destructively, **diff-first**. First import builds a typed product (committed as its first release); re-import reconciles an updated sheet against the live DB and shows exactly what changed before applying. Both wrap the **SpecReconciler**.

**Route & shell.** **Full-canvas stepper flow** in Specs mode — hides rail/Navigator/Inspector, keeps top bar, commits a release then drops on the product's Spec Fields (or returns to the prior tab on Cancel). Persistent step indicator; footer Back · Continue/Commit.

**First import steps.** 1 · **Upload** (drop .xlsx/.csv; no pre-config; one product per session; secondary path: Start from a template) → *Processing* (Claude interprets) → 2 · **Structural review** (sheet→component map, BOM hierarchy as tree, table-vs-parameter-list classification; accept/correct/skip per item) → 3 · **Field-level review** (inferred type · unit · category per field; range/toleranced/table detection; accept/correct/skip) → 4 · **Validation** (advisory warnings: unrecognised units→text, embedded-unit cells, note-rows excluded, duplicate names disambiguated; non-blocking) → 5 · **Commit** (creates the named release "Imported from {file}" → product Spec Fields).

**Re-import steps.** 1 · Upload → 2 · **Reconciliation diff** (`✓` unchanged · `~` changed · `+` added · `−` removed-flagged + "affects N documents") → 3 · Commit. **Additive by default** — removed fields are flagged, never deleted; nothing applied before the user confirms the diff.

**Components.** Stepper (new; shared with New Document Generating) · Dropzone (new) · Table row / Field row / Section subhead · Status pill, Spec token · diff table (shared with Releases compare) · Button, Text field, Tab, Skeleton.

**States.** Entry (two paths) · Upload · Processing · Structural review · Field-level review · Validation (warnings) · Commit · Re-import diff · Error (unreadable/failed → Retry, selections preserved) · Success · loading.

**Interactions.** `⌘↵` advance/commit · `Esc` cancel. Every proposed element independently correctable. Commit always creates a named release; re-import commit triggers staleness review on affected docs.

**Edge cases.** Unreadable file / interpretation failure → Error → Retry with the uploaded file + selections preserved; no partial commit. Large workbooks (hundreds of fields): separate structural/field steps + grouping keep each screen scannable. (Open: whether Validation folds into the last review step for <~10 fields.)

**Data/RSC.** Upload → Trigger.dev `import-spec` task: Claude structural interpretation → SpecReconciler diff → confirm → apply (architecture §8). Webhook/ERP sync (post-launch) wraps the same SpecReconciler and reuses the diff/commit steps.

**a11y.** Diff change-types (`~ + −`) not color-only — pair with the glyph/label. Correct-in-place fields need labels.

**Figma.** Page `271:911` · section `280:1097` (6 frames: Upload · Structural · Field-level · Validation · Re-import diff · Committed). Stepper frames `271:912`+.

---

## C. Portal management — `/portal`

**Overview.** The operations desk for everything customers see: what's **live** and at which version, **who** can read it (and who has), where it's **served**, and how it's **consumed**. Portal *manages* published artifacts; the Editor *publishes* them; styling lives in Settings → Brand Profiles. The visitor-facing site is a separate domain (§G).

**Route & shell.** Rail = **Published** (`/portal/published`) · **Domains** (`/portal/domains`) · **Access & Leads** (`/portal/access`) · **Analytics** (`/portal/analytics`). Navigator + Inspector conditional. Owner/Admin-leaning (Analytics is Owners/Admins only). **No Branding view** (moved to Settings).

**Published.** Document × release **table** (Document · live version e.g. v2.1 · published date · visibility · views · overflow) + per-document **Inspector** (version/visibility summary · View on portal · Archive [manual; snapshot keeps serving]) + release-history drill-in (every released version, stable versioned URL, archive a version). Empty: "Nothing's published yet — publish from the Editor."

**Domains.** Default URL `{slug}.arther.io` (copyable, always available) + Custom domain (CNAME instructions · TLS status via Let's Encrypt: Provisioning/Active · canonical indicator) + status (Connected / Pending DNS / Error + next steps).

**Access & Leads.** Per-document **access mode** (Public / Open magic link / Allowlisted) editable inline; allowlist (emails + `@domains`). Magic-link behavior shown read-only (24h single-use; config changes affect new links only). **Access audit log** (table: email · requested · activated · document · **snapshot version** · IP · expiry) — the snapshot-version column is the compliance anchor and doubles as the lead list. Split by an Access / Audit-log segment.

**Analytics (Owners/Admins).** Date range + scope. Consumption (views, unique visitors, PDF downloads, top + **zero-result** searches, by variant) + Workspace (generation success rate, median review cycle time, rejection rate, **live staleness count** — the Dashboard tile deep-links here). Export.

**Components.** Table row / Field row, Status pill (visibility/TLS) · Metric card (Analytics tiles) · Chart (consumption/workspace — block-renderer chart) · Button, Text field, Tab, Toggle, Avatar, Skeleton.

**States.** Published (table / empty) · release-history drill-in · per-doc Inspector · Domains (default only / custom pending DNS / active / error) · Access (per-doc modes) · allowlist editor · audit log · Analytics (consumption / workspace) · loading.

**Data/RSC.** All reads server-rendered from `published_snapshots` + `analytics_events` (append-only) + magic-link access logs. Custom domains via the Vercel Domains API (ADR-009). Publish itself happens in the Editor's Publish dialog (→ `publish-pdf` task; architecture §5.3).

**a11y.** Audit-log + Published tables need `scope` headers. Visibility/TLS pills text-labelled.

**Figma.** Page `281:911` · section `290:1163` (6 frames: Published · Domains · Access & Leads · Analytics · Empty · Loading).

---

## D. Settings — `/settings`

**Overview.** The backstage — workspace identity, people, and the configuration that gates everyone else's work. Owner/Admin-leaning, low-frequency, high-stakes. Members/Viewers see **only Notifications**.

**Route & shell.** Rail exception: a labeled **section-list Navigator** (grouped), **no icon rail, no Inspector**; each section is a form/table in the content area. 9 launch sections + 2 placeholders.

**Sections (grouped). A = Owner/Admin · U = per-user.**
- **Workspace** group — **Workspace** `/settings/workspace` (A, default: name · logo · **immutable URL slug** [warning on first set]) · **Members** `/settings/members` (A) · **Brand Profiles** `/settings/brand-profiles` (A)
- **Documents** group — **Document Types** `/settings/document-types` (A) · **Document Quality Standards** `/settings/quality-standards` (A)
- **Spec data** group — **Domain Ownership** `/settings/domain-ownership` (A) · **Spec Categories** `/settings/categories` (A) · **Units** `/settings/units` (A)
- **Personal** group — **Notifications** `/settings/notifications` (**U — all members**)
- **Coming soon** group — **Integrations** · **Billing** (A; "Coming soon" placeholders, in nav from day one so it never restructures)

**Two list→editor sections (the config-heavy ones).** **Document Types** → editor: name/description · **schema editor** (sections ↔ spec-field categories) · **approval roles** (labels, required/optional, assigned members, **vacant-role warning**) · default Brand Profile. **Brand Profiles** → editor: voice · palette · type · logo with **live preview**; workspace default; **portal application** (Apply to portal · custom CSS · staged apply · preview).

**Other sections.** Members = searchable table + Invite (emails + role, 7-day link) + inline role change (Owner-only for Admins; can't self-demote) + remove (preserves contributions; can't remove self/Owner) + pending invitations + **Transfer ownership** (Owner → Admin, password-confirmed). Domain Ownership = category → default-owner matrix + per-product override counts. Spec Categories (built-in + custom, reassign-before-delete). Units (name · symbol · dimension · SI factor). Notifications = per-user event × channel (in-app / email) grid.

**Roles & access.**

| | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| See Settings (all) | ✓ | ✓ | — | — |
| See Notifications only | ✓ | ✓ | ✓ | ✓ |
| Invite / role / remove | ✓ | ✓ | — | — |
| Edit Doc Types / Brand Profiles / spec-data | ✓ | ✓ | — | — |
| Transfer ownership · Delete workspace | ✓ | — | — | — |

Seat tiers: Owner/Admin/Member = Editor (paid); Viewer = free (read + comment + approve). Approver authority is explicit per Document Type, never inherited from workspace role.

**Components.** Section subhead · Nav row (inactive State = "Default") · Text field, Toggle, Button, Tab, Status pill · Table row / Field row (Members, Domain-ownership matrix, Units, Categories) · Avatar · Brand Profile editor + preview (new, shares portal render) · Document Type schema editor (new) · Skeleton.

**States.** Section form (default Workspace) · Members table + invite + pending · ownership-transfer dialog (password) · Document Types list / editor (schema + approval roles, vacant-role warning) · Brand Profiles list / editor (live preview) · Domain Ownership matrix · Categories/Units lists · Notifications grid · "Coming soon" placeholder · archive-block / slug-immutability dialogs · loading.

**Edge cases.** Irreversible actions gated by dialogs: ownership transfer (re-enter password), slug immutability (warning on first set), archive-instead-of-delete (Doc Types/Brand Profiles with dependents). Admin can't change own role; only Owner sees Delete-workspace.

**Data/RSC.** Forms server-rendered; mutations = server actions (Zod-validated) through `canDo` (architecture §10). Invites via Resend (ADR-011). Slug immutable after first set.

**a11y.** Notifications grid = labelled rows/columns; toggles `role="switch"`. Members/matrix tables need `scope`. Password-confirm dialog semantics per doc 02.

**Figma.** Page `291:911` · section `303:1183` (6 frames: Workspace · Members · Document Types · Brand Profiles · Domain Ownership · Coming soon).

---

## E. Auth & Account

**Overview.** The product's front door + per-user account controls. Two launch methods: **email/password** and **Continue with Google**. Unauthenticated surfaces use a **centered branded auth card** on the dark canvas — **not** the app shell. Auth is decoupled from identity (the two methods write to one normalized user). SSO/SAML, SCIM, 2FA, multi-workspace switching are deferred.

**Routes.** `/login` · `/signup` → `/signup/verify` (check email) · `/welcome` (Create workspace — first-run for a new account) · `/invite/{token}` (Accept invitation — invited member) · `/forgot` → `/reset/{token}` · Account menu (top-bar avatar dropdown) · `/settings/profile` (in-shell).

**Layout — unauth card.** Arther wordmark (centered, above card) → card (title + subtext + DS Text fields + primary Button + for Login/Signup a divider + **Continue with Google** + contextual links) → footer legal/security microcopy. Accept-invite adds an "invited to {workspace}" header. Create workspace = short form (name → live slug preview `{slug}.arther.io` · default units · time zone).

**Account menu (in-shell).** Avatar + name/email · Profile · Settings · Help (Ask Arther ⌘J) · Log out. **No workspace switcher** at launch. **Profile** page (in the Settings shell): Profile (avatar, name, email + verify/change) · Password (change; Google-only accounts → "set a password") · Sessions (active + "sign out everywhere") · link to Notifications.

**Routing logic.** New account → verify → Create workspace → Dashboard (admin first-run checklist). Invited → Accept invite (credentials or Google) → Dashboard (member empty). Returning → last location / Dashboard. Recovery → Forgot → email → Reset → Login.

**Components.** Auth card (new) · Arther wordmark (brand) · Text field + states (DS `045ed181…`) · Button (Primary/Secondary/Ghost; DS set `f8bc95b9…` — hide the leading icon via instance-swap) · Divider · Avatar · Account menu (new overlay) · Settings page chrome.

**States.** Loading/submitting · inline validation (email format, password strength, confirm-match) · **invalid credentials** (generic "email or password is incorrect" — no account enumeration) · email already registered (→ offer Login) · unverified email (resend) · expired/invalid invite · expired/invalid reset link · OAuth error/cancelled · success confirmations.

**Edge cases.** Honest, non-enumerating errors. Expired links are explicit dead-ends with a "request a new one" path. Google-provisioned accounts may have no password (Profile shows "set a password"). All auth surfaces are **dark + DS-bound** (monochrome app DS, not a customer Brand Profile).

**Data/RSC.** Supabase Auth / GoTrue (email/password + Google OAuth); `auth.users` = provider identity, `public.users` = app profile, `auth_providers` links externals (architecture §10, ADR-005). Email verification required. Magic-link **document** gating (the visitor portal) is a different mechanism — see §G.

**a11y.** Persistent visible `<label for>` on every field (the audit's critical U1 fix — placeholders are examples only); inline error text via `aria-describedby`; generic credential error in text. Google button has an accessible name.

**Figma.** Page `348:946` · section `355:1033` (11 frames: Log in · Sign up · Check email · Create workspace · Accept invite · Forgot · Reset · **Invite expired** · **Reset link expired** · Account-menu dropdown · Profile).

---

## F. System & Error states

**Overview.** The dead-ends and recovery points — rare, but they set trust. Philosophy (from the Error-Handling Matrix): **allow the action, surface the consequence**; **archive-only for entities with dependents**; documents in Review are protected (return to Draft, never silent break); honest, non-blaming, always a way forward; attribution is permanent.

**Two visual families.** App system pages = **dark + DS-bound**, centered on `bg/canvas` (+ safety-red for destructive/blocked accents). Portal not-found = **light + brand-skinned** (the only public-facing, and only light, error here).

**Surfaces.**

| State | Title | Primary action | Notes |
|---|---|---|---|
| 404 | Page not found | Back to dashboard | + secondary (Search / Documents) |
| 403 | You don't have access | Request access / Back to dashboard | Names who to ask (workspace admin) |
| 500 | Something went wrong | Try again | Reassures work is auto-saved |
| Offline | You're offline | Retry | "Changes saved, will sync on reconnect"; auto-reconnect |
| Maintenance | Down for maintenance | View status | ETA if known + status-page link |
| **Delete blocked → Archive** | Can't delete {entity} | **Archive instead** | Lists blocking dependents; explains archive vs delete; hard delete unlocks at zero refs |
| Portal 404 | Page not found | Go to documentation home | Light/branded; no app chrome; no hint a workspace exists |

**Layout — app system page (dark, centered).** State glyph badge (lost/lock/alert/offline — DS icons in a tinted badge) → one-line title → 1–2 sentence body (what happened + reassurance + who to ask) → primary recovery + optional ghost secondary. Shell may be absent (hard error) or present with a dimmed canvas (in-app 404).

**Delete-blocked dialog (scrim + dialog).** Title "Can't delete {Product name}" → reason "referenced by {N} documents" + **list of blockers** → archive explanation (removes from new content, preserves existing references) → **Archive instead** (primary) · Cancel. This is the visible face of invariant 7 (architecture §6). Sibling: the "documents returned to Draft" cascade notice (toast/inline, owned by the relevant feature).

**Components.** Centered state layout (new; reuses auth-card / empty-state pattern) · state glyph badge (DS icons: lock/alert/search + tinted badge) · Button (Primary/Ghost) · confirm dialog (scrim + panel; reuses Convert-block / Send-back pattern) · branded portal header (Public Portal) for portal 404.

**Data/RSC.** App pages render in the app DS; the portal 404 renders from the customer Brand Profile. Delete-blocked is enforced by FK existence checks (hard delete only at zero references); the dialog renders the blocker list.

**a11y.** Dialogs = `role="dialog"` + trap + Esc + restore. Recovery actions are real focusable buttons. Don't rely on the glyph alone — titles/bodies carry the meaning.

**Figma.** Page `368:914` · section `369:931` (7 frames: 404 · 403 · 500 · Offline · Maintenance [dark DS centered] · Delete-blocked → Archive dialog · Portal 404 [light branded]).

---

## G. Public Portal (visitor) — separate domain

**Overview.** What Arther's customers' customers see — a **frozen-artifact, branded mini-website** on `{workspace}.arther.io` (or custom domain). Content baked at publish (accurate, signed-off); presentation maintained live (the Brand Profile). Must be findable (SEO/SSR), product-first navigable, fast/readable without JS, and **mobile-first** — this is the product's only mobile-facing surface.

> **Styling — read this.** The portal is skinned by the **customer's Brand Profile**, *not* Arther's app DS. The Figma frames are **LIGHT + branded** (demo accent `#2F6FED`) — the one intentional exception to the dark, monochrome app. Engineering renders the portal from the Brand Profile + published snapshot; do not reconcile it to the dark app DS. Arther fixes **structure** (nav, page layout, heading order, block order); the customer controls **look** (logo, colors, type, custom CSS). See `02` §8 and the on-canvas annotation `342:911`.

**Routes (separate domain, SSR).** Homepage `…/` (product grid) · Product landing `…/{product-slug}/` (description + docs grouped by type + variant picker) · Document `…/{product-slug}/{doc-slug}/` (latest) · Versioned `…/v{n.n}` (stable, **not indexed**) · Variant `…/{product-slug}/{variant-slug}/` (+ variant switcher) · Search (persistent input; **latest snapshots only**) · gated docs (email entry → magic link → 24h session).

**Layout.**
- **Homepage:** branded header (logo · search · minimal nav) → product grid (card: name · image · short excerpt · published-doc count; most-recent-first). Empty → clean not-found (never advertises an unpublished workspace).
- **Product landing:** header + product title → admin-authored portal description (rich text) → documents grouped by type (Datasheet · Installation Manual · …; each row: title · version · last-published) → variant picker if variants.
- **Document page:** doc header (title · product name [link up] · version + version picker · last-published · **Download PDF** · access state) → body (the rendered block tree, **interactive, readable without JS**) → **TOC** (auto from headings; sticky desktop, collapsible mobile).
- **Gated access:** branded gate (logo + "Enter your email to access this document"); allowlisted docs reject non-allowlisted emails with a clear message → magic link → 24h session → render.

**Block rendering / SSR.** Server renders full HTML from the published snapshot → crawlable/indexable → JS hydrates interactive blocks; if JS fails, content stays readable. Interactive blocks **degrade gracefully** (accordion/step wizard/tabs/hotspot/video all content-visible without JS). 13 block types render web contracts. Frozen artifact: always serves the last approved snapshot.

**Responsive / mobile (the mobile surface).** Header collapses (logo + menu/search) · product grid → single column · document page → single column with sticky/collapsible doc header + TOC, horizontally scrolling tables, touch-operable interactive blocks, Download PDF one tap away · gate → full-screen email entry. Readable at phone widths first, then enhanced for tablet/desktop.

**Components.** Branded site header (new; logo · search · nav) · product card (new) · document-type group + doc row (new) · block renderers (reuse `block-renderer` web contract) · version picker · TOC · Download PDF · variant switcher · email-entry gate (new) · (Brand Profile skins all of the above).

**States.** Homepage (grid / not-found) · product landing · product with variants · document page · versioned document · variant page · search results · search (no results) · gate (email entry / rejected) · mobile document · loading/SSR.

**Data/RSC.** The **portal app** (separate Next.js deployment, ADR-003) reads only `published_snapshots` via a tightly scoped service path; ISR/tag-revalidation on publish; CDN-cached. Magic links are signed, time-limited tokens — **not** Supabase Auth accounts (visitors aren't members; architecture §5.4). PDF is pre-rendered at publish (direct file fetch). Custom domain is canonical for SEO.

**a11y.** Light-surface contrast already tuned (body `#4A5564` 7.5:1; links `#2F6FED`/`#1A66C9`). Watch the near-threshold pairs (search placeholder `#6B7280` 4.51:1; accent/CTA ~4.55:1) — fragile, nudge if retuned. One logical heading order per page; TOC anchors keyboard-reachable; gate form labelled.

**Figma.** Page `322:913` · section `325:911` (6 light frames: Homepage `322:914` · Product `323:912` · Document `323:977` · Document mobile [390w] `324:911` · Gated `324:952` · Search `324:964`). Mobile additions: Homepage `338:911` · Gated `338:945`. Accent-systems annotation `342:911`.

---

*End of screen specs.*
