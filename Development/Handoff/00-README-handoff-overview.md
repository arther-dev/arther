# Arther — Developer Handoff

**Date:** 2026-06-08 · **Status:** ready for engineering · **Author:** Callum (with Claude)
**Covers both Figma files:** the Design System (foundations) **and** the Screens file (app shell + all 12 surfaces).

This handoff turns the Arther design work into a build spec. It pairs with the IA suite (`Design/IA/`), the audits (`Design/`), and the architecture (`Development/Architecture/`), and is written for the actual stack: **TypeScript · Next.js (App Router) · Supabase · Trigger.dev · Claude API · Zod**, with a shared `ui` + `block-renderer` in a pnpm/Turborepo monorepo (ADR-001…014).

---

## How this handoff is organized

Two layers, because the two Figma files answer different questions and the screens are built *from* the design system.

| Doc | Layer | Figma file | What's in it |
|---|---|---|---|
| **`01-foundations-design-system.md`** | Foundation | DS — `GESXbRrqd3dYh8XkFBLpeC` | Tokens (color/type/spacing/radius/effects/size), the 54 components (variants/states/props), icon system, implementation mapping, known issues |
| **`02-app-shell-and-patterns.md`** | Frame | Screens — `pdMPtD58F3MeLrTzWsoX3E` | The 5-region shell, modes, tab system, shell states, responsive, keyboard, URL→App Router mapping, cross-cutting overlays, cross-screen patterns, motion, the file-wide **accessibility spec** |
| **`03-screens-part-1-core.md`** | Surfaces | Screens | Dashboard · Specs · New Document · Editor (+ deep block editing) · Reviews |
| **`04-screens-part-2-supporting.md`** | Surfaces | Screens | Snippets · Import · Portal mgmt · Settings · Auth & Account · System & Errors · Public Portal (visitor) |

**Build order:** foundations (01) first — it's the dependency every screen references — then the shell (02), then surfaces (03–04). The screens reference DS tokens/components *by name*, so a token export and the `ui` package should exist before screen work starts.

**Per-surface spec format** (docs 03–04): Overview · Route & shell · Layout · Components · States · Interactions/flows · Edge cases · Data/RSC notes · Figma node refs.

---

## Stack mapping (the one-screen summary)

| Design concept | Implementation |
|---|---|
| Two-tier tokens (Primitives → Semantic) | CSS custom properties on `[data-theme]` + optional Tailwind `theme.extend`; components read semantic vars only |
| 54 DS components | One React component each in the shared **`ui`** package; props mirror Figma variant axes; no hardcoded colors |
| 20 block types | The shared **`block-renderer`** package — one tree→React module used by editor preview, portal SSR, **and** the PDF task |
| 5-region shell, 6 modes | App Router: root layout (top bar + overlay layer) → per-module layout (rail + Navigator/Inspector slots) → page; active tab = mode = route segment |
| Authenticated app vs public portal | **Two Next.js deployments** in one monorepo (ADR-003); portal reads only `published_snapshots` |
| Reads (grids, lists, tables) | Server components under RLS with the user JWT |
| Interactive surfaces (editor, tabs, palette, assistant, inspectors) | Client components |
| Mutations | Server actions, Zod-validated, through `canDo` |
| Long ops (generate, publish/PDF, import, propagate, notify) | Trigger.dev durable tasks; status streamed via Supabase Realtime |
| Spec values in prose | `InlineSpecToken{field_id, field_version_id}` — never free text; resolve from the spec DB (the staleness mechanism) |
| Tokens/values byte-exact | Figma Dev Mode → export Variables from the DS file |

Full rationale: `Development/Architecture/arther-architecture.md` + `arther-adrs.md`.

---

## Global conventions (true on every screen)

- **Dark, monochrome app** — neutrals + one safety-red + one focus-blue, fully DS-token-bound. **One exception:** the public portal is **light + customer-brand-skinned** (renders from the Brand Profile, not the app DS). Never reconcile the two. Two link blues coexist by design: app-internal `text/link` `#1A66C9` (on paper) vs. portal demo accent `#2F6FED`.
- **Auto-save everywhere** — no save buttons; the connectivity chip (Connected/Saving/Offline) and tab state indicators carry save status.
- **Archive, never orphan** — entities with dependents can't be hard-deleted; the delete-blocked → Archive dialog is a first-class pattern (invariant 7).
- **Two-speed updates** — spec changes auto-update structured content in working copies and **flag prose** for review; published snapshots are untouched until republish.
- **Desktop-only authoring** (editor hard-min ≈1024px); the **portal is the only mobile surface**.
- **Three top-bar overlays, never merged** — ⌘K command palette (deterministic), ⌘J Ask Arther (AI, confirms writes), bell notifications (feed). The Dashboard is the work queue; notifications route into it.
- **Pre-flight checklists** gate generate / send-for-review / publish (blocking vs advisory).

---

## Accessibility — design done, code to wire

The DS already ships AA-safe tokens, a focus ring, and ≥24px hit areas; the screens passed a WCAG 2.1 AA pass after the 2026-06-08 remediation. What's left is **implementation** (can't be done in static Figma) — fully specified in `02-app-shell-and-patterns.md` §11 and `Design/arther-screens-accessibility-audit.md`:

- `:focus-visible` → 2px `border/focus` ring on all interactive elements
- ARIA name/role/value for icon-only controls, tabs, toggles, dialogs (+ focus trap / Esc / restore)
- Persistent `<label for>` on every field; inline error text via `aria-describedby` (never color-only)
- Keyboard order for the palette / slash menu / spec-token picker
- The **editor light-paper island** rendered in DS Light mode (critical — see 02 §11.5)
- ≥24px hit-area floor for any new icon control

---

## Figma walkthrough

Two files. Open them in **Dev Mode** alongside these docs. Node IDs below jump you to each surface; convert a URL's `node-id=A-B` to `A:B` for the references here.

### Design System — `GESXbRrqd3dYh8XkFBLpeC`
`https://www.figma.com/design/GESXbRrqd3dYh8XkFBLpeC/`

| Inspect | Node |
|---|---|
| Variables (5 collections, 101 vars) — export for two-mode values | Local variables panel |
| Text + effect styles (12 + 3) | Local styles |
| Field row (hug-height reference) | `21:38` |
| Editor toolbar (Authoring/Review) · Content toolbar (library) | `6df07589…` · `28:32` |
| Button set · Text field set | `f8bc95b9…` · `045ed181…` (12 variants; `5723efd7…` is its default-variant key) |
| Icons | check `8ba9fecf` · chevron-down `968d9e61` · plus `6b64ed6b` · lock `2b27ea40` · x `58004330` · search `c8dc23fb` |

### Screens — `pdMPtD58F3MeLrTzWsoX3E`
`https://www.figma.com/design/pdMPtD58F3MeLrTzWsoX3E/`

| Surface | Page | Section | Frames | Handoff doc |
|---|---|---|---|---|
| App shell (Modes / States / Overlays) | app-shell page | 3 sections | 15 | 02 |
| Editor — shell states | `60:800` | 3 sections (`79:1408/1409/1410`) | 12 (incl. base `40:132`) | 03 D |
| Cross-cutting overlays | `314:911` | `321:1307` | 5 | 02 §8 |
| Dashboard | `247:911` | `258:1111` | 6 | 03 A |
| Specs | `199:911` | `233:1798/1799/1800` | 14 | 03 B |
| New Document | `236:911` | `245:1087` | 6 | 03 C |
| Editor — Deep | `357:913` | `365:1775` | 11 | 03 D |
| Reviews | `260:911` | `269:1343` | 6 | 03 E |
| Snippets | `304:911` | `313:1165` | 6 | 04 A |
| Import | `271:911` | `280:1097` | 6 | 04 B |
| Portal (mgmt) | `281:911` | `290:1163` | 6 | 04 C |
| Settings | `291:911` | `303:1183` | 6 | 04 D |
| Auth & Account | `348:946` | `355:1033` | 11 | 04 E |
| System & Errors | `368:914` | `369:931` | 7 | 04 F |
| Public Portal (visitor, light) | `322:913` | `325:911` (+ `338:911`, `338:945`) | 6 + 2 mobile | 04 G |

Editor base/paper/inspector reference frames (page `60:800`): `40:132` / `40:216` / `40:222`. Public-portal accent annotation: `342:911`.

---

## Known issues & pre-build notes

- ✅ **DS republished 2026-06-08** — verified clean in the Screens file (Field-row hug-height, muted-scale AA, `border/input`, `radius/2xs`, Table-row axis split, full docs, +states).
- ✅ **Handoff audited 2026-06-09** (`arther-handoff-audit.md`) and fixed in place. The interactive prototype page (`372:911`) was **removed from the Screens file** — references deleted. `⌘\` is now **Focus**; panel toggles moved to `⌥⌘\` / `⌥⌘⇧\` *(tbc)*.
- ⚠ **Table row** axis change is breaking for external instances: re-point `Type=Data hover/selected` → `Type=Data, State=Hover/Selected`.
- ⚠ **App-shells reference page drift** — 8 buttons show the Button's default leading "+" where it's semantically wrong (Back/Cancel/Publish/View portal/Save). Follow the per-surface pages (which hide it), not the shell reference, for button icon usage.
- Near-AA pairs pass but are fragile — nudge one step if the palette is ever retuned. `text/tertiary` (`ink/200`) clears AA on **all six** dark surfaces; its tightest pair is `bg/inset` (4.56:1). Portal search/CTA sit at ~4.51–4.55:1.
- Open build-time questions are flagged inline in each spec (e.g. Reviews: do Approved docs stay in the queue?; New Document: live-preview fidelity; Settings: schema-editor depth).

---

## Companion documents

- **IA (behavior, states, flows):** `Design/IA/arther-app-ia.md`, `Design/IA/Feature IA/arther-*-ia.md`
- **Audits:** `Design/arther-design-system-audit.md` · `arther-screens-accessibility-audit.md` · `arther-screens-design-critique.md` · `arther-screens-qa-review.md` · `Development/Handoff/arther-handoff-audit.md` (audit of these docs)
- **Architecture:** `Development/Architecture/arther-architecture.md` · `arther-adrs.md` (…014) · `arther-data-model.md` · `arther-architecture-audit.md` · `vibecode-best-practices.md` (pre-launch gate)
- **Product:** `Features/PRD/arther-prd.md` + the 18 feature specs in `Features/Spec Docs/`
