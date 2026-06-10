# Information Architecture: Arther — Public Portal (Visitor)

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **public, visitor-facing portal** — the customer documentation hub on a **separate domain**. The **last** per-screen IA in the suite. Extends `arther-app-ia.md` (§6) and realizes the Publishing Portal & Export spec (v1.3, §4–§9). This is **not** the authoring app — different domain, different chrome, **brand-styled**, and the product's **only mobile-facing surface**.
**Decisions this pass:** (1) a **product-first hub** — Homepage (product grid) → Product landing → Document page (latest/versioned) — on `{workspace}.arther.io` or a custom domain; (2) **SSR + SEO-first** (content readable before JS; interactive blocks hydrate, degrade gracefully); (3) the customer's **Brand Profile controls look** (logo · colours · type · custom CSS), **Arther controls structure** (nav, page layout, block order); (4) **search** indexes **latest released snapshots only**; (5) **gated access** is per-document (Public / Open magic link / Allowlisted) with a branded email-entry → magic-link → 24h session; (6) **mobile is in scope** (the portal is the mobile surface).

**This IA is theme-agnostic on purpose.** The portal renders in the customer's Brand Profile, so the visual theme (light/branded vs. dark) is a presentation choice confirmed at build time — not a structural decision. Structure, wayfinding, and content hierarchy are what this doc fixes.

---

## 1. Purpose & Scope

The public portal is what Arther's customers' customers see — distributors, installers, sales engineers, and end users reading a datasheet or installation manual. It is a **frozen-artifact, branded mini-website**: content baked at publish (accurate, signed-off), presentation maintained live (the Brand Profile). It must be **findable** (SEO/SSR), **navigable product-first**, **fast and reliable** (readable without JS), and **mobile-first** — because that's where installers read it on the floor.

**In scope:** the visitor surfaces — **Homepage** (product grid), **Product landing** (portal description + docs grouped by type), **Document page** (interactive block render + header: version picker · PDF · gate), **versioned** + **variant** pages, **Search**, and **gated access** (email entry → magic link); the **responsive/mobile** behaviour; SEO/SSR + block-rendering recap; states, naming, URLs.

**Out of scope (referenced at the boundary):** **publishing / snapshot / PDF render** internals (Portal spec §3/§5/§6 + Editor Publish dialog); **Brand Profile authoring** + custom CSS + staged apply (Settings → Brand Profiles); **portal management** (Published / Domains / Access & Leads / Analytics — the authoring-side Portal IA); the **access audit log** (Portal management); **portal-visitor commenting** + curated homepage (post-launch); and all visual / design-system work (the portal uses the **customer's** Brand Profile, not Arther's app DS).

---

## 2. Where the Portal Sits (separate domain)

The portal is **not** part of the authoring shell. It lives on **`{workspace}.arther.io`** (or a custom domain like `docs.acmecorp.com`), has **no app top bar / rail / inspector**, and is **server-side rendered** for crawlability. Its chrome is a **branded site header** (logo + minimal nav + search) over content. The customer's **Brand Profile** supplies logo, colours, typography, and optional custom CSS; **Arther fixes the structure** (navigation hierarchy, page layout, heading order, block rendering) so every portal stays professional and consistent. It is the **mobile-facing** surface of the product.

---

## 3. Surface & URL Map

- **Homepage** `/{workspace}.arther.io/` — **product grid** (card per published product, most-recent-first)
  - **Empty** → a clean **not-found** (no setup prompts, no "workspace exists" hint)
- **Product landing** `/{product-slug}/` — portal description + **published docs grouped by type** (+ **variant picker** if variants)
- **Document page** `/{product-slug}/{doc-slug}/` — the rendered snapshot (latest)
  - **Versioned** `/{…}/v{n.n}` — a specific historical release (stable URL, not indexed)
  - **Variant page** `/{product-slug}/{variant-slug}/` — the variant's canonical page + **variant switcher**
  - **Gated** — if access-configured: a **branded email-entry gate** → magic link → 24h session
- **Search** — persistent input → **results** (matching docs + context snippet); **latest snapshots only**
- **PDF** — **Download PDF** of the current document (pre-rendered at publish)
- **Mobile** — every surface above, responsive (single-column, collapsible nav, sticky doc header + TOC)
- **States:** homepage (grid) · homepage (not-found/empty) · product landing · document page · versioned · variant · search results · search (no results) · gate (email entry) · gate (rejected) · loading/SSR.

---

## 4. Navigation Model

- **Product-first:** Homepage grid → a product → its docs (grouped by type) → a document. A persistent **breadcrumb** (Product → Document) links back up; the doc header links to the product landing.
- **Site header:** **logo** (→ homepage) · minimal **nav** · persistent **search**. No app modules — this is a reading surface.
- **Within a document:** a **version picker** (navigate to prior releases; URL → versioned path), a **Table of Contents** (auto from headings, anchor links), and a **Download PDF**.
- **Variants:** a **variant switcher** on variant-bearing products swaps between canonical and variant pages.
- **Gating:** a gated doc presents the **email-entry gate** first; after the magic link, the visitor reads within a session.
- **Mobile:** nav collapses to a menu; search is a tap; the doc header + TOC become sticky/collapsible; everything is single-column and touch-target sized.

---

## 5. Region Content Hierarchy

### Homepage (product grid)
1. **Branded header** — logo · search · (minimal nav).
2. **Product grid** — a card per product: **name · image (if set) · short excerpt · published-doc count**; most-recent-first.
3. **Empty** — a clean not-found (the portal never advertises an unpublished workspace).

### Product landing
1. **Header** + **product title**.
2. **Portal description** — admin-authored, customer-facing rich text (bold/italic/links/paragraphs; not a full editor).
3. **Documents grouped by type** — Datasheet · Installation Manual · User Guide · …, each row: title · **version** · last-published date.
4. **Variant picker** — if the product has variants.

### Document page
1. **Doc header** — title · **product name (link up)** · **version + version picker** · last-published · **Download PDF** · access state.
2. **Body** — the **rendered block tree**, fully interactive (accordion, tabs, step wizard, hotspot, video, GIF, Spec Table with live snapshot values, code, callout, divider) — **readable without JS**, enhanced with it.
3. **TOC** — auto-generated anchor list from headings (sticky on desktop; collapsible on mobile).

### Search
1. **Input** (persistent in the header) → **results list**: matching documents with a **context snippet**; latest snapshots only.
2. **No results** — a plain "no matches" state.

### Gated access (email entry)
1. **Branded gate** — logo + "Enter your email to access this document"; for **allowlisted** docs, a non-allowlisted email is **rejected with a clear message**.
2. After submit → **magic link** sent → click → 24h session → the document renders.

---

## 6. Responsive / Mobile (the mobile surface)

The portal is the **only mobile-facing surface** in the product (the authoring app is desktop-only). On mobile:
- **Header** collapses (logo + a menu/search affordance).
- **Product grid** → single column.
- **Document page** → single column; the **doc header** and **TOC** become **sticky/collapsible**; tables scroll horizontally; interactive blocks remain touch-operable; **Download PDF** stays one tap away.
- **Gate** → full-screen email entry.
- Targets are touch-sized; content is readable at phone widths first, then enhanced for tablet/desktop.

---

## 7. SEO / SSR + Block Rendering (recap)

- **SSR-first:** the server renders full HTML from the published snapshot → crawlable/indexable (customers search datasheets by product name) → JS **hydrates** interactive blocks; if JS fails, content stays readable.
- **Block contracts:** every block type has a web rendering contract; interactive ones (accordion / step wizard / tabs / hotspot / video) **degrade gracefully** (all content visible without JS).
- **Frozen artifact:** content is baked at publish; the Brand Profile (presentation) is maintainable live; the portal always serves the **last approved snapshot**.

---

## 8. States

Homepage (grid) · homepage (not-found) · product landing · product (with variants) · document page · versioned document · variant page · search results · search (no results) · gate (email entry) · gate (rejected) · mobile document · loading/SSR.

---

## 9. Naming Conventions

| Concept | Label | Notes |
|---|---|---|
| The site | **Portal** (visitor) | `{workspace}.arther.io` / custom domain |
| Top level | **Product** | The grid + landing |
| A reading page | **Document** | Rendered snapshot; latest by default |
| Pinned version | **Release / version** | `v{n.n}`; versioned URL, not indexed |
| Product variant page | **Variant** | Variant switcher |
| Access | **Public · Magic link · Allowlisted** | Per document; branded email gate |
| Offline export | **Download PDF** | Pre-rendered at publish |

---

## 10. Component Reuse Map

**Note:** the visitor portal is styled by the **customer's Brand Profile**, *not* Arther's monochrome app design system. Structure is Arther's; skin is the customer's. The Figma build represents a **branded portal theme** (confirmed at build time), distinct from the dark authoring app.

**Two accent systems — by design (handoff note).** Arther runs two distinct visual systems and they must not be reconciled: (1) the **authoring app** is monochrome — neutrals + one safety-red + one focus-blue, fully DS-token-bound, dark mode; (2) the **visitor portal** is **light and brand-skinned**, driven by the customer's Brand Profile (logo · accent · type · optional custom CSS) and the published snapshot — **not** the app DS. The Figma frames use a demo brand accent (`#2F6FED`). Engineering should render the portal from the Brand Profile + snapshot, and designers should not "correct" the portal to dark/monochrome to match the app. This is the only surface in the product that is intentionally light. (Mirrored as an on-canvas annotation on the Public Portal Figma page.)

| Component | Source | Use |
|---|---|---|
| Branded site header (logo · search · nav) | New (portal) | Every visitor page |
| Product card | New (portal) | Homepage grid |
| Document-type group + doc row | New (portal) | Product landing |
| Block renderers (13 types) | Reuses Editor block render (web contract) | Document page body |
| Version picker · TOC · Download PDF | New (portal) | Document header / aside |
| Variant switcher | New (portal) | Variant-bearing products |
| Email-entry gate | New (portal) | Gated documents |
| (Brand Profile: logo · palette · type · custom CSS) | Settings → Brand Profiles | Skins all of the above |

---

## 11. Content Growth Plan

- **Products / documents** grow → the homepage grid + product-first grouping + search scale; most-recent-first ordering; (curated homepage is a post-launch control).
- **Releases** accumulate → the version picker lists them; only the **latest** is indexed (historical reachable by direct link).
- **Variants** grow → the variant switcher; each variant a canonical page.
- **Search index** grows → latest-only keeps it accurate; SSR keeps it crawlable.

---

## 12. URL Strategy

- Homepage `…/` · product `…/{product-slug}/` · document `…/{product-slug}/{doc-slug}/` · versioned `…/{doc-slug}/v{n.n}` · variant `…/{product-slug}/{variant-slug}/`.
- **Custom domain:** identical paths with the custom host; the custom domain is **canonical** (SEO).
- Versioned URLs are **stable but not indexed**; archived pages return **not-found** and leave the index.
- This is a **separate domain** from the authoring app's `/{module}/…` routes.

---

## 13. Resolved Decisions (this pass)

1. **Product-first hub** (Homepage → Product → Document), SSR/SEO-first, on a separate domain.
2. **Brand Profile skins it; Arther fixes structure** — customers change how it looks, not how it works.
3. **Latest-only search index** (historical reachable by direct link) — avoids surfacing corrected-away content.
4. **Per-document gating** with a branded email→magic-link→24h-session flow; allowlist rejections are explicit.
5. **Mobile-first** — the portal is the product's mobile surface; the doc page is the priority mobile layout.
6. **Frozen artifact** — content baked at publish, presentation live; always serves the last approved snapshot.

*Confirm at build time:* the portal **theme** (light/branded vs. dark) — a presentation choice (the customer's Brand Profile), independent of this structure.

---

## 14. Out of Scope (this pass)

Publishing / snapshot / PDF-render internals (Portal spec + Editor Publish dialog); **Brand Profile authoring** (Settings → Brand Profiles); **portal management** (Published/Domains/Access&Leads/Analytics — Portal management IA); the **access audit log**; **visitor commenting**, **curated homepage**, **historical-release search** (post-launch); analytics/scroll-depth (Analytics); and all visual / design-system work beyond representing a branded portal theme.

---

*Arther — Public Portal (Visitor) Information Architecture. Version 0.1, 6 June 2026. Page-level IA for the customer-facing documentation hub on a separate domain: product-first navigation (Homepage grid → Product landing → Document page), versioned + variant pages, full-text search (latest snapshots), per-document gated access (email → magic link), SSR/SEO-first rendering with graceful block degradation, and a mobile-first responsive model (the portal is the product's only mobile surface). The customer's Brand Profile skins it; Arther fixes the structure. Extends `arther-app-ia.md` §6 and realizes the Publishing Portal & Export spec v1.3 §4–§9. This completes the per-screen IA suite.*
