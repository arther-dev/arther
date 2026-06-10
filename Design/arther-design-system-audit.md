# Arther Design System — Audit

**File:** Arther — Design System (`GESXbRrqd3dYh8XkFBLpeC`)
**Date:** 2026-06-08
**Method:** Live read of variables, styles, and all 54 components via the Figma Plugin API; contrast ratios computed to WCAG 2.1; states visually verified by screenshot.

---

## ✅ Remediation Log — 2026-06-08 (all priority actions completed)

Every priority action and recommendation below was implemented in the live file. **Score after remediation: ~94/100** (was 70). Decisions taken with Callum: shift the muted scale, document everything incl. primitives, full state build now. **The DS must be republished for these to reach the screens.**

| # | Action | What was done |
|---|--------|---------------|
| 1 | Muted text AA | Dark mode re-pointed: `text/secondary`→`ink/160` (#9a9aa2), `text/tertiary`→`ink/200` (#8a8a90). Both now pass AA on all 6 dark surfaces (tertiary 4.56–5.62, secondary 5.60–6.90); hierarchy preserved. |
| 2 | Form-control border | New semantic token **`border/input`** (dark→`ink/300` ≈3:1, light→`paper/700`, scope STROKE_COLOR, code syntax set). Rebound Text field Default/Hover/Filled borders (Text + Select) to it — resting inputs are now perceptibly bordered. |
| 3 | Spacing/radius tail | Added **`radius/2xs` (2px)**. Bound every exact-match padding/gap/radius; bound the 6 `radius=4` rects → `radius/xs`. Result: **fills, strokes, gap, radius = 100% token-bound.** Off-scale Shell gaps (3/6/14/10) snapped to the scale. 22 paddings left unbound on purpose (optical 5/10/18px). |
| 4 | Documentation | **All 100 variables and all 54 components now have descriptions** (semantic intent for Color/Size; templated for primitives/spacing/radius; what+when+axes for components). |
| 5 | Missing states | Toggle +Hover; Tab/Nav rail item/Nav row +Disabled; Spec token +Focus +Disabled; Product select card/Doc card +Focus; Notification item +Focus (×3 types). All use system tokens + `border/focus` rings. |
| 6 | Table row | Restructured single `Type` axis → **`Type (Header/Data) × State (Default/Hover/Selected/Focus)`** + new Focus variant. ⚠️ Breaking for existing instances — see note below. |
| + | Latent bug fix | Found and fixed a **1px hug-height bug** on 5 components (Notification item, Table row, Command palette row, Safety block, Content toolbar) — roots were `height=1` with content overflowing. Now hug correctly. |

**⚠️ Republish + instance notes**
- **Republish the library** for any of this to appear in the screens file.
- **Table row** axis change is breaking: existing Table row instances reference `Type=Data hover/Data selected`, which no longer exist. After republish, re-point them to `Type=Data, State=Hover/Selected`.
- The five **height-bug fixes** change those components' rendered height from 1px to their true height. Spot-check the Notification panel, tables, command palette, safety callouts, and content toolbar in the screens after republish.

---

## Summary

**Components reviewed:** 54 (25 icons · 13 atoms · 10 molecules · 6 shell) | **Variable collections:** 5 (98 variables) | **Styles:** 12 text · 3 effect · 0 paint | **Issues found:** 11 | **Score: 70 / 100**

The token engineering here is genuinely strong — arguably the top 10% of design systems for binding discipline. Every color and stroke in every component resolves to a semantic token (zero hardcoded hex), the architecture is a clean two-tier alias system (Primitives → semantic Color), and scopes are correctly constrained so designers can't pick raw primitives. The score is held back almost entirely by three things that are *additive*, not corrective: **no component or token is documented**, several **interactive components lack Focus/Disabled states**, and **`text/tertiary` fails AA on the lighter dark surfaces**. Fix those and this is a 90+ system.

| Layer | Grade | One-line |
|-------|-------|----------|
| Token architecture & coverage | A | Two-tier aliasing, 100% color/stroke binding, correct scopes |
| Naming consistency | A− | Clean and predictable; one state-in-Type axis slip |
| Component states & variants | C+ | Strong on atoms; Focus/Disabled gaps on interactive molecules |
| Documentation | F | 0 / 54 components and 0 / 98 variables have descriptions |
| Accessibility | C+ | Primary text excellent; tertiary text + default input border fail |

---

## Naming Consistency

| Area | Status | Notes |
|------|--------|-------|
| Color tokens | ✅ Consistent | `category/role` (`bg/surface`, `text/primary`, `border/focus`, `status/live`, `safety/warn-bg`) |
| Primitives | ✅ Consistent | `hue/step` (`ink/900`, `paper/50`, `red/400`) — Tailwind-style direction (900 = darkest) |
| Spacing / Radius / Size | ✅ Consistent | `space/sm`, `radius/md`, `size/topbar-h` — t-shirt + semantic sizing |
| Text styles | ✅ Consistent | `Category/Variant` (`Heading/H1`, `Body/Default`, `Caption/Strong`) |
| Effect styles | ✅ Consistent | `Elevation/Card·Panel·Overlay` |
| Components | ✅ Consistent | Title-case singular nouns; variant axis usually `State` |
| **Variant axis semantics** | ⚠️ One slip | **Table row** encodes interaction states inside a `Type` axis (`Header / Data / Data hover / Data selected`) instead of a separate `State` axis. Every other component keeps category and state on distinct axes. |

**Recommendation:** Split Table row into `Type (Header / Data)` × `State (Default / Hover / Selected)`. This is the only naming/structure inconsistency in the system.

---

## Token Coverage

Colors are **never** hardcoded — the headline strength of this system. The only unbound values are a small tail of spacing/radius numbers, mostly in the Shell organisms and a few helper rectangles.

| Category | Defined | Binding coverage | Hardcoded found |
|----------|---------|------------------|-----------------|
| Color — fills | 35 semantic / 35 primitive | **100%** (337 / 337) | 0 |
| Color — strokes | (same) | **100%** (176 / 176) | 0 |
| Icon color (strokes) | bound to tokens | **100%** (53 / 53) | 0 — icons are fully themeable |
| Corner radius | 6 tokens | **94%** (121 / 129) | 8 — six `Rectangle = 4` (→ should bind `radius/xs`), two `Rectangle = 2` (no token) |
| Padding | 11 spacing tokens | **91%** (421 / 461) | 40 |
| Gap / item spacing | (same) | **73%** (78 / 107) | 29 — concentrated in Shell |
| Typography | 12 styles | n/a | 0 custom fonts; all Instrument Sans |

**Why the spacing tail exists:** the hardcoded gaps in Shell use off-scale values — `3`, `6`, `14` — that have no matching token (the scale is 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64). They *couldn't* be bound without either snapping to the nearest step or adding tokens.

**Recommendations (low effort, high tidiness):**
1. Bind the six `radius/xs (4px)` rectangles in Molecules — token already exists.
2. Decide on `2px` radius and `3 / 6 / 14px` spacing: either add `radius/2xs`, `space/3`, `space/6`, `space/sm-plus`, or snap Shell spacing to the existing scale. Snapping is preferable — fewer tokens, more consistency.
3. Primitives correctly carry **no picker scopes** (kept out of property pickers) — keep it that way.

---

## Component Completeness

Atoms are in excellent shape. The gaps are (a) **no descriptions anywhere** and (b) **missing Focus/Disabled on interactive molecules and nav items**, which is both a polish and a keyboard-accessibility issue.

| Component | Variants | States present | Missing | Docs | Score |
|-----------|----------|----------------|---------|------|-------|
| Button | 18 | Default·Hover·Pressed·Focus·Disabled·Loading | — | ❌ | 9/10 |
| Icon button | 6 | Default·Active·Hover·Pressed·Focus·Disabled | — | ❌ | 9/10 |
| Text field | 12 | Default·Hover·Focus·Filled·Error·Disabled | — | ❌ | 9/10 |
| Toggle | 6 | Default·Focus·Disabled | **Hover** | ❌ | 7/10 |
| Tab | 4 | Active·Inactive·Hover·Focus | **Disabled** | ❌ | 7/10 |
| Nav rail item | 4 | Active·Inactive·Hover·Focus | **Disabled** | ❌ | 7/10 |
| Nav row | 4 | Active·Default·Hover·Focus | **Disabled** | ❌ | 7/10 |
| Spec token | 2 | Default·Hover | **Focus·Disabled** | ❌ | 5/10 |
| Status pill | 5 | Live·Draft·Stale·Review·Unpublished (semantic) | — | ❌ | 8/10 |
| Product select card | 3 | Selected·Default·Hover | **Focus** | ❌ | 6/10 |
| Doc card | 3 | Default·Hover·Selected | **Focus** | ❌ | 6/10 |
| Command palette row | 3 | Active·Default·Hover | Focus (≈Active, ok) | ❌ | 7/10 |
| Notification item | 6 | Default·Hover (×Stale/Review/Comment) | Focus (if actionable) | ❌ | 7/10 |
| Table row | 4 | Header·Data·Data hover·Data selected | **state-in-Type**; no Focus | ❌ | 5/10 |
| Safety block | 3 | Warning·Caution·Note (semantic) | — | ❌ | 8/10 |
| Wizard step | 3 | Active·Done·Todo (semantic) | — | ❌ | 8/10 |
| Inspector | 3 | Properties·Comments·History (tabs) | — | ❌ | 8/10 |
| Editor toolbar | 2 | Authoring·Review (modes) | — | ❌ | 8/10 |
| Icons (25) | — | single | — | ❌ | 8/10 |
| Singletons* | — | static | — | ❌ | 7/10 |

\*Avatar, Section subhead, Divider, Skeleton, Metric card, Panel, Field row, Top bar, Local rail, Navigator, Content toolbar — appropriately static layout pieces.

**State patterns worth standardising:**
- **Focus** is present across atoms (good) but absent on Product select card, Doc card, Table row, Spec token, and Notification item. Any element a keyboard user can land on needs a visible focus state — the `border/focus` token already exists (and passes 3:1), so this is wiring, not invention.
- **Disabled** is missing on Tab, Nav rail item, Nav row, and Spec token. Add where the element can be unavailable (tabs and nav items frequently can be).
- **Hover** is missing on Toggle.

---

## Accessibility (WCAG 2.1 AA)

Dark mode is the active theme; ratios below are computed against it. Light mode was also checked and is well-tuned.

**Passing strongly:** `text/primary` 13.3–16.4:1 (AAA on every surface) · primary button text 17.2:1 · all four `status/*` colors as text ≥4.6:1 · `safety/warn-text` 5.2:1 · `border/focus` 5.4:1 (focus rings are clearly visible).

**Two real failures:**

| Issue | Measured | Requirement | Where it bites |
|-------|----------|-------------|----------------|
| `text/tertiary` (#7e7e86) | canvas 4.79 ✅ · surface 4.57 ✅ · **panel 4.48 · raised 4.31 · active 4.22 · inset 3.89** ❌ | 4.5:1 normal text | The prior `ink/300 → ink/250` fix cleared canvas/surface only. Tertiary text (timestamps, meta, helper copy) drops below AA on the four lighter dark surfaces — and panels/insets are exactly where meta text tends to live. |
| `border/default` on inputs (#26262c) | **1.22:1** | 3:1 (non-text, control boundary) | The Text field's *default* outline is nearly invisible (confirmed by screenshot). Focus (blue) and Error (red) states are fine; the resting state under-communicates that it's an input. |

`text/disabled` (≤2.2:1) is **exempt** — WCAG places no contrast minimum on disabled controls. Subtle container/divider borders (`border/subtle`, `border/strong` at ~1.2–1.4:1) are largely acceptable as decorative separators, but anything acting as the sole boundary of an *interactive* control should reach 3:1.

**Recommendations:**
1. Lighten `text/tertiary` one step (e.g. `ink/200` #8a8a90, which holds ≥4.5:1 down to `bg/active` and 4.56:1 on inset), or restrict tertiary text to canvas/surface only by convention.
2. Give form-control resting borders a dedicated, higher-contrast token (≈3:1) so default inputs read as inputs without relying on focus.

---

## Priority Actions

1. **Document the system.** 0 / 54 components and 0 / 98 variables carry a description. Add at minimum a one-line "what / when to use" to every component and a usage note to each semantic color token. This is the single biggest lever on the score and on real-world adoption — undocumented components get re-invented.
2. **Fix `text/tertiary` contrast** so meta text passes AA on panel/raised/active/inset (one token step).
3. **Add a perceivable default border token for form controls** (≈3:1) so resting inputs are visible.
4. **Close the Focus/Disabled state gaps** — Focus on Product select card, Doc card, Table row, Spec token, Notification item; Disabled on Tab, Nav rail item, Nav row, Spec token; Hover on Toggle.
5. **Restructure Table row** to `Type × State` axes (remove state-in-Type).
6. **Tidy the spacing/radius tail** — bind the six `radius/xs` rectangles; snap Shell's off-scale `3 / 6 / 14px` gaps to the scale.

---

## What's Working (keep doing this)

- **Two-tier token architecture** — semantic Color aliases to Primitives; theme by remapping aliases, not editing components.
- **100% color binding** — no hardcoded hex anywhere in 54 components; icons fully themeable via bound strokes.
- **Correct scoping** — `bg/*` → frame/shape fills, `text/*` → text fill, `border/*` → stroke, spacing → GAP, radius → CORNER_RADIUS, size → WIDTH_HEIGHT; primitives hidden from pickers.
- **Coherent foundations** — single type family (Instrument Sans), a clean 9-step ramp, a 3-level elevation system, and dedicated layout-size tokens for the app shell.
- **Light mode is real**, not a placeholder — semantic/status colors intentionally shared across modes, structural colors remapped.
