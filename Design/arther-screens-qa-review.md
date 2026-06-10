# Design Review (QA Pass): Arther — Full Screen Set

**Reviewed against:** the per-screen IA suite (`Design/IA/Feature IA/*`) + the app-wide IA (`Design/IA/arther-app-ia.md`) + project rules (DS-linked / no hardcoded values, dark mode, the App Shell chrome model, the `#1E1E1E` page / `#34343A` section rule).
**Figma file:** `pdMPtD58F3MeLrTzWsoX3E` (Arther — New Screens)
**Scope:** 11 surfaces · ~67 frames across 11 pages.
**Date:** 6 June 2026

---

## Screenshots Captured (live from Figma)

These were captured directly from the Figma file (section-level), not saved as PNGs — open each by node-id.

| Surface | Page / section node | Frames |
|---|---|---|
| Specs | `233:1798` · `233:1799` · `233:1800` | 14 (Detail / History / Comments / Override / Table editor / Brief / Variants / Coverage / Component Library / Releases / Variant editor / Import / Empty / Loading) |
| New Document | `245:1087` | 6 (Configure ±placeholders / Generating / Failed / Review&generate / Blocked) |
| Dashboard | `258:1111` | 6 (Overview / Review modal / First-run / All caught up / Activity / Loading) |
| Reviews | `269:1343` | 6 (Queue / Review surface / Send for review / Send back / Empty / Loading) |
| Import | `280:1097` | 6 (Upload / Structural / Field-level / Validation / Re-import diff / Committed) |
| Portal (mgmt) | `290:1163` | 6 (Published / Domains / Access&Leads / Analytics / Empty / Loading) |
| Settings | `303:1183` | 6 (Workspace / Members / Document Types / Brand Profiles / Domain Ownership / Coming soon) |
| Snippets | `313:1165` | 6 (Library / Templates / Item editor / Stale-prose / Empty / Loading) |
| Cross-cutting | `321:1307` | 5 (Ask Arther / Command palette / Notifications / Spotlight / Connectivity) |
| Public Portal (visitor) | `325:911` | 6 (Homepage / Product / Document / Document mobile / Gated / Search) |

---

## Summary

The set is in strong shape: the chrome (top bar, local rail, 5-region shell), the dark palette, the section scaffolding, and the empty/loading state coverage are consistent across all ten dark app surfaces, and the light Public Portal is a clean, intentional exception that the Brand Profiles preview already foreshadows. The headline finding is **process, not pixels**: the Design System still needs a **republish** so the Field-row fix propagates — until then a few non-overridden field rows risk collapsing. The only true rendering defect is the **lock glyph in the portal gate** (an emoji that doesn't load in Instrument Sans). The most material polish theme is the reliance on **typed glyph characters** (✓ ● ○ ⌕ ≡ ▾) instead of DS icon instances, and one **contrast** issue with the light-grey "hint" text in the portal.

---

## Must Fix

1. **Republish the Design System.** The Field-row fix (DS component `21:38`: `counterAxisSizingMode` FIXED-h1 → AUTO) is committed in the DS file (`GESXbRrqd3dYh8XkFBLpeC`) but **not yet published**, so the screens file still consumes the old definition. The Specs detail rows look correct only because they were overridden per-instance to height 48; any non-overridden Field-row instance (e.g. the legacy app-shell Specs frame `6:2`) will render as a 1px sliver until publish. _Fix: publish the DS, then accept the update in the screens file and remove the per-instance height overrides so rows hug naturally._

2. **Portal gate lock icon doesn't render** (Public Portal · Gated access `324:952`). The 🔒 emoji used for the gate badge is not in the Instrument Sans glyph set, so the badge shows empty. _Fix: replace with a vector lock icon (the DS icon set has `lock`) or a simple SVG — don't rely on an emoji glyph._

---

## Should Fix

3. **Swap typed glyphs for DS icon instances.** Several surfaces use literal text characters where an icon belongs: checklist/status marks (`✓ ● ○ !`) in New Document (`239:911`, `239:1039`) and Dashboard (`250:1009`), the stepper marks in Import (`271:912`+), and the mobile portal's `⌕`/`≡`/`▾` (`324:911`). Most render, but their weight and baseline don't match the DS icons, and emoji-class glyphs are a rendering risk (see #2). _Fix: use DS icon instances where one exists (`check`, `chevron-down`, `search`, `menu`, `alert`); keep typed glyphs only where no DS icon covers it, and standardize their size/color tokens._

4. **Portal "hint" grey fails AA on white.** The light-portal hint color `#8A93A0` on `#FFFFFF` is **3.03:1** — below WCAG AA (4.5:1) for normal text. It's used on small captions: product doc-counts, dates, breadcrumb tails, and the search placeholder (Homepage `322:914`, Product `323:912`, Document `323:977`, Search `324:964`). _Fix: darken hint to ~`#6B7280` (≈4.9:1) for any text under ~18px; reserve `#8A93A0` for large/decorative use only. (The `#4A5564` sub-grey at 7.5:1 and the `#2F6FED` accent at 4.53:1 both pass — no change needed there.)_

5. **Verify dark-app secondary/tertiary text tokens hit AA per panel.** The dark surfaces layer three greys (primary/secondary/tertiary) over `#1E1E1E`, panel, and inset backgrounds. Several captions (timestamps, "used in" notes, metadata rows) sit at the tertiary level. _Fix: confirm each DS dark text token meets 4.5:1 against the specific panel/inset bg it renders on (not just against the page); bump tertiary if any combination falls short._

6. **Mobile coverage is Document-only.** The IA scopes the *whole* portal as mobile-facing, but only the Document page has a 390px frame (`324:911`). The Gated access flow in particular reads very differently full-screen on a phone. _Fix: add at least a mobile Homepage and a mobile Gated-access frame so the responsive story is reviewable end-to-end._

---

## Could Improve

7. **Light "paper" inside dark modals.** The Dashboard review/diff modal (`250:911`) and the Reviews surface canvas (`260:944`) embed a light document panel inside the dark app. This is intentional (document content is light paper, consistent with the Editor), but the brightness jump is sharp — consider a subtle inset border or a slightly toned-down paper white inside overlays to ease the transition.

8. **Document the two accent systems.** The app is monochrome; the Public Portal is branded blue (`#2F6FED`). That's by design — note it in the handoff so no one "corrects" the portal to monochrome, and so devs know the portal consumes the customer Brand Profile, **not** the app DS.

9. **Empty-state CTA parity.** Empties vary between one and two CTAs (e.g., Specs Empty offers Import + template; Reviews Empty offers one). Fine as-is, but a consistent "primary + secondary" pattern would tighten the family.

10. **First-run vs. All-caught-up overlap.** Dashboard has both a first-run checklist (`250:1009`) and an all-caught-up empty (`250:1107`). Confirm the trigger logic is distinct in the IA so they never both qualify.

---

## What Works Well

- **Chrome consistency is excellent.** The top bar (logo · module · tabs · search·bell·help·avatar) and the local rail are pixel-consistent across all ten dark surfaces — the App Shell IA is clearly holding.
- **State coverage is unusually complete.** Nearly every surface ships empty + loading (+ error, for New Document), which most design sets skip.
- **The light Public Portal is a confident, correct exception** — and the Settings → Brand Profiles preview already primes the viewer for it, so it doesn't feel out of nowhere.
- **Full-canvas flows correctly shed chrome** (Import, Variant editor, Snippet editor hide the rail/inspector), and the module/active-tab context is set right on each (Import→Specs, New Document→Documents).
- **The Inspector tab pattern** (Properties/Comments/History) is reused via a real variant prop rather than re-drawn — good component discipline.
- **IA fidelity is high:** each surface's regions, states, and naming track its per-screen IA doc.

---

---

## Resolution Log — 6 June 2026

All ten findings were actioned in the same session. Status below.

**Must fix**
1. **DS republish** — ✅ *Prepared, pending your publish.* The Field-row fix is confirmed in the DS (component `21:38`, AUTO / 48px). Bundled with the tertiary-text fix (#5) so a **single republish** ships both. → **Action for Callum: publish the Arther DS library, then accept the update in the screens file.**
2. **Gate lock icon** — ✅ *Fixed.* The 🔒 emoji is replaced with a drawn vector lock (Gated access desktop `324:952` + new mobile `338:945`).

**Should fix**
3. **Typed glyphs → icons** — ✅ *Fixed.* Portal: ⌕ ≡ ▾ + ⌫ → drawn vectors (search/menu/chevron/plus/x). App (New Document, Dashboard, Import): 61 status marks swapped — ✓ → DS `Icon/check`, ▾ → `Icon/chevron-down`, + → `Icon/plus`, ● → filled ellipse, ○ → ring ellipse, ! → alert triangle — each preserving its original fill/binding.
4. **Portal hint grey** — ✅ *Fixed.* `#8A93A0` → `#6B7280` (≈4.9:1 on white) on 36 small captions across the 6 portal frames.
5. **Dark-app text contrast** — ✅ *Fixed in DS (ships with republish).* Computed all tiers: `text/secondary` passes AA on every dark bg (4.56–5.6:1); `text/tertiary` (#6E6E76) **failed** (3.1–3.8:1) → re-pointed to `ink/250` (#7E7E86), AA on the primary content surfaces (canvas/surface/panel). Usage rule: tertiary small-text avoids the `inset`/`raised` bgs (use secondary there).
6. **Mobile coverage** — ✅ *Fixed.* Added **Homepage (mobile)** `338:911` and **Gated access (mobile)** `338:945` (390px), so the portal's responsive story spans grid → document → gate.

**Could improve**
7. **Light-paper-in-dark-modal** — ✅ *Addressed (with a correction).* The **Reviews** surface canvas (`260:944`) was toned to `#FAFAF8` + a subtle border. The **Dashboard review modal** (`250:911`) turned out to be **fully dark already** — my original thumbnail-scale read was wrong; no change needed.
8. **Two accent systems** — ✅ *Documented.* Added a handoff note to `arther-public-portal-ia.md` §10 + an on-canvas annotation (`342:911`) above the Public Portal section.
9. **Empty-state CTA parity** — ✅ *Fixed.* Standardized to filled **primary + secondary/ghost**: normalized the second CTA on Specs/New-Doc/Snippets empties to Secondary; softened Dashboard "all caught up" to a single Ghost; added a ghost secondary to Reviews ("View all documents") and Portal ("Manage domains") empties.
10. **First-run vs all-caught-up** — ✅ *Documented.* Added an explicit, ordered **state-precedence** rule to `arther-dashboard-ia.md` §8 (first-run → has-items → all-caught-up; mutually exclusive, so the two can never co-qualify).

**Net:** 9 of 10 fully resolved in-file; #1 is the one remaining manual step (DS publish), which also delivers #5.

---

*QA pass run as a Figma-adapted design review (screenshots captured live from the file rather than a running app). Findings are prioritized Must / Should / Could. The single highest-leverage action is the DS republish (#1); the only hard defect was the gate icon (#2). Resolution log added 6 June 2026.*
