# Information Architecture: Arther — Portal Management

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **Portal** mode — the *inside* of the public site (publish, gate, measure). Extends `arther-app-shell-ia.md` and `arther-app-ia.md` (§4.5, §3.4 Flow A); realizes the Publishing Portal & Export spec (v1.3) + the Analytics event model. **The visitor-facing site is a separate domain with its own later IA (`arther-app-ia.md` §6) — not this doc.**
**Decisions this pass:** (1) Portal is a **mode with four rail views — Published · Domains · Access & Leads · Analytics** (Branding moved to Settings → Brand Profiles in v0.2, so there is **no Branding view**); (2) **Published** is the operational center (a table of published documents × their live release, with a per-item Inspector for portal settings); (3) **Access & Leads** sets per-document gating (Public / Open magic link / Allowlisted) and carries the **access audit log** (doubling as lead capture); (4) **Analytics** is the single home for **consumption + workspace** metrics (Owners/Admins only); (5) the actual **publish action** lives in the Editor's Publish dialog — Portal *manages* what's already published.

---

## 1. Purpose & Scope

Portal is the operations desk for everything customers see. It answers: what's **live** and at which version, **who** can read it (and who has), where it's **served** (domain), and how it's **consumed**. It is the management surface *behind* the public documentation hub — the frozen-artifact portal visitors read is a separate domain. The team works here to gate sensitive docs, capture leads, point a custom domain, and read the analytics that prove the docs are accurate and used.

**In scope:** the four rail views — **Published** (released documents, semantic versions, release history, archival, "View portal"); **Domains** (default `{slug}.arther.io` + custom domain via CNAME + Let's Encrypt TLS + canonical); **Access & Leads** (per-document access mode, email/domain allowlists, magic-link behaviour, the **access audit log**); **Analytics** (consumption + workspace metrics); their region content, states, flows, naming, component reuse, and URLs.

**Out of scope (referenced at the boundary):** the **visitor-facing portal** (homepage / product / document / variant pages, search, SSR/SEO, mobile) — its own later **Public Portal visitor IA**; the **publish flow / pre-flight / PDF render** (Editor Publish dialog + Portal IA boundary); **Brand Profile** authoring + custom CSS + staged-apply + preview (Settings → Brand Profiles); the snapshot/resolver internals (Portal spec §3); the analytics **event model** internals (Analytics spec); and all visual / design-system work.

---

## 2. Where Portal Sits (shell recap)

Portal is a top-level **mode** with a **local rail** of four views (Published · Domains · Access & Leads · Analytics). Per the app-shell, the **Navigator** is conditional (a list where a view needs one — e.g. Published's document list) and the **Inspector** is conditional (per-item config — e.g. a published document's portal settings). It is **Owner/Admin-leaning** (Analytics is Owners/Admins only). Portal **manages** published artifacts; it does not author or publish them — publishing happens in the **Editor** (the Publish dialog), and styling happens in **Settings → Brand Profiles**.

---

## 3. Surface & View Map

- **Published** (rail view) `/portal/published` *(default)* — what's live
  - **Document × release table** — each published doc, its **live version**, published date, visibility, views; release-history drill-in
  - **Per-document Inspector** — version/visibility summary · **View on portal** · **Archive** (manual/explicit)
  - **Empty** — nothing published yet
- **Domains** (rail view) `/portal/domains`
  - **Default URL** (`{slug}.arther.io`) + **Custom domain** (CNAME instructions · **TLS status** via Let's Encrypt · canonical-host note)
- **Access & Leads** (rail view) `/portal/access`
  - **Per-document access** — mode: **Public / Open magic link / Allowlisted**; allowlist (emails + domains)
  - **Access audit log** — email · requested/activated time · document · **snapshot version** · IP · expiry (compliance + leads)
- **Analytics** (rail view) `/portal/analytics` *(Owners/Admins)*
  - **Consumption** — views, unique visitors, downloads, top / zero-result searches, by variant
  - **Workspace** — generation success, review cycle time, rejection rate, staleness count
  - **Loading** — chrome first; tiles / table skeletons

---

## 4. Navigation Model

- **Primary:** the **local rail** switches the four views. No universal "Portal home" beyond Published (the default).
- **Published:** a table; selecting a document opens its **Inspector** (portal settings) and a **release-history** drill-in; **View on portal** opens the live page (new tab / visitor domain).
- **Access & Leads:** a per-document list; selecting one reveals its access mode + allowlist editor; a **tab/segment** switches between **Access** (config) and **Audit log** (events).
- **Analytics:** a date-range control; consumption vs. workspace sections; export.
- **Cross-links:** a document's **Publish dialog** (Editor) is where new versions originate; Portal links *back* to the Editor/Library for the working copy. **Brand/styling** links out to **Settings → Brand Profiles**.
- **Keyboard / Mobile:** desktop-only authoring app; the *visitor* portal is the mobile surface (separate IA).

---

## 5. Region Content Hierarchy

### Published (content = table · Inspector = per-doc)
1. **Header** — "Published" + **View portal** (opens the live site) + count.
2. **Document × release table** — columns: Document · **Live version** (e.g. v2.1) · Published · **Visibility** (Public / Magic link / Allowlisted) · Views · (overflow). Rows link to the doc's portal settings.
3. **Release history** (drill-in) — every released version of a document, each with its stable versioned URL; archive a version (admin, explicit).
4. **Inspector (per-document)** — live version + published-by/date; visibility summary (links to Access & Leads); **View on portal**; **Archive** (with the snapshot-stays-served note).
5. **Empty** — "Nothing's published yet — publish a document from the Editor."

### Domains
1. **Default portal URL** — `{slug}.arther.io` (copyable), "this is always available."
2. **Custom domain** — input (`docs.acmecorp.com`) + **CNAME instructions** + **TLS status** (Provisioning / Active via Let's Encrypt) + **canonical** indicator (custom domain is canonical for SEO).
3. **Status** — Connected / Pending DNS / Error, with next-step guidance.

### Access & Leads
1. **Access (per document)** — a list of published docs, each with its **mode** (Public / Open magic link / Allowlisted) editable inline; for allowlisted: an **allowlist** of emails + `@domains`.
2. **Magic-link behaviour** — surfaced as read-only context (24-hour single-use session; config changes affect new links only).
3. **Audit log** — a table: email · requested · activated · document · **snapshot version** · IP · expiry. The snapshot-version column is the compliance anchor ("who read exactly which version, when"); it doubles as the **lead list**.

### Analytics (Owners/Admins)
1. **Date range** + scope.
2. **Consumption tiles + charts** — views, unique visitors, PDF downloads, top searches, **zero-result searches**, by variant.
3. **Workspace tiles** — generation success rate, median review cycle time, rejection rate, **live staleness count** (the Dashboard's tile links here).
4. Owners/Admins only; export.

---

## 6. User Flows

### See what's live / view the portal
1. Portal → **Published** → scan version/visibility/views → **View on portal** to see the public page.

### Gate a document + capture leads
1. **Access & Leads** → pick a document → set **Allowlisted** → add `@partner.com` → magic-link requests now gated; the **audit log** records each access (and builds the lead list).

### Point a custom domain
1. **Domains** → enter `docs.acmecorp.com` → add the **CNAME** → Arther provisions **TLS** → status **Active**, custom domain canonical.

### Read the numbers
1. **Analytics** → consumption (what customers read, what they searched and didn't find) + workspace (generation success, review cycle time, staleness) → act (e.g. zero-result searches → a doc gap).

### Archive an old release
1. **Published** → a document's **release history** → archive a superseded version (explicit; the live snapshot keeps serving).

---

## 7. States

Published (table) · Published (empty) · release-history drill-in · per-doc Inspector · Domains (default only) · Domains (custom — pending DNS / active / error) · Access (per-doc modes) · Allowlist editor · Audit log · Analytics (consumption) · Analytics (workspace) · Loading.

---

## 8. Naming Conventions

| Concept | Label in UI | Notes |
|---|---|---|
| The mode | **Portal** | Management of the public site (not the site) |
| Live snapshot | **Published** / **Release** | Semantic `major.minor`, author-set at publish |
| Access modes | **Public · Open magic link · Allowlisted** | Per document |
| Time-limited entry | **Magic link** | 24h, single-use |
| Who-read-what record | **Audit log** | Snapshot-version column = compliance anchor; also the lead list |
| Reachability | **Domain** | Default `{slug}.arther.io` + custom (canonical) |
| Numbers | **Analytics** | Consumption + workspace; Owners/Admins |
| Styling | **Brand Profile** | Lives in **Settings**, not Portal (v0.2/v1.3) |

---

## 9. Component Reuse Map

| Component | Source | Use in Portal |
|---|---|---|
| Top bar · Local rail · Navigator · Inspector | App-shell | The mode frame; rail = 4 views |
| Table row · Field row · Status pill | DS | Published table, audit log, access list; visibility/TLS pills |
| Metric card | DS | Analytics tiles |
| Chart | New (Analytics) / Chart block renderer | Consumption + workspace charts |
| Button · Text field · Tab · Toggle | DS | View portal, domain input, access mode, audit/access segment |
| Avatar | DS | Published-by, audit entries |
| Skeleton | DS | Loading |

---

## 10. Content Growth Plan

- **Published documents** grow → the table sorts/filters (by visibility, type, date) + search; release history paginates.
- **Audit-log** entries grow indefinitely → paginated + filterable (by document, email, date); exportable.
- **Allowlists** grow → per-document editor with domain patterns to keep entries compact.
- **Analytics** ranges → date-range control; charts aggregate.

---

## 11. URL Strategy

- Views: `/portal/published` (default) · `/portal/domains` · `/portal/access` · `/portal/analytics`.
- Published drill-ins: `?doc={id}` (Inspector) · `?doc={id}&history=1` (release history).
- Access & Leads: `?doc={id}` (config) · `?view=audit` (log).
- Analytics: `?range=30d&scope=consumption|workspace`.
- The **visitor** portal is a **separate domain** (`{slug}.arther.io` / custom) with its own URL model (app-ia §12) — not under `/portal`.
- Reserves `/{workspaceSlug}/…` per the shell.

---

## 12. Resolved Decisions (this pass)

1. **Four rail views** — Published · Domains · Access & Leads · Analytics; **no Branding view** (moved to Settings → Brand Profiles).
2. **Published = a document × release table** with a per-document Inspector for portal settings + release history; **View on portal** opens the live site.
3. **Access & Leads carries both** the per-document gating config **and** the access audit log (compliance + lead capture) — split by an Access / Audit log segment.
4. **Analytics = consumption + workspace** in one Owners/Admins view; the Dashboard's stale-count tile deep-links here.
5. **Portal manages, the Editor publishes** — the publish action + pre-flight live in the Editor's Publish dialog; Portal shows the result.

*Open (resolve during build):* whether **Published** rows expand inline to release history or open a drill-in; whether **Access** config is inline per row or in the Inspector; the exact **Analytics** tile/chart set (depends on the Analytics event model).

---

## 13. Out of Scope (this pass)

The **visitor-facing portal** (its own later IA — homepage/product/document/variant pages, search, SSR/SEO, mobile); the **publish flow / pre-flight / PDF** (Editor Publish dialog); **Brand Profile** authoring + custom CSS + staged-apply + preview (Settings → Brand Profiles); snapshot/resolver internals (Portal spec §3/§5); the **Analytics event model** internals (Analytics spec); responsive/mobile (the visitor portal is the mobile surface); and all visual / design-system work.

---

*Arther — Portal Management Information Architecture. Version 0.1, 6 June 2026. Page-level IA for the Portal mode's four rail views — Published (semantic-versioned releases + per-doc portal settings), Domains (default + custom domain via CNAME/TLS), Access & Leads (per-document gating + magic links + the access audit log), and Analytics (consumption + workspace metrics). Extends `arther-app-shell-ia.md` and `arther-app-ia.md` (§4.5); realizes the Publishing Portal & Export spec v1.3. The visitor-facing portal is a separate, later IA. Next in the roadmap: Settings, Snippets, Cross-cutting, then the Public Portal visitor IA.*
