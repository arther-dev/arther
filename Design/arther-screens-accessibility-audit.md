# Accessibility Audit: Arther — Screens

**Standard:** WCAG 2.1 AA (with WCAG 2.2 target-size notes) | **Date:** 2026-06-08
**File:** Arther — Screens (`pdMPtD58F3MeLrTzWsoX3E`)
**Method:** Representative pass. Colors, type sizes, and element dimensions were extracted programmatically from the Figma nodes (resolved variable values, not eyeballed), and contrast ratios computed in-file. No screens were modified (report-only).

**Screens sampled:** Dashboard · Overview, Editor · Edit (block selected), Specs · Spec Fields — Detail, Auth · Log in, New Doc · Configure, Dashboard · Review modal, Cross · Command palette, Public Portal · Homepage / Gated access / Document (mobile), Error · 404. Findings tied to design-system tokens or shared components apply file-wide.

---

## Summary

**Issues found:** 11 | **Critical:** 2 | **Major:** 7 | **Minor:** 2

The dark app surfaces are in good shape on text contrast — `text/primary`, `text/secondary`, and `text/tertiary` all clear AA against every dark panel they sit on (the QA pass that re-pointed tertiary already holds). The light Public Portal also passes, though several pairs sit right on the 4.5:1 line.

Two systemic problems dominate. First, the **Editor's light "paper" canvas reuses dark-tuned tokens** for secondary text and links, so they fail badly on a light background (2.5–3.4:1). Second, **forms label fields with placeholder text only** — there are no persistent, programmatic labels. Beyond those, the static designs don't yet depict **focus indicators**, several **tap targets** are below minimum size, and the usual **name/role/value** handoff details (icon-button names, dialog/tab roles) need to be specified for engineering.

---

## Remediation applied (2026-06-08)

The two critical findings (P1/P2 contrast, U1 labels), plus the link "use of color" (P3) and a newly-discovered invisible-CTA bug, have been fixed in-file. Root cause for the contrast issues was a light surface (the editor "paper", and stale/warn banners) rendering with the Dark mode of the Color collection, so dark-tuned text tokens sat on light backgrounds. The fix uses the DS's existing Light mode rather than new per-node values.

| Area | What changed | Result |
|------|--------------|--------|
| DS token | Added `text/link` to the Color collection — Dark `#378ADD`, Light `#1A66C9`, scoped `TEXT_FILL`. | Gives links a real semantic token with an AA-safe value on paper (4.9:1). **Needs a DS republish.** |
| Editor paper (P1) | 26 "Document canvas" containers across 3 pages (Documents·Editor, Editor — Deep, App Shells) set to **Light mode**. | `text/secondary` 2.47→6.64:1, 2.67→7.51:1; `text/primary` 13.3→17:1. All paper body/label text now AA. |
| Spec-token chips | 43 inline `bg/inset` chips re-pinned to **Dark mode** within the now-light canvases. | The dark "36 V / 8.5 A" token pills keep their emphasis on the light paper (no visual regression). |
| Inline links (P2/P3) | 18 on-paper links underlined **and** rebound to `text/link`. | Underlined (1.4.1) and now `#1A66C9` on paper = **4.9:1** (5.5:1 on white) — AA pass. |
| Stale/warn banners | 2 light warn banners (Editor stale alert, Snippets stale-at-source) set to **Light mode**. | Fixed `text/primary` CTA labels that were `#ECECEE` on `#FBEEEA` = **1.04:1 (invisible)** → now ~16:1. Newly found during verification. |
| Forms (U1) | 13 fields across all 6 Auth forms (Login, Sign up, Create workspace, Accept invite, Forgot, Reset) given persistent visible labels bound to `text/secondary`; placeholders changed to examples. | Fields no longer rely on placeholder-as-label (3.3.2 / 1.3.1). New Document and Settings already used labeled rows — no change needed. |
| Focus states (O1) | Verified — all 8 interactive component sets (Button, Text field, Tab, Toggle, Icon button, Nav rail item, Nav row, Spec token) already carry a **Focus** variant with a 2px `border/focus` ring. | Non-text contrast confirmed AA: `border/focus` (#378ADD) = 5.4:1 on dark, 3.2:1 on paper (≥3:1). No DS change needed; the static screens just don't instantiate the focus variant (normal). Engineering wires `:focus-visible` to it. |
| Tap targets (O2) | Top bar `search` / `bell` / `help` (raw 20px icons) wrapped in **34×34 centered hit areas**; cluster gap tightened so glyph spacing is unchanged. | Meets WCAG 2.2 AA (24px min) and matches the 34px Icon button atom. Avatar (30), Icon button (34), spec-token chips (24), buttons/tabs (36) already passed 24px. **Needs a DS republish** to reach the Screens file. |

**Verified:** after the DS republish and link rebind (2026-06-08), a full re-scan of all paper-bearing pages shows **zero** remaining light-surface text failures — links included (`text/link` resolves to `#1A66C9`, 4.9:1 on paper / 5.5:1 on white).

**Status:** P1, P2, P3, U1 closed. **O1 (focus)** is satisfied at the DS level — every interactive component already has an AA focus ring; the work left is wiring `:focus-visible` in code. **O2 (target size)** fixed for the top-bar utility icons (now 34px); other controls already met the 24px AA bar. The remaining work is **code-level only** — see below. Two DS changes (the `text/link` token rebind, already done; and the top-bar hit areas) mean the DS should be **republished** once more so the hit-area fix reaches the Screens file.

### Code-level follow-ups (for engineering)

These can't be resolved in static Figma — left here as notes for implementation (R1, R2, U2 and the code side of O1/O2):

- **Focus (2.4.7):** apply `:focus-visible` to all interactive elements, styled from the `border/focus` token (the DS Focus variants are the visual spec). Ensure the top-bar icon hit areas and custom controls are reachable and show the ring.
- **Name/role/value (4.1.2):** icon-only controls (search, bell, help, avatar, close, chevron triggers) need `aria-label`s; tabs → `role="tablist"/"tab"` + `aria-selected`; toggles → `role="switch"` + `aria-checked`; dialogs/overlays (Review modal, Publish, Delete-blocked, Command palette, Notifications) → `role="dialog"` + `aria-modal` + `aria-labelledby`, focus trap, Esc to close, and focus restored to the trigger.
- **Info & relationships (1.3.1):** programmatic `<label for>` ↔ input association (visual labels now exist), one logical heading order per page, and `scope` headers on the Spec table.
- **Error identification (3.3.1):** in-line error text tied to fields via `aria-describedby`; never signal errors by color alone.
- **Keyboard / focus order (2.1.1, 2.4.3):** roving focus + Esc for the command palette, slash menu, and spec-token picker; logical tab order through forms and toolbars.
- **Target size (2.5.8):** the DS now provides ≥24px hit areas; keep that floor for any new icon-only controls in code.

---

## Findings

### Perceivable

| # | Issue | WCAG | Severity | Recommendation |
|---|-------|------|----------|----------------|
| P1 | Editor secondary/label text on the light paper canvas uses `text/secondary` (#9A9AA2), a token tuned for dark backgrounds. On paper (#F2F1EC) it measures **2.47:1**; on inline light cards (#FAFAF8) **2.67:1**. Affects field labels ("PARAMETER", "Applications & use cases"), brief body text, and snippet captions. | 1.4.3 Contrast (Minimum) | 🔴 Critical | Introduce light-surface text tokens (`text/on-paper` already exists at #1B1B1E for primary; add `text/on-paper-secondary` ≈ #5A5A62, which gives **6.0:1** on paper) and rebind all secondary/label text on paper. Don't reuse dark-mode `text/secondary` on light surfaces. |
| P2 | Inline links/actions on the paper canvas use `status/review` blue (#378ADD): **3.18:1** on #F2F1EC, **3.44:1** on #FAFAF8 ("Go to Product Brief →", "Edit source →"). Needs 4.5:1 for 13–14px text. | 1.4.3 Contrast (Minimum) | 🟡 Major | Add a darker link token for light surfaces — **#1A66C9 reaches 4.9:1** on paper. Don't go lighter: #1F6FD6 only hits 4.3:1 and still fails. The current blue is fine on dark panels, so scope this to a light-surface link token. |
| P3 | Those inline links are signalled by **color alone** (blue, no underline) inside body prose on paper. Users who can't perceive the hue can't tell text from link. | 1.4.1 Use of Color | 🟡 Major | Underline inline text links (or otherwise mark them non-chromatically). Standalone buttons/CTAs are exempt; this applies to links embedded in running text. |
| P4 | Several pairs **pass but with <0.15 headroom**: `text/tertiary` #8A8A90 on the darkest card #232328 = 4.56:1; portal search placeholder #6B7280 on #F6F7F9 = 4.51:1; portal link #2F6FED on #FFFFFF = 4.55:1; portal button text #FFF on #2F6FED = 4.55:1. | 1.4.3 Contrast (Minimum) | 🟢 Minor | Treat as fragile. Nudge each darker by one step so anti-aliasing, future palette tweaks, or sub-pixel rendering can't drop them below AA. |

### Operable

| # | Issue | WCAG | Severity | Recommendation |
|---|-------|------|----------|----------------|
| O1 | **No visible focus indicator is depicted** on any interactive element across the sampled screens. The DS defines a `border/focus` token but it isn't applied to any default/focus state in the file, so there's nothing for engineering to build against. | 2.4.7 Focus Visible | 🟡 Major | Add a focus-state spec to interactive components (buttons, inputs, tabs, nav rows/rail, chips, menu items): a 2px ring using `border/focus`, with ≥3:1 contrast against both the component and its background. Show at least one focused example per control. |
| O2 | **Undersized tap targets.** Icon-only controls and chips are well under 44×44: top-bar search/bell/help **20×20**, dropdown chevrons **12–18**, account Avatar **30×30**, spec-token chips **24** tall. Primary controls — Button **36**, Tab **36**, Nav row **40**, Text field **40** — are also under 44. Several icon controls are even under the WCAG 2.2 AA floor of 24×24. | 2.5.5 Target Size (AAA) / 2.5.8 Target Size Minimum (WCAG 2.2 AA) | 🟡 Major | At minimum (2.2 AA): ensure every control has a ≥24×24 hit area — wrap the 12–22px icons in padded hit targets. Recommended (2.5.5 / touch): expand to 44×44, especially the top-bar utilities and avatar. Note: 44px is AAA in 2.1; 24px is the AA bar in 2.2. |
| O3 | **Keyboard operability and focus order** can't be verified from static frames, but several patterns are high-risk: Command palette, Slash menu, and Spec-token picker (arrow-key navigation + Esc), and the modal/slide-over surfaces (Review modal, Publish dialog, Delete-blocked, Notifications). | 2.1.1 Keyboard · 2.4.3 Focus Order | 🟢 Minor | Document keyboard behaviour in handoff: popovers/listboxes get ↑/↓ + Enter + Esc; dialogs trap focus, close on Esc, and restore focus to the trigger on close. |

### Understandable

| # | Issue | WCAG | Severity | Recommendation |
|---|-------|------|----------|----------------|
| U1 | **Forms label fields with placeholder text only.** On Auth · Log in, the "Email" and "Password" strings are placeholder nodes inside the field; the Text field component has no `Label` property and there is no persistent label above the input. Placeholders vanish on input and aren't reliably exposed to assistive tech. | 3.3.2 Labels or Instructions · 1.3.1 | 🔴 Critical | Add persistent visible labels above every field (extend the Text field component with a label slot, or place a label text node). Keep placeholders for examples only, never as the sole label. Audit New Document, Settings, Portal, and Reset-password forms for the same pattern. |
| U2 | **Error identification** must not depend on color. The warn text token contrast is fine (`safety/warn-text` #B23B22 on #FBEEEA = 5.23:1), but states like New Doc · Generation failed and an invalid-login error need a text description tied to the field, not just a red treatment. | 3.3.1 Error Identification | 🟡 Major | For each error state, show in-line error text adjacent to the field and associate it programmatically (aria-describedby). Pair color with an icon/text cue. |

### Robust

| # | Issue | WCAG | Severity | Recommendation |
|---|-------|------|----------|----------------|
| R1 | **Name / role / value** needs specifying for non-text controls. Icon-only buttons (search, bell, help, chevron, avatar, close) have no visible text name; tabs, the nav rail, and toggles carry an Active/Inactive variant but no exposed role/selected/checked state; overlays (Command palette, Review modal, Publish, Notifications) need dialog semantics. | 4.1.2 Name, Role, Value | 🟡 Major | In handoff: every icon-only control gets an accessible name (aria-label); tabs use tablist/tab + aria-selected; toggles expose checked/pressed; dialogs use role="dialog" + aria-modal + aria-labelledby pointing at the title. |
| R2 | **Info & relationships** — programmatic structure behind the visuals. Field↔label association (see U1), heading hierarchy on document/portal pages, and list/table semantics for the Spec table and nav lists. | 1.3.1 Info and Relationships | 🟡 Major | Specify semantic structure in handoff: real label/for associations, a single logical heading order per page, and table headers (scope) for the Spec table. |

---

## Color contrast check

Measured from resolved node values. Threshold: 4.5:1 normal text, 3:1 large text (≥24px, or ≥18.66px bold) and non-text/UI.

| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Editor — secondary/label text on paper | #9A9AA2 `text/secondary` | #F2F1EC paper | 2.47:1 | 4.5:1 | ❌ |
| Editor — secondary text on inline card | #9A9AA2 `text/secondary` | #FAFAF8 | 2.67:1 | 4.5:1 | ❌ |
| Editor — inline link on paper | #378ADD `status/review` | #F2F1EC paper | 3.18:1 | 4.5:1 | ❌ |
| Editor — inline link on card | #378ADD `status/review` | #FAFAF8 | 3.44:1 | 4.5:1 | ❌ |
| App — primary text | #ECECEE `text/primary` | #0E0E10 / #141416 | 15.6–16.4:1 | 4.5:1 | ✅ |
| App — secondary text (dark) | #9A9AA2 `text/secondary` | #141416 panel | 6.59:1 | 4.5:1 | ✅ |
| App — tertiary text (dark) | #8A8A90 `text/tertiary` | #232328 card | 4.56:1 | 4.5:1 | ⚠️ pass (thin) |
| App — input border | #6E6E76 `border/input` | #16161A | 3.57:1 | 3:1 | ✅ |
| App — status live / stale | #5E9E78 / #B9892F | #0E0E10 | 6.1 / 6.14:1 | 4.5:1 | ✅ |
| App — warn text | #B23B22 `safety/warn-text` | #FBEEEA | 5.23:1 | 4.5:1 | ✅ |
| Portal — body text | #4A5564 | #FFFFFF | 7.57:1 | 4.5:1 | ✅ |
| Portal — search placeholder | #6B7280 | #F6F7F9 | 4.51:1 | 4.5:1 | ⚠️ pass (thin) |
| Portal — accent link | #2F6FED | #FFFFFF | 4.55:1 | 4.5:1 | ⚠️ pass (thin) |
| Portal — primary button text | #FFFFFF | #2F6FED | 4.55:1 | 4.5:1 | ⚠️ pass (thin) |
| Error pages — primary / secondary | #ECECEE / #9A9AA2 | #0E0E10 | 16.4 / 6.9:1 | 4.5:1 | ✅ |

## Touch / target sizes

WCAG 2.2 AA (2.5.8) minimum is 24×24; 44×44 is the 2.5.5 AAA / touch-platform guideline.

| Control | Size (min observed) | vs 24px (2.2 AA) | vs 44px (2.5.5) |
|---------|--------------------|------------------|-----------------|
| Dropdown chevron (icon) | 12–18 | ❌ | ❌ |
| Inline check icon | 14–22 | ⚠️/❌ | ❌ |
| Top-bar utility icons (search/bell/help) | 20×20 | ❌ | ❌ |
| Section/list icons | 22×22 | ❌ | ❌ |
| Spec-token chip | 24 tall | ✅ (exactly) | ❌ |
| Account avatar | 30×30 | ✅ | ❌ |
| Button / Tab | 36 tall | ✅ | ❌ |
| Nav row / Text field | 40 tall | ✅ | ❌ |
| Nav rail item | 44 tall | ✅ | ✅ |
| Field row (Specs) | 48 tall | ✅ | ✅ |

*Icon sizes are the glyph dimensions. Where an icon is placed directly in a toolbar with no padded wrapper, the glyph size is effectively the hit area — confirm and expand to ≥24px.*

## Keyboard navigation (to specify in handoff)

| Surface | Tab/focus order | Enter/Space | Escape | Arrow keys |
|---------|-----------------|-------------|--------|------------|
| Command palette | Trap inside; first result focused | Activate result | Close, restore focus | ↑/↓ through results |
| Slash menu / Spec-token picker | Trap inside popover | Insert selection | Close, return to caret | ↑/↓ (and groups) |
| Review modal / Publish / Delete-blocked | Trap inside dialog | Activate default action | Close, restore focus to trigger | n/a |
| Notifications slide-over | Trap while open | Activate item | Close, restore focus | ↑/↓ list |
| Tabs (Spec / Editor / Dashboard) | Tab to active tab only | Activate | n/a | ←/→ between tabs |

## Screen reader (to specify in handoff)

| Element | Should announce as | Current risk |
|---------|--------------------|--------------|
| Email / Password fields | "Email, edit text" / "Password, secure edit text" | Placeholder-only → may announce nothing or lose name on input (U1) |
| Icon-only buttons (search, bell, help, close, avatar) | Their action name + "button" | No visible text; needs aria-label (R1) |
| Tabs | "<name>, tab, selected, n of m" | Variant carries state visually only (R1) |
| Modals / palette | "<title>, dialog" + focus moved in | Needs dialog role + labelledby (R1) |
| Status pills (Live/Stale) | Text label read | OK — text present, not color-only |

---

## Priority fixes

1. **Add light-surface text + link tokens and rebind the Editor (P1, P2, P3).** This is the only place text actually fails AA, and it fails hard (2.5–3.4:1). Add `text/on-paper-secondary` and a darker on-light link color, rebind paper/inline-card secondary text and links, and underline inline links. Highest-impact, smallest blast radius.
2. **Give forms persistent, programmatic labels (U1).** Placeholder-as-label blocks screen-reader and low-vision users on the very first screen (login). Extend the Text field component with a label slot and roll it across all forms.
3. **Define focus states (O1).** Apply the existing `border/focus` token as a visible ≥3:1 ring across interactive components, with at least one focused example per control. Keyboard users currently have nothing to track.
4. **Fix target sizes (O2).** Wrap the 12–22px icon controls in ≥24px hit areas (2.2 AA), and ideally take top-bar utilities and the avatar to 44px.
5. **Specify name/role/value + error identification in handoff (R1, R2, U2).** Icon-button labels, tab/dialog roles, field↔label associations, and in-line error text — the robustness layer that static frames can't show but engineering needs.
6. **Nudge the near-threshold pairs (P4).** Cheap insurance: text/tertiary on the darkest card and the three portal pairs sitting at 4.51–4.56:1.

---

## Notes & limitations

- Contrast was computed from resolved fills with alpha compositing over the real ancestor background, so ratios reflect what renders, not raw swatches.
- This is a representative sample, not every frame. The dark app screens share DS tokens, so contrast findings generalize; loading, empty, and duplicate-pattern states were not separately measured.
- Static designs can't establish keyboard operability, focus order, or assistive-tech output — those items (O3, R1, R2, U2) are flagged as specification requirements for engineering rather than confirmed defects.
- Inputs: dark-app Text field border passes non-text contrast (3.57:1); portal inputs render without a visible border in the sample — confirm they have a ≥3:1 boundary or rely on a labelled, filled background.
