# Arther Handoff · 01 — Foundations (Design System)

**Source file:** Arther — Design System · Figma key `GESXbRrqd3dYh8XkFBLpeC` (published library)
**Token/component data:** the 2026-06-08 live Plugin-API read in `Design/arther-design-system-audit.md` (post-republish), cross-checked against `Design/arther-screens-accessibility-audit.md`.
**Stack target:** TypeScript · Next.js (App Router) · the shared `ui` + `block-renderer` packages (see `Development/Architecture/arther-architecture.md` §4, ADR-001/002).
**Status:** DS scored ~94/100, republished 2026-06-08. This doc is the build spec for the foundation layer that every screen consumes.

> **Byte-exact values:** the hex/number values below are the resolved dark-mode values from the live read and are correct for building the theme. For the canonical, always-current export, open the DS file in **Figma Dev Mode** and export Variables (or use the Code Connect map). Treat the published Figma library as the source of truth; this doc maps it to code.

---

## 1. Architecture — how to consume tokens

The DS is a **two-tier token system** and this is load-bearing — build it the same way:

```
Primitives  (ink/50…900, paper/50…900, red/*, accent/*)   ← raw palette, never referenced by components
     ▲ alias
Semantic    (bg/*, text/*, border/*, status/*, safety/*)   ← the ONLY tokens components/screens use
```

- **Theme by remapping aliases, not by editing components.** Dark mode is the active theme; Light mode remaps the structural aliases (`bg/*`, `text/*`, `border/*`) while semantic/status colors are intentionally shared across modes. Implement as two value sets behind one variable name.
- **Project rule (enforced):** screens/components reference **semantic tokens only** — never raw hex, never primitives. 100% of colors and strokes in all 54 components are token-bound today; keep that invariant in code. Primitives carry no Figma picker scopes — mirror that by not exposing them in the component API.
- **Recommended code shape:** semantic tokens → CSS custom properties on a `[data-theme]` root (and/or a Tailwind `theme.extend` that points at those vars). One definition, both modes. See §10.

---

## 2. Color tokens

Resolved **dark-mode** values (active theme). Light-mode values exist for structural tokens; export from Dev Mode for the exact light set.

### 2.1 Semantic — backgrounds (surface ramp)

| Token | Dark hex | Role |
|---|---|---|
| `bg/canvas` | `#0E0E10` | App page background (deepest) |
| `bg/surface` | `#141416` | Primary surface / panels |
| `bg/panel` | `#16161A` | Sidebar / inspector panels |
| `bg/raised` | `#1A1A1F` | Raised cards, popovers |
| `bg/active` | `#1C1C20` | Selected/active row fill |
| `bg/inset` | `#232328` | Inset wells, spec-token chips, table zebra |

> Surface ramp note: `text/tertiary` clears AA on all six surfaces post-remediation, with the least headroom on the lighter insets — see §2.5.

### 2.2 Semantic — text

| Token | Dark hex | Contrast (dark) | Use |
|---|---|---|---|
| `text/primary` | `#ECECEE` | 13.3–16.4:1 (AAA) | Body, titles, values |
| `text/secondary` | `#9A9AA2` (`ink/160`) | 5.6–6.9:1 | Labels, secondary copy |
| `text/tertiary` | `#8A8A90` (`ink/200`) | 4.56–5.62:1 (AA on all six surfaces) | Timestamps, meta, hints — see fragility note §2.5 |
| `text/disabled` | ~`#5x` | ≤2.2:1 (exempt) | Disabled control text only |
| `text/link` | Dark `#378ADD` · **Light `#1A66C9`** | 4.9:1 on paper | Inline links; the Light value is for the editor's light paper |

### 2.3 Semantic — borders

| Token | Dark hex | Contrast | Use |
|---|---|---|---|
| `border/subtle` | ~`#1E1E22` | ~1.2:1 | Decorative dividers (non-interactive only) |
| `border/strong` | ~`#2A2A30` | ~1.4:1 | Container separators |
| `border/input` | `#6E6E76` (`ink/300`) | 3.57:1 | **Resting form-control boundary** (added in remediation — use it so inputs read as inputs) |
| `border/focus` | `#378ADD` | 5.4:1 dark · 3.2:1 paper | **Focus ring** — wire to `:focus-visible` everywhere (§10.4) |

### 2.4 Semantic — status & safety

| Token | Dark hex | Meaning |
|---|---|---|
| `status/live` | `#5E9E78` (green) | Live / current / success |
| `status/stale` | `#B9892F` (amber) | Stale / changed / needs review |
| `status/review` | `#378ADD` (blue) | In review |
| `status/draft` | neutral | Draft |
| `status/unpublished` | neutral | Unpublished changes |
| `safety/warn-bg` | `#FBEEEA` | Warning block background (light by design) |
| `safety/warn-text` | `#B23B22` | Warning text (5.2:1 on warn-bg) |
| `safety/warn-border` | red | Warning block border |
| (caution) | amber family | Caution safety block |
| (note) | blue family | Note safety block |

**Semantic color language (keep consistent in code):** green = live/current/success · amber = stale/warning/changed · red = error/removed/destructive. Safety blocks (Warning/Caution/Note) are **non-themeable** by compliance requirement (ISO 82079 / ANSI Z535.6) — do not let Brand Profiles or themes recolor them.

### 2.5 Accessibility rules baked into the tokens (must honor in code)

1. **`text/tertiary` fragility note:** since the `ink/200` re-point it passes AA on **all six** dark surfaces (4.56–5.62:1) — no usage restriction required. The tightest pairs are the lighter surfaces (`bg/inset` 4.56:1), so preferring `text/secondary` for dense small meta there is a worthwhile defensive convention, not a rule.
2. **Inputs use `border/input`** (3.57:1), never `border/subtle`/`border/strong`, for their resting boundary.
3. **Editor light "paper" is a Light-mode island** inside the dark app — render the document canvas in Light mode so `text/secondary`/`text/primary`/`text/link` resolve to their light values (the dark-tuned values fail badly on paper). Spec-token chips inside paper stay Dark mode (they're meant to pop). See `02-app-shell-and-patterns.md` §a11y and the Editor screen spec.
4. **Two accent systems — do not reconcile:** the app is monochrome (neutrals + one safety-red + one focus-blue, DS-bound, dark). The public portal is **light + customer-brand-skinned** (demo accent `#2F6FED`) and renders from the customer **Brand Profile**, *not* this DS. Keep them in separate styling layers.

---

## 3. Typography

- **Family:** Instrument Sans (single UI family — no custom/secondary fonts anywhere). The **Arther wordmark** is a brand asset (script display face) used only in the top-bar brand + auth card, not for UI text.
- **Weights:** three — 400 Regular · 500 Medium · 600 SemiBold (SemiBold only on Display, H1, H2, Overline). Do not introduce 700.
- **The 12 text styles** (exact values from the 2026-06-09 live read):

| Style | Size / weight | Line height | Use |
|---|---|---|---|
| `Display` | 28/600 | 120% | Hero / auth-card titles |
| `Heading/H1` | 24/600 | 125% | Page titles |
| `Heading/H2` | 20/600 | 130% | Section titles |
| `Title` | 18/500 | 135% | Card / panel titles |
| `Body/Large` | 17/500 | 145% | Lead copy |
| `Body/Default` | 16/400 | 150% | Body copy, field values |
| `Body/Strong` | 16/500 | 150% | Emphasis |
| `Label/Default` | 14/400 | 140% | Form labels, dense rows |
| `Label/Strong` | 14/500 | 140% | Emphasized labels |
| `Caption/Default` | 13/400 | 135% | Meta, helper |
| `Caption/Strong` | 13/500 | 135% | Emphasized meta |
| `Overline` | 11.5/600 · +6% tracking | 120% | Small-caps micro-labels (SPEC REFERENCES, WORKSPACE) |

> The micro-labels are **`Overline`**, not Caption — they carry heavy structural load at 11.5px; keep them at `text/secondary` (not tertiary) for legibility. There is no `Heading/H3`, `Body/Small`, or `Mono/*` style; code/spec values use `Label`/`Caption` with the inset chip treatment.

---

## 4. Spacing scale

Eleven steps, **t-shirt named** `space/2xs` … `space/6xl`:

```
2xs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 40 · 5xl 48 · 6xl 64   (px)
```

- Bound to GAP and PADDING in Figma (91% padding / 73% gap coverage; the unbound tail is intentional optical 5/10/18px in the shell). In code, expose as `--space-*` / Tailwind spacing scale and use the scale by default.
- A few legacy shell gaps (3/6/14px) are off-scale and were snapped — don't reintroduce off-scale spacing.

## 5. Radius

| Token | px | Use |
|---|---|---|
| `radius/2xs` | 2 | Hairline chips |
| `radius/xs` | 4 | Inputs, small controls, table cells |
| `radius/sm` | 6 | Buttons, cards |
| `radius/md` | 8 | Panels |
| `radius/lg` | 12 | Modals, large cards |
| `radius/xl` | 16 | Large overlays / hero cards |
| `radius/pill` | 999 | Fully-rounded pills, avatars |

(7 radius tokens; values above are exact. Rule: rounded corners only with full borders — never round a single-sided accent border.)

## 6. Elevation / effects

Three effect styles — `Elevation/Card`, `Elevation/Panel`, `Elevation/Overlay`. Map to three `--shadow-*` tokens. Overlay is for modals/slide-overs/command palette/spotlight; Panel for sidebars; Card for raised content. No gradients, glows, or neon anywhere in the system.

## 7. Sizing tokens (app-shell dimensions)

Dedicated layout-size tokens (`size/topbar-h`, etc.) plus the control heights that drive density and tap targets:

| Element | Height | 2.2 AA target (24px) | Note |
|---|---|---|---|
| Nav rail item | 44 | ✓ (also 44 AAA) | Local rail icon target |
| Field row (Specs) | 48 | ✓ | Spec field grid row |
| Nav row / Text field | 40 | ✓ | Settings/forms |
| Button / Tab | 36 | ✓ | Standard control |
| Icon button | 34 | ✓ | Top-bar utilities now wrapped to 34 |
| Avatar | 30 | ✓ | Account |
| Spec-token chip | 24 | ✓ (exactly) | Inline token |

**Target-size rule for code:** every icon-only control gets a **≥24×24** hit area (wrap 12–22px glyphs in padded targets); top-bar utilities + avatar should reach toward 44px. The DS now ships these hit areas — keep the floor for any new icon control.

> `size/rail-item` was retuned 40 → **44** (2026-06-09) to match the shipped Nav rail item component — token and component now agree. The token was verified unbound, so nothing shifted; the new value ships with the next DS republish.

---

## 8. Icon system

25 outline icons; strokes are **token-bound** (fully themeable — color follows `text/*`). Size inline at 16–20px; never exceed 24px decorative. Known keys (for Code Connect / asset pull): `check 8ba9fecf` · `chevron-down 968d9e61` · `plus 6b64ed6b` · `lock 2b27ea40` · `x 58004330` · `search c8dc23fb` (+ bell, help, menu, alert-triangle, file-text, package, edit, …). Do not substitute emoji or typed glyphs (✓ ● ○ ⌕ 🔒) — a prior QA pass replaced 61 of these with icon instances precisely because emoji don't render in Instrument Sans.

---

## 9. Components (54)

25 icons · 13 atoms · 10 molecules · 6 shell organisms. Below: every interactive component with its variant axes, states, and the build notes that matter. Pattern: **one axis for category/type, a separate axis for `State`.**

### 9.1 Atoms

| Component | Variant axes | States | Build notes |
|---|---|---|---|
| **Button** | Variant (Primary/Secondary/Ghost…) × Size | Default·Hover·Pressed·Focus·Disabled·Loading | 18 variants. Has a **leading icon slot** — hide it when semantically wrong (Back/Cancel/Save). Loading = spinner + disabled. |
| **Icon button** | Size | Default·Active·Hover·Pressed·Focus·Disabled | 34px hit area; needs `aria-label`. |
| **Text field** | Type (Text/Select) × Size | Default·Hover·Focus·Filled·Error·Disabled | Resting border = `border/input`. **No built-in label prop** — pair with a persistent `<label>` (see a11y U1). Error binds `safety/*` + needs `aria-describedby` error text. |
| **Toggle** | — | Default·Focus·Disabled (+Hover added) | `role="switch"` + `aria-checked`. |
| **Tab** | — | Active·Inactive·Hover·Focus·Disabled | `role="tab"` in a `tablist`; `aria-selected`; ←/→ roving focus. |
| **Nav rail item** | — | Active·Inactive·Hover·Focus·Disabled | Icon-only + label-on-hover; active = accent bar. 44px. |
| **Nav row** | — | Default·Active·Hover·Focus·Disabled | Settings section list; inactive State value = "Default". |
| **Status pill** | Semantic (Live/Draft/Stale/Review/Unpublished) | per-semantic | Text label always present (never color-only). |
| **Spec token** | — | Default·Hover·Focus·Disabled | Inline chip, 24px; non-editable; click → field popover. Excluded from find/replace. |
| **Avatar** | size | static | 30px; account + comment authors. |
| **Divider**, **Section subhead**, **Skeleton** | — | static | Layout primitives. |

### 9.2 Molecules

| Component | Variant axes | States | Build notes |
|---|---|---|---|
| **Field row** | Type × State | — | Specs field grid + tables. **Hug-height** (was a 1px bug — fixed; `counterAxis AUTO`). |
| **Table row** | **Type (Header/Data) × State (Default/Hover/Selected/Focus)** | — | ⚠ Axis was restructured (breaking) — instances re-point `Type=Data hover` → `Type=Data, State=Hover`. `scope` headers in code. |
| **Metric card** | — | static | Dashboard stat tiles / analytics. |
| **Panel** | — | static | Generic surface container with padding + an optional header slot (320w base, key `3b1bdb21…`) — the Navigator/Inspector content base. |
| **Product select card**, **Doc card** | — | Default·Hover·Selected·Focus | Selectable cards; need visible focus. |
| **Command palette row** | — | Active·Default·Hover (Focus≈Active) | ⌘K results. |
| **Notification item** | Type (Stale/Review/Comment) | Default·Hover·Focus | Slide-over rows; hug-height fixed. |
| **Safety block** | Semantic (Warning/Caution/Note) | — | Non-themeable; container (holds Paragraph/Heading/Image). |
| **Wizard step** | Semantic (Active/Done/Todo) | — | First-run checklist, import stepper, generation stream. |

### 9.3 Shell organisms (6)

`Top bar` · `Local rail` · `Navigator` · `Content toolbar` · `Inspector` (tabbed: Properties/Comments/History) · `Editor toolbar` (Mode = Authoring/Review). These are the app frame — build once, slot content (see `02-app-shell-and-patterns.md`). The **Editor toolbar** is a distinct floating component (key `6df07589…`); the DS "Content toolbar" (`28:32`) is the library toolbar, not the editor's.

### 9.4 State-coverage gaps already closed (verify in code)

Focus added to Product select card, Doc card, Table row, Spec token, Notification item; Disabled added to Tab, Nav rail item, Nav row, Spec token; Hover added to Toggle. **Every element a keyboard user can land on has a Focus variant** using `border/focus` — these are the visual spec for `:focus-visible`.

---

## 10. Implementation mapping (TS / Next.js / `ui` package)

### 10.1 Tokens → code
- Emit semantic tokens as **CSS custom properties** under `:root[data-theme="dark"]` / `[data-theme="light"]`; alias primitives privately. Optionally mirror into `tailwind.config` `theme.extend.colors/spacing/borderRadius/boxShadow` referencing the same vars so utility classes and component CSS share one source.
- Type ramp → a `text-*` utility set or a `<Text variant>` component bound to the 12 styles.
- Keep the **two-tier indirection** in code: components read `--text-primary`, never `--ink-200`.

### 10.2 Components → the shared `ui` package
- One React component per DS component, props mirroring the Figma variant axes (e.g. `<Button variant size state>`, `<TextField type state>`). Default exports, no required props.
- Variant→className via a `cva`-style map; **no hardcoded colors** in component CSS — only `var(--…)`.
- The shell organisms become layout components in `ui` consumed by the App Router layouts (next doc).

### 10.3 Block renderer
- The 20 block types live in the shared **`block-renderer`** package (one tree→React module used by editor preview, portal SSR, and the PDF task — architecture §4). DS atoms/molecules are its building blocks; block leaves (Spec Table, Hotspot, Safety, etc.) are new components. See the Editor screen spec.

### 10.4 Accessibility wiring (DS provides the visuals; code provides behavior)
- **`:focus-visible`** → 2px `border/focus` ring on every interactive element (DS Focus variants are the spec).
- **Name/role/value:** icon-only controls get `aria-label`; tabs `role="tab"`+`aria-selected`; toggles `role="switch"`+`aria-checked`; dialogs/overlays `role="dialog"`+`aria-modal`+`aria-labelledby`, focus trap, Esc, focus restore.
- **Forms:** real `<label for>`; inline error text via `aria-describedby`; never color-only error.
- **Targets:** keep the ≥24px hit-area floor.

---

## 11. Known issues / pre-build checklist

- ✅ DS republished 2026-06-08 (muted-scale AA fix, `border/input`, `radius/2xs`, full docs, +states, Field-row hug-height fix, Table-row axis split). Verified clean in the Screens file.
- ⚠ **Table row axis change is breaking** for any external instance — re-point `Type=Data hover/selected` → `Type=Data, State=Hover/Selected` when consuming.
- ⚠ Five components had a **1px hug-height bug** (Notification item, Table row, Command palette row, Safety block, Content toolbar) — fixed; if you regenerate from an old export, confirm they hug content.
- Near-threshold pairs are AA-passing but **fragile** — nudge one step if the palette is ever retuned. `text/tertiary` clears all six dark surfaces (tightest: `bg/inset` 4.56:1); portal pairs sit ~4.51–4.55:1.

---

## 12. Figma walkthrough — DS file

Open `GESXbRrqd3dYh8XkFBLpeC` in Dev Mode and inspect:

| What | Where |
|---|---|
| Variables (5 collections, 101 vars) | Local variables panel → export for the exact two-mode values |
| Text + effect styles (12 + 3) | Local styles |
| Field row (hug-height reference) | `21:38` |
| Editor toolbar (Authoring/Review) | set `6df07589…` |
| Content toolbar (library) | `28:32` |
| Button set · Text field set | `f8bc95b9…` · `045ed181…` (12 variants; `5723efd7…` = its default-variant key) |
| Icon keys | check `8ba9fecf` · chevron-down `968d9e61` · plus `6b64ed6b` · lock `2b27ea40` · x `58004330` · search `c8dc23fb` |

→ Continue to `02-app-shell-and-patterns.md` for the frame these foundations assemble into.
