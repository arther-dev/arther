# Arther — Publishing Portal & Export: Feature Specification

**Version:** 1.2
**Date:** May 2026
**Status:** Specification complete — greenfield design
**Changes in v1.1:** All open questions resolved except snippet correction propagation (formally deferred to Feature 7). Empty state, product archival model, session behaviour on access config change, search index scope, and staged Brand Profile apply flow added to relevant sections. Design Decisions table updated to reflect all closed decisions.
**Changes in v1.2:** Tabs block type removed from rendering tables (Tabs removed from the Visual Block Editor scope — see Feature 3). Block type count updated to 13 in portal rendering and PDF degradation tables.
**Changes in v1.3 (4 Jun 2026):** Brand Profile / portal branding **management** (create/edit, custom CSS, the staged-apply flow, and preview) moved to **Workspace Admin → Brand Profiles** (Feature 10). §8 now describes only how the portal *renders* with the Brand Profile; there is no separate Portal "Branding" management view. Aligns with `Design/IA/arther-app-ia.md` §11.

---

## 1. Overview

### 1.1 Purpose

The Publishing Portal is the customer-facing surface of Arther — the place where internal technical documentation becomes an external product. It receives finished documents from the Visual Block Editor, publishes them as a branded, interactive documentation hub, and makes them available to partners, customers, and the public. PDF export is the companion output: a single-file rendition of any published document, generated at publish time and available for instant download.

The portal is not a document viewer bolted onto a documentation tool. It is a fully specified publication platform: versioned releases, gated access, custom branding, custom domains, full-text search, and an organised product-first navigation structure. A workspace's published portal is, from the outside, a polished documentation website. From the inside, it is a thin rendering layer over Arther's structured block tree.

### 1.2 Role in Arther

The Publishing Portal sits at the end of Arther's core pipeline:

- **Upstream:** Visual Block Editor — produces the finished block array and triggers the publish action. Every block type definition, source taxonomy, and inline spec token model established in earlier feature documents are upstream constraints this feature inherits.
- **Upstream:** Smart Spec Tracking — the staleness metadata and block-to-field reference model that powers pre-flight validation at publish time.
- **Downstream:** End customers, partners, and the public — the audience this feature ultimately serves.

### 1.3 The Portal's Primary Constraint

The portal makes a specific promise to the people who read published documents: the content they see reflects a deliberate, reviewed release. Spec values do not change silently. Documents do not update without the author's intent. This is a frozen artifact model, not a live view. Every architectural decision in this feature — the snapshot model, the publish-time resolver, the pre-flight check, the version history — exists to honour that promise.

---

## 2. Who Uses This

### Technical Writers (Primary — Publisher)

Technical writers are the primary actors in the publish workflow. They initiate publishing, review pre-flight checks, configure access settings, and monitor the published portal. For them, the portal is the finish line: the moment the document is no longer internal.

**Jobs they accomplish with the portal:**
- Publish a finished document as a new versioned release
- Configure access gating (public, open magic link, or allowlisted magic link)
- Monitor who has accessed gated documents via the audit log
- Manage published release history and deprecate old releases
- Configure portal branding and custom domain

### Workspace Admins (Secondary — Configurator)

Admins configure the workspace-level portal settings: Brand Profile, custom domain, and workspace slug. They may also manage email allowlists for gated documents.

### Portal Visitors (External — Readers)

The end audience. Engineers, procurement teams, partners, customers. They navigate the documentation hub, read published documents on the interactive portal, and download PDFs. For gated documents, they authenticate via magic link. They never interact with Arther's editing interface.

---

## 3. Core Concepts

### 3.1 The Frozen Artifact Model

A published Arther document is a frozen artifact. When a technical writer publishes a document, Arther captures a snapshot of the document's block tree with all spec references resolved to their values at the moment of publication. That snapshot does not change. Future spec field updates, prose edits, or brief changes do not affect a published release — they affect the next release.

This model makes a specific promise to portal visitors: what they read today is what was approved and released. The document will not silently update. If something changes, a new release is published with a new version number.

**What is frozen:** all block content, all resolved spec field values, all inline spec token values.

**What is not frozen:** portal presentation. Brand profile changes (logo, colours, typography, CSS) apply to all published documents immediately without requiring republication. A branding bug fix or a company rebrand does not require every document to be republished.

This separation — frozen content, maintainable presentation — is the key architectural property of the snapshot model.

### 3.2 The Publish-Time Resolver

At the moment a technical writer initiates a publish action, Arther runs the publish-time resolver across the entire block tree. The resolver walks every block and performs a type-specific resolution:

| Block source | Resolution behaviour |
|---|---|
| Spec-referenced block | Current spec field value is read and baked into the snapshot. The live reference is replaced with a value snapshot. |
| Brief-referenced block | Prose is captured as-is. No resolution required. |
| Structural block | Captured as-is. |
| Snippet block | Snippet content is resolved at publish time and embedded in the snapshot. The snapshot does not contain a live snippet reference — it contains the snippet's content at the moment of publication. |
| Placeholder block | **Blocks publication.** Documents with unresolved placeholder blocks cannot be published. This is a pre-flight check gate, not a resolver behaviour. |

The resolver also records resolution metadata in the snapshot: for each spec-referenced block, the snapshot captures the field ID, the field version ID, and the resolved value. This metadata is what makes the audit trail meaningful — a dispute about what a published document said can be resolved by inspecting the snapshot, not by relying on memory.

### 3.3 The Snapshot Schema

Each published release stores:

```typescript
interface PublishedSnapshot {
  id: string
  document_id: string
  workspace_id: string
  product_id: string
  version: string                      // semantic version: "1.0", "1.1", "2.0"
  published_at: string                 // ISO 8601 timestamp
  published_by: string                 // user ID
  block_tree: ResolvedBlock[]          // fully resolved block array, no live references
  resolution_manifest: ResolutionRecord[]  // per-block resolution metadata
  pdf_storage_key: string              // storage key for the pre-rendered PDF
  pdf_ready: boolean                   // false until background PDF job completes
  access_config: AccessConfig          // gating settings active at publish time
}

interface ResolutionRecord {
  block_id: string
  source: 'spec' | 'brief' | 'structural' | 'snippet'
  field_id?: string                    // populated for spec-referenced blocks
  field_version_id?: string           // populated for spec-referenced blocks
  resolved_value_snapshot?: unknown   // the value at publish time
}
```

### 3.4 Release Versioning

Each published release carries a semantic version number: `major.minor` format (e.g. `1.0`, `1.1`, `2.0`). Version numbers are set by the publishing author at publish time. Arther does not auto-increment — the author chooses the version and it signals significance to readers.

The portal always displays the highest-numbered release by default. Every release has a permanent, stable URL. Previous releases remain accessible at their versioned URL indefinitely unless explicitly archived by a workspace admin.

---

## 4. Portal Structure and Navigation

### 4.1 The Documentation Hub Model

A workspace's published portal is a documentation hub — a branded mini-website that organises all of the workspace's published documents under a single URL. It is not a flat list of documents, and it is not a single-document viewer. It is a product-first navigation structure that mirrors the way hardware companies think about their own product lines.

The portal has three structural levels:

```
{workspace}.arther.io/                          → Portal homepage (product grid)
{workspace}.arther.io/{product-slug}/           → Product landing page
{workspace}.arther.io/{product-slug}/{doc-slug}/         → Document (latest release)
{workspace}.arther.io/{product-slug}/{doc-slug}/v1.2     → Document (specific release)
```

For custom domains, the path structure is identical with the custom host replacing `{workspace}.arther.io`.

### 4.2 Portal Homepage

The portal homepage renders a **product grid**: one card per published product, ordered by most-recently-updated by default. Each product card shows:

- Product name
- Product image (if configured)
- A short excerpt from the product's portal description
- A count of published documents

The homepage is generated server-side from the workspace's product and publication data. It updates automatically when new products are published or existing products are updated — no manual homepage editing required at launch.

**Empty state:** If a workspace has no published products, the public portal shows a clean not-found page. No setup prompts, no partial UI, no indication that a workspace exists but has not published yet. Setup guidance lives inside Arther's editor interface, not on the public portal.

*Post-launch addition:* A curated homepage mode that allows workspace admins to feature specific products, write a workspace-level introduction, and manually control layout and ordering.

### 4.3 Product Landing Page

Each product that has at least one published document gets a landing page. The landing page contains:

**Portal description** — a rich text field authored by the workspace admin specifically for the portal. This is separate from any description in the spec database. The spec database description is internal and technical; the portal description is customer-facing. Supported formatting: bold, italic, hyperlinks, paragraph breaks. Not a full block editor.

**Published document list** — all published documents for this product, grouped by document type (Datasheet, Installation Manual, Owner's Manual, etc.), each showing its current version number and last-published date.

**Product archival:** Published documents remain accessible on the portal indefinitely until explicitly archived by a workspace admin. Archiving a product in the spec database does not automatically archive its portal pages — the customer controls when content disappears from their public portal. Archived portal pages return a not-found response and are removed from the portal homepage and search index. Archival is reversible.

### 4.4 Document Page

The document page renders the published snapshot's block tree as an interactive web page. All block types render with full interactivity: accordion sections expand and collapse, step wizards are navigable, tabs switch, hotspot pins are hoverable, videos play, GIFs animate.

The document page header shows:
- Document title
- Product name (links back to product landing page)
- Current version number with a version picker for navigating to previous releases
- Last published date
- Download PDF button (see Section 6)
- Access gate if configured (see Section 7)

A version picker in the header allows visitors to navigate to previous releases. The URL updates to the versioned path when a previous release is selected.

### 4.5 Portal Search

Full-text search across all published documents in the workspace. The search index is built from the resolved block tree content of every published snapshot — including prose blocks, spec table values, and heading text.

Search is accessible from a persistent search input in the portal navigation. Results are presented as a list of matching documents with a snippet showing the matching text in context. Results are scoped to published snapshots only — draft documents are never indexed.

The search index is updated when a new release is published. **Only the latest release of each document is indexed** — previous releases are not searchable. This is a deliberate decision: indexing historical releases creates a content accuracy problem where a corrected v1.1 document leaves the erroneous v1.0 content surfacing in search results. Visitors with a direct link to a specific historical release can still access it; they simply cannot discover it via search. Historical release indexing is a post-launch addition if customer demand warrants it.

---

## 5. Rendering Architecture

### 5.1 Server-Side Rendering with Hydration

The portal is server-side rendered (SSR). When a portal visitor requests a document URL, the server renders the full HTML from the published snapshot's block tree and delivers it as a complete page. JavaScript is then loaded to hydrate interactive block types (accordion, tabs, step wizard, hotspot, video).

SSR is chosen for three reasons:

1. **SEO** — Hardware companies' customers search for datasheets by product name. Published Arther documents must be crawlable and indexable. A client-rendered portal would undermine a core business outcome for customers.
2. **Performance** — The page is readable before any JavaScript loads. Interactive blocks enhance the experience but are not required for it.
3. **Reliability** — If JavaScript fails or is blocked, the document remains readable. Content is never withheld behind a JavaScript requirement.

### 5.2 Block Rendering Contracts — Web Portal

Every block type has a fully specified web rendering contract. Interactive blocks degrade gracefully if JavaScript is unavailable.

| Block type | Web portal rendering |
|---|---|
| Paragraph | HTML `<p>` with inline formatting preserved |
| Heading | `<h2>` / `<h3>` / `<h4>` with anchor links |
| Spec Table | Full HTML table with live values from the resolved snapshot |
| Image | Responsive `<img>` with alt text |
| Hotspot Image | Image with interactive pin overlays; clicking a pin reveals the annotation label |
| Video | Embedded player |
| GIF | Animated `<img>` |
| Accordion | Collapsed by default; sections expand/collapse via JS; all sections visible without JS |
| Step Wizard | Step-by-step navigation via JS; all steps visible in sequence without JS |
| Code Block | Syntax-highlighted `<pre><code>` |
| Callout | Styled aside with icon and colour treatment |
| Divider | `<hr>` |
| Table of Contents | Anchor link list auto-generated from heading blocks |

---

## 6. PDF Export

### 6.1 Rendering Engine

PDF export uses **headless Chrome** (Puppeteer or Playwright) as the rendering engine. The portal's SSR rendering pipeline produces the HTML; headless Chrome prints it to PDF via `@media print` CSS.

This approach is chosen over a dedicated typesetting engine (such as Typst) because it reuses the same rendering pipeline as the interactive portal. One block rendering codebase produces both outputs. When a block type changes, both web and PDF renderings update together. Maintaining separate template systems for web and PDF would create a permanent source of subtle inconsistency and double the maintenance burden on every future block type addition.

### 6.2 PDF Generation Timing

PDF export is **pre-rendered at publish time as an asynchronous background job.** When a technical writer initiates a publish action:

1. The publish-time resolver runs and the snapshot is written to the database.
2. A PDF generation job is enqueued.
3. Publishing is not considered complete — and the document does not appear on the portal — until the PDF job succeeds and `pdf_ready` is set to `true` on the snapshot.

This means the PDF is always available before the first portal visitor arrives. The Download PDF button is never in a loading or generating state from the visitor's perspective. Download is a direct file fetch.

If the PDF job fails, publishing fails. The author is notified with a specific error. Retry is available without re-initiating the full publish flow.

### 6.3 Block Degradation Rules — PDF

Interactive blocks degrade to static equivalents via `@media print` CSS. Degradation rules are canonical — they are defined once and apply consistently across all documents.

| Block type | PDF degradation |
|---|---|
| Paragraph | Rendered as-is |
| Heading | Rendered as-is with page-break-avoid applied |
| Spec Table | Full static table |
| Image | Static image |
| Hotspot Image | Image with pin number markers composited at their `x_percent / y_percent` positions, followed by a two-column legend table: pin number \| annotation label. All annotation content is preserved. |
| Video | First frame printed as a static image |
| GIF | First frame printed as a static image |
| Accordion | All sections expanded and printed sequentially with section titles as subheadings |
| Step Wizard | All steps printed as a numbered list |
| Code Block | Rendered as-is |
| Callout | Rendered as a styled box |
| Divider | Rendered as-is |
| Table of Contents | Rendered as a static list (no anchor links) |

**Note on Hotspot Image:** The annotation label text on each `HotspotPin` is first-class block data, not a UI overlay. It must be present and non-empty for the PDF legend to be meaningful. Empty pin labels are treated as incomplete content and trigger the pre-flight completeness check.

---

## 7. Gated Access

### 7.1 Access Model

Every published document has an access configuration. Three modes are available:

| Mode | Behaviour |
|---|---|
| **Public** | No gate. Anyone with the URL can read the document. Default for newly published documents. |
| **Open magic link** | Any visitor can enter their email address and receive a time-limited magic link. No pre-approved list required. Suitable for lead generation and lightly-gated content. |
| **Allowlisted magic link** | Only email addresses or domains on the allowlist can request a magic link. Suitable for NDA-gated documents and internal documentation. |

Access configuration is set at the **document level**, not the workspace level. A workspace can simultaneously publish some documents publicly, some with open magic links, and some with strict allowlists.

### 7.2 Magic Link Model

When a visitor requests access to a gated document:

1. They are presented with an email entry form (branded with the workspace's Brand Profile).
2. They submit their email address.
3. For allowlisted documents: if the email or domain is not on the allowlist, the request is rejected with a clear message.
4. A time-limited magic link is sent to the submitted address.
5. The visitor clicks the link and is granted a session.

**Session duration:** 24 hours from link activation. After expiry, the visitor must request a new magic link.

**Link characteristics:** Single-use. Clicking the link creates a session and invalidates the link. Sharing the link does not share the session.

**Access config changes and active sessions:** Changes to a document's access configuration — tightening (e.g. open → allowlisted) or loosening (e.g. allowlisted → public) — affect new magic link requests only. Active sessions are not invalidated when access config changes. They run to their natural 24-hour expiry. This prevents jarring mid-session logouts for legitimate reviewers. The 24-hour session cap limits the exposure window for tightening scenarios to an acceptable level.

### 7.3 Email Allowlist

For allowlisted magic link documents, the workspace admin or document owner configures access as:

- **Specific email addresses** — `john@partner.com`, `sarah@partner.com`
- **Domain allowlist** — `@partner.com` (all addresses at the domain may request a link)
- **Both** — a mix of specific addresses and domain patterns

Allowlist entries are managed per document in the document's publish settings panel.

### 7.4 Audit Log

Every magic link access event is logged. Each record captures:

- Email address that requested and activated the link
- Timestamp of link request and link activation
- Document ID
- Snapshot version ID (the exact release accessed, not just the document)
- IP address at activation
- Link expiry time

The audit log is accessible to workspace admins and document owners from within Arther. It is not exposed on the portal. The snapshot version ID is the critical field for compliance use cases — it establishes exactly which version of a document a specific person accessed at a specific time.

---

## 8. Portal Branding

### 8.1 Brand Profile

Each workspace has a Brand Profile that controls the visual presentation of its published portal. The Brand Profile is stored as a named entity with a workspace foreign key — not as a flat column on the workspace record. This data model supports a future multi-brand-profile capability (one profile per product line or sub-brand) without a schema migration.

At launch, each workspace has exactly one Brand Profile.

**Management of the Brand Profile — creating and editing it, the custom-CSS escape hatch, the staged-apply flow, and preview — lives in Workspace Admin → Brand Profiles (Feature 10), not in a Portal "Branding" view (changed in v1.3).** This section describes only what the Brand Profile controls when the portal renders.

### 8.2 What the Brand Profile Controls

| Setting | Description |
|---|---|
| Logo | Uploaded image, shown in portal navigation header |
| Primary colour | Used for buttons, links, active states, and accent elements |
| Secondary colour | Used for backgrounds and subtle UI elements |
| Typography | Font choice from a curated list of web-safe and Google Fonts options |
| Custom CSS | Freeform CSS injection for customers who need precise control beyond the standard settings |

Custom CSS is the intentional escape hatch. Rather than anticipating every customer preference in the Brand Profile settings panel, custom CSS allows customers with strong brand guidelines to make precise adjustments without Arther needing to build a full theme system.

Brand Profile changes use a **staged apply flow** (the controls live in Workspace Admin → Brand Profiles). Edits are saved as a draft Brand Profile and do not affect the live portal until the admin explicitly triggers "Apply to portal." This applies to all Brand Profile settings including custom CSS. The staged flow prevents live portal breakage from in-progress edits and gives admins a review step before changes go public.

A preview mode (also in Workspace Admin → Brand Profiles) renders a sample published document with the draft Brand Profile applied, allowing admins to verify changes before committing them.

### 8.3 What the Brand Profile Does Not Control

The portal's structural layout — navigation hierarchy, document page structure, heading hierarchy, block rendering order — is controlled by Arther, not the customer. This is intentional: consistent structure is what makes the portal professional and navigable. Customers can change how it looks; they cannot change how it works.

---

## 9. Custom Domains

### 9.1 Default Portal URL

Every workspace gets a default portal URL at `{workspace-slug}.arther.io`. The workspace slug is set at workspace creation and must be globally unique. It forms the root of all portal URLs for that workspace.

### 9.2 Custom Domain Setup

Customers can point a custom domain (e.g. `docs.acmecorp.com`) to their Arther portal. Setup flow:

1. Customer adds a CNAME record pointing their chosen subdomain to Arther's portal infrastructure.
2. Customer enters their custom domain in workspace settings.
3. Arther provisions a TLS certificate via Let's Encrypt.
4. Arther begins routing requests for the custom domain to the workspace's portal.

Once a custom domain is configured, the portal is accessible at both the custom domain and the default `{workspace}.arther.io` URL. The custom domain is canonical — Arther sets canonical meta tags accordingly for SEO.

---

## 10. Pre-Flight Checks

Before a document can be published, Arther runs a pre-flight check. Checks are divided into two tiers: blocking and advisory.

### 10.1 Blocking Checks (Cannot Publish Until Resolved)

| Check | Description |
|---|---|
| Unresolved placeholder blocks | Any block with source type `placeholder` that has not been replaced with authored content. Placeholder blocks represent missing brief data — publishing them means publishing an incomplete document. |
| Broken spec field references | Any inline spec token or spec-referenced block that references a field ID that no longer exists in the spec database. This can occur if a spec field is deleted after the document was generated. |

Blocking checks are shown as a list of specific issues with navigation links to the relevant blocks. The Publish action is disabled until all blocking checks are resolved.

### 10.2 Advisory Checks (Can Publish With Acknowledgement)

| Check | Description |
|---|---|
| Stale spec-referenced blocks | Blocks where the referenced spec field value has changed since the block was generated or last regenerated. The author may be intentionally publishing with the current value — but they must acknowledge the staleness explicitly. |
| Missing image alt text | Image blocks (including hotspot images) with empty `alt_text` fields. Affects accessibility and SEO. |
| Sections below Quality Standard word count | Prose sections that fall below the minimum word count defined in the document's Quality Standard. |
| Empty pin labels on hotspot images | Hotspot image blocks with pins that have empty `label` fields. These pins will produce incomplete PDF legend entries. |

Advisory checks are shown as warnings with the option to acknowledge and proceed. The author must explicitly confirm they have reviewed each advisory warning before publishing. This acknowledgement is logged in the audit trail.

---

## 11. Design Decisions

| Decision | Rationale |
|---|---|
| Frozen artifact model (option 2 snapshot) | Content frozen at publish time; presentation (branding) maintainable without republication. Balances content trust with operational flexibility. |
| SSR with JS hydration | Required for SEO (hardware customers search for datasheets), performance (readable before JS loads), and reliability (content accessible without JS). Client-side-only rendering was explicitly rejected. |
| Headless Chrome for PDF | Reuses SSR rendering pipeline. One block rendering codebase, two outputs. Separate typesetting engine (Typst) would require maintaining two rendering representations of every block type. |
| Pre-render PDF at publish time | PDF must be immediately available for download on the portal. Generating on demand introduces latency at the worst moment (visitor wants the file now). Background job at publish time means download is always a direct file fetch. |
| No DOCX export | One export format reduces pipeline complexity significantly. DOCX has meaningfully different degradation characteristics from PDF and would require a separate rendering library. Can be added post-launch if customer demand warrants it. |
| Magic link authentication only | Arther should not be in the identity business. Magic links serve both internal and external audiences without requiring Arther to build account management infrastructure. SSO integration is a post-launch addition for enterprise customers. |
| Document-level access configuration | A workspace publishes documents for different audiences simultaneously. Workspace-level access control is too coarse. |
| 24-hour session duration | Long enough for a full day of review work. Short enough to limit exposure from unattended sessions. Configurable per-workspace is a post-launch addition. |
| Access config changes affect new requests only | Tightening access mid-session would cause jarring logouts for legitimate reviewers. 24-hour session cap limits the exposure window to an acceptable level. |
| Portal search indexes latest release only | Indexing historical releases creates a content accuracy problem — corrected content in v1.1 would compete with erroneous content from v1.0 in search results. Visitors with direct versioned URLs can still access historical releases. |
| Empty portal shows not-found page | Setup prompts belong inside Arther's editor, not on the public portal. A not-found response prevents a half-built workspace from appearing publicly. |
| Product archival is explicit and manual | The customer controls when content disappears from their public portal. Archiving in the spec database should not automatically unpublish documentation — those are separate decisions with different audiences. |
| Staged apply flow for Brand Profile | Custom CSS injection without a review step is a foot-gun. Staged apply plus a preview mode gives admins confidence before changes go live on a public portal. |
| Product-grid homepage | Hardware companies organise around products. The portal navigation should mirror that mental model. Flat document lists lose the product hierarchy that gives the portal its structure. |
| Brand Profile as named entity | Storing as a workspace-level singleton would require a schema migration to support multiple brand profiles (e.g. per product line). Named entity with unique constraint is the same at launch but avoids the future migration. |
| Portal description separate from spec database description | Spec database descriptions are internal and technical. Portal descriptions are customer-facing. Conflating them forces a compromise that serves neither audience. |
| Semantic versioning for releases | Author-set version numbers communicate significance to readers in a way that auto-incremented numbers or dates cannot. The author's judgment about whether a change is a minor update (1.1) or a major revision (2.0) is meaningful information for the document's audience. |

---

## 12. Open Questions

| Question | Owner | Blocking? |
|---|---|---|
| **Snippet correction propagation (deferred to Feature 7 — Content Reuse).** Snippet content is resolved and embedded in the snapshot at publish time. If a snippet is subsequently corrected (e.g. a regulatory compliance statement is updated), documents published before the correction will contain the old content. The question to resolve in Feature 7 is: does Arther treat published documents as truly frozen in all cases, or does it acknowledge that certain content — particularly regulatory boilerplate distributed via snippets — has a legitimate reason to propagate corrections retroactively into published snapshots? This is a product philosophy question about the boundary of the frozen artifact model, and it must be answered in the content reuse context where the snippet versioning model is designed. | Product — resolve in Feature 7 | Not blocking for this feature |

---

*Arther — Publishing Portal & Export: Feature Specification. Version 1.2, May 2026. Covers the frozen artifact snapshot model and publish-time resolver, SSR rendering architecture with JS hydration for interactive blocks, headless Chrome PDF pipeline with publish-time pre-rendering, canonical block degradation rules for PDF across all 13 block types (Tabs removed from scope), magic link gated access with email and domain allowlisting and 24-hour sessions, audit log schema, product-grid portal navigation with product landing pages and full-text search, semantic versioning for published releases with stable versioned URLs, Brand Profile data model and custom domain routing, and a two-tier pre-flight check system (blocking and advisory). Intended as the authoritative design reference for this feature bucket, downstream of the Visual Block Editor and Smart Spec Tracking, upstream of the Collaboration & Review feature document.*
