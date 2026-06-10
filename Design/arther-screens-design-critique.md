# Design Critique: Arther — Screens

**File:** Arther — Screens (`pdMPtD58F3MeLrTzWsoX3E`)
**Date:** 2026-06-08
**Scope:** Whole-file sweep — all 15 pages / ~118 frames. All five dimensions (first impression, usability, visual hierarchy, consistency, accessibility), deep pass.
**Method:** Section- and frame-level screenshots pulled live from Figma; key color/contrast values and component states extracted programmatically from nodes (resolved values, not eyeballed). Report-only — no screens were modified.

**Relationship to prior docs:** This is a *design* critique (quality, composition, usability), distinct from the existing `arther-screens-accessibility-audit.md` (WCAG), `arther-screens-qa-review.md` (IA conformance + rendering defects), and `arther-design-system-audit.md` (DS quality). Findings already fixed in those passes are noted as confirmed-resolved, not re-raised. The contrast/labels remediation from 2026-06-08 was independently re-measured here and **holds**.

---

## Overall impression

This reads as a serious instrument for technical documentation — restrained, editorial, confidently monochrome. The single strongest idea is the **document-as-white-paper** metaphor in the editor: a calm, high-legibility focal point set against dark chrome. It tells you what the product *is* in two seconds.

The set is also unusually complete. Every surface ships empty, loading, error, and edge states (failed generation, blocked-no-products, offline, maintenance, delete-blocked→archive, stale-spec alerts, "all caught up"). This is closer to a production spec than a mockup set, and it's the work's biggest asset.

The biggest opportunity is the flip side of the restraint: the design occasionally tips into **uniform quietness**. Primary actions, secondary/tertiary actions, and the chrome all share a similar low-contrast register, so on several screens the eye isn't decisively pulled to the one thing that matters. The product would gain a lot from a clearer "loudness ladder" on actions and clickable affordances — without abandoning the calm aesthetic.

**2-second test, key screens:**

- **Dashboard** → eye lands on "Good morning, Callum" and the four stat numbers. Correct.
- **Editor** → eye lands on the white paper / document title. Exactly right.
- **Specs** → eye lands on the field/value table. Correct, though the primary action (Create Release) and the tab bar are quiet.
- **Top-bar context cluster** (`Documents ⌄ · Servo A · Datasheet · Spec: Servo A`) → takes a beat. The active-mode control, the current-doc chip, and the cross-link read at similar weight, so "where am I / what's clickable" isn't instant.

---

## Usability

**What's strong:** edge-state coverage; pre-flight checklists before generate / publish / send-for-review (e.g. "7 of 10 sections will generate fully · 3 placeholders") that set expectations and prevent errors; a complete, role-aware review/approval flow (reviewer rail, send-back-with-reason, queue grouped by relationship); a proper guided 5-step Import with a re-import diff.

| Finding | Severity | Recommendation |
|---|---|---|
| Two overlapping "type-to-act" entry points — ⌘K command palette and ⌘J Ask Arther — present similarly (both invoked from the top bar, both search-like). Users may not form a clear model of which to reach for. | 🟡 Moderate | Differentiate them perceptually and by entry affordance: palette = "navigate / run" (compact list, transient), assistant = "converse / act" (panel, persistent). Label the triggers. The ⌘K/⌘J split is already decided — the risk is perceptual, not architectural. |
| Quiet interactive affordances. Many actions are low-contrast ghost text ("Change", "Edit", "Override", "View", "Show resolved", "Edit source", Import / Export). They pass text-contrast but don't *look* actionable — no border, underline, or depicted hover. Clickability is carried by position alone. | 🟡 Moderate | Give secondary/tertiary actions one consistent affordance (hover fill, subtle border, or underline-on-hover). Highest-leverage usability fix in the set. |
| Top-bar context cluster reads as same-weight chips, blurring "current mode" vs "current document" vs "cross-link." | 🟢 Minor | Render the passive breadcrumb as plain text and reserve the chip/affordance for the one interactive mode control. |
| Dashboard stat cards ("7 Stale documents" etc.) don't signal whether they filter the queue. | 🟢 Minor | If they're actionable, show it (hover/cursor/ý focus); if not, don't style them like tiles. |

---

## Visual hierarchy

- **What draws the eye first** is generally correct (titles, the paper, the big dashboard numbers).
- **Reading flow** is clean and consistent: top bar → icon rail → content → inspector, left-to-right, with well-sectioned content under uniform small-caps labels.
- **Emphasis** is where the monochrome palette is working hardest. Hierarchy rests almost entirely on size, weight, and ~2 gray steps. It mostly holds, but two things soften it:
  - Primary CTAs (light-on-dark) don't sit clearly *above* the quiet ghost actions in a primary→secondary→tertiary ladder on every screen, so the loudest element isn't always the most important one.
  - The small-caps muted micro-labels (SPEC REFERENCES, DEGRADATION, WORKSPACE, COMING SOON) carry a lot of structural load at 11–13px / `#8A8A90`. Legible (measured 4.76:1), but doing heavy lifting at low salience.
- **Bright spot:** the inspector's semantic dots (green = current, amber = stale) are exactly the right use of selective color — high signal in an otherwise gray field.

**Recommendation:** define an explicit action-emphasis ladder (exactly one clearly-loudest primary per screen) and let primary CTAs carry a touch more weight/contrast than the surrounding chrome.

---

## Consistency

Overall this is clearly one system: top bar, rail, inspector, tables, pills, status colors, and empty/loading patterns are uniform across all 15 pages. The semantic color language is coherent — **green** = live / current / success, **amber** = stale / warning / changed, **red** = error / removed — and the customer-brand **blue** (#2F6FED) is correctly quarantined to the Portal and Brand Profiles.

| Element | Issue | Recommendation |
|---|---|---|
| Buttons on the **App Shells** reference page | 8/8 buttons show the DS Button's default **leading "+" icon** — including "Back", "Cancel", "Publish", "View portal", "Save changes", where a plus is semantically wrong. The shipped per-surface pages hide it correctly (Settings 0/8, New Document 0/25). The canonical "shell reference" page has drifted from the real pattern. | Hide the leading icon on those 8 buttons, or refresh/retire the App Shells page so the reference matches production. (Verified programmatically — net-new; not in prior passes.) |
| Two link blues | App-internal links resolve to `text/link` #1A66C9 (on paper); the customer Portal uses #2F6FED. Intentional and correctly separated. | Add a one-line system note so the two are never merged. 🟢 |
| Already resolved (confirmed) | Typed glyphs → DS icons, portal lock glyph, Field-row 1px height, light-paper contrast, placeholder-as-label — all fixed in the 06-06 QA pass / 06-08 a11y remediation; DS republished 06-08. | No action — acknowledged so they aren't re-raised. |

---

## Accessibility (measured, not eyeballed)

The dark surfaces are in good shape and the previously-flagged light-surface problems are **fixed and confirmed**:

- **Dark text:** primary `#ECECEE` ≈ 14:1; tertiary `#8A8A90` ≈ 4.76:1. Pass.
- **Editor light paper (was the critical item):** body `#1B1B1E` on `#FFFFFF` ≈ **17:1**; secondary `#55554E` ≈ **6:1**; inline links `#1A66C9` ≈ **4.9:1**. All pass — independently re-measured here; the 06-08 "set paper to Light mode + `text/link` token" fix holds.
- **Forms:** Auth fields now carry persistent visible labels (confirmed on Log in) — no longer placeholder-as-label.

Remaining items are **implementation specs, not design defects** (the DS already defines the focus ring and ≥24px hit areas): wire `:focus-visible`, supply ARIA name/role/value for icon-only controls and dialogs, define keyboard order for the palette / slash menu / spec-token picker, and republish the DS once more so the top-bar hit-area fix reaches this file. One design-side caution: a few pairs sit right on 4.5:1 (portal search placeholder 4.51, portal CTA 4.55) — treat as fragile and nudge one step. See `arther-screens-accessibility-audit.md` for the full handoff.

---

## What works well

- **The document-as-paper editor** — calm, legible, instantly understood; the anchor of the whole product.
- **State completeness** — empty / loading / error / edge across every surface. Production-grade and rare.
- **Pre-flight checklists and the stale-spec → review propagation model** — genuinely thoughtful product thinking, not just screens.
- **A disciplined monochrome system** with restrained, *semantic* use of color (green/amber/red status, quarantined brand blue).
- **The light Public Portal** as a deliberate, well-foreshadowed exception — the Brand Profiles live-preview sets it up before you ever see it.

---

## Priority recommendations

1. **Strengthen the action / affordance ladder.** Make the primary CTA the unambiguous loudest element on each screen, and give secondary/tertiary actions a consistent visible affordance (hover fill / border / underline). One change that improves first impression ("where do I click?"), usability, and hierarchy simultaneously — the highest-leverage move in the set.
2. **Differentiate the ⌘K palette from the ⌘J assistant** perceptually (compact transient list vs persistent conversational panel) so users build the right mental model of two similar-looking entry points.
3. **Reconcile the App Shells reference page** with production — hide the stray leading "+" on its 8 buttons (or refresh the page). Small fix, but it's the canonical reference, so the drift propagates confusion.
4. **Close the code-level a11y handoff** already specced in the accessibility audit (focus-visible, ARIA, keyboard order, one more DS republish). Design side is done; this is implementation.
