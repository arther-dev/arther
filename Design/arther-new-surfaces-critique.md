# Design Critique: Arther — Net-New Surfaces + Prior-Fix Verification

**Date:** 9 June 2026
**Files:** Arther — New Screens (`pdMPtD58F3MeLrTzWsoX3E`) · Arther — Design System (`GESXbRrqd3dYh8XkFBLpeC`)
**Scope (per Callum):** the three net-new surfaces built 06-08 (Auth & Account · Editor — Deep · System & Errors, 27 frames) + the Prototype page, plus verification that the 06-06 QA, 06-08 DS-audit, and 06-08 a11y-audit fixes actually landed post-republish.
**Method:** live Plugin-API reads (token resolution with effective-background compositing, 497 paper texts checked on Editor — Deep alone; instance/variant sweeps across Specs, Settings, Portal, Cross-cutting, Dashboard) + frame-by-frame screenshot review of all 27 new frames, critiqued against `arther-auth-account-ia.md`, `arther-block-editing-ia.md`, `arther-system-error-ia.md`.

---

## Overall Impression

The three new surfaces are high-fidelity realizations of their IA docs — the slash menu ships all 20 block types correctly categorized, the delete-blocked → archive dialog is the matrix philosophy made visible, and the auth flow is conventional in the right way. The headline problems are one genuine rendering defect (the snippet-embedded Warning block is illegible — dark-on-dark), one process surprise (the **Prototype — App Tour page no longer exists in the file**), and a cluster of inherited-clone artifacts on Editor — Deep (wrong outline content, clipped Inspector tabs) that a single corrected base frame would have prevented.

**Issue counts: 2 Critical · 9 Moderate · 10 Minor.** Prior-fix verification: **all republish-gated fixes confirmed live**; nothing regressed.

> **✅ RESOLVED 9 June 2026 — same session.** Every finding was fixed in-file (C2 = intentional deletion, confirmed by Callum). See the Resolution Log at the end. One action remains for Callum: **republish the DS** (Inspector tab fix).

---

## Part 1 — Prior-Fix Verification (all three audit reports)

| # | Fix being verified | Source audit | Status |
|---|---|---|---|
| V1 | Field-row 1px collapse → AUTO/48 | QA #1 / DS audit | ✅ All 40 Field-row instances on Specs render at 48px |
| V2 | `text/secondary` → #9A9AA2 · `text/tertiary` → #8A8A90 (AA) | DS audit #1 | ✅ Resolved values confirmed in DS Dark mode |
| V3 | `border/input` token (perceptible resting inputs) | DS audit #2 | ✅ Exists; Dark #6E6E76, Light #55554E |
| V4 | `text/link` token (Dark #378ADD / Light #1A66C9) | a11y remediation | ✅ Exists with exactly those values |
| V5 | Light-paper canvases in Light mode (P1/P2 contrast) | a11y remediation | ✅ Holds — 493/497 texts on Editor — Deep paper pass AA; the 4 fails are *new* bugs (below), not regressions |
| V6 | Top-bar search/bell/help 34×34 hit areas | a11y O2 | ✅ "Icon hit area" 34×34 wrappers present in screens-file Top bar instances |
| V7 | Table row restructure `Type × State` | DS audit #5/#6 | ✅ Axes are `Type: Header/Data × State: Default/Hover/Selected/Focus` |
| V8 | Table-row breaking change fallout | DS audit republish note | ✅ No fallout — zero Table-row instances exist in the screens file (Specs/Settings/Portal swept; tables are custom-built) |
| V9 | Height-bug five (Notification item, Table row, Command palette row, Safety block, Content toolbar) | DS audit | ✅ All healthy in DS (88/50/36/76/40); no 1px instances found in screens |
| V10 | Auth forms persistent labels (U1) | a11y remediation | ✅ All 6 forms show visible labels + example placeholders |
| V11 | Two-accent rule (portal brand-skinned, not DS) | QA #8 | ✅ Portal 404 unbound literal light palette + #2F6FED accent; all 6 dark error frames token-bound |
| V12 | P4 near-threshold pairs (tertiary on darkest card 4.56; portal pairs 4.51–4.55) | a11y P4 | ⚠️ **Still open** — flagged-only in the audit, never nudged. Accepted risk or one-step darken |
| V13 | Code-level follow-ups (focus wiring, aria, roles) | a11y | ➡️ Engineering-side, tracked in the handoff docs |

**Verdict: the 06-08 DS republish delivered everything it was supposed to.** The only carried-over item is P4, which was always optional.

---

## Part 2 — Findings

### 🔴 Critical

| # | Finding | Where | Detail & fix |
|---|---|---|---|
| C1 | **Snippet-embedded Warning block is illegible** | Editor · Snippet block `362:1389` | The Warning inside the snippet is built as a **dark panel** (#232328) on the light paper: body text bound to `text/on-paper` #1B1B1E = **1.10:1 (invisible)**; header bound to `safety/warn-border` #D9533A = 3.91:1. The Block-gallery Warning (`359:1091`) renders correctly light — so this one block contradicts the IA's own rule that safety blocks are *enforced, non-themeable* (ISO 82079 / ANSI Z535.6). **Fix:** rebuild with the light `safety/warn-bg` treatment (the gallery one is the reference), body → `text/on-paper`, header → `safety/warn-text`. |
| C2 | **Prototype — App Tour page is gone** | file root | Page `372:911` (22 wired frames, ~59 hotspots, flow start at Log in) **no longer exists** — the file now ends at System & Errors. If deletion was intentional, update the project docs; if not, restore via Figma version history (built 8 June). Either way the dev-handoff and memory references to it are now stale. |

### 🟡 Moderate

| # | Finding | Where | Detail & fix |
|---|---|---|---|
| M1 | **Invite body text clipped mid-sentence** | Auth · Accept invitation `350:1038` | "…Set up your account to continue." is a 432px no-wrap text node inside the 400px clipping card → visibly cut at "account t…". Set width ≤336 + `textAutoResize: HEIGHT`. |
| M2 | **Deep-editor outline shows Library views, not the document outline** | all 11 Editor — Deep frames + base `40:132` (App Shells) | Left panel reads "OUTLINE / All documents / Drafts / In review / Published" — that's the Documents Library rail list. The real editor page (`60:800`) shows the correct section outline (Overview, Electrical characteristics…). Inherited from the App-Shell base frame the Deep frames were cloned from, and it breaks the IA's *staleness-in-outline* surfacing (amber ● next to the stale section). Fix the base frame too. |
| M3 | **Inspector "History" tab clipped to "His"** | all 11 Editor — Deep frames | The Deep frames use a custom 228px inspector panel; the tab strip (Properties · Comments · History) needs ~245px, so History is cut at the panel edge. The DS Inspector organism / the editor page's instances don't have this problem. Widen the panel or reuse the DS Inspector. |
| M4 | **Warning header uses the border token as a text color** | Editor · Block gallery + Snippet block | "⚠ WARNING" is bound to `safety/warn-border` #D9533A → 4.0:1 at 12.5px on the warn background (fails AA; also a semantic misuse). `safety/warn-text` #B23B22 measures 5.2:1 — rebind. |
| M5 | **Callout "Tip" label bound to a raw primitive** | Editor · Block gallery | Bound to `blue/500` (primitive — these are deliberately scope-hidden from pickers; plugin-written bindings bypassed that) and measures 4.35:1 on the #232328 callout panel. Rebind to a semantic token (`text/link` or a new `status/info-text`) with an AA-passing value. |
| M6 | **Placeholder-styled values (U1's cousin)** | Auth · Create workspace + Auth · Profile | "Metric" / "UTC" (defaults) and "Callum Kelpin" / "callum@acme.io" (actual values) render in `State=Default` placeholder grey — they read as empty fields. Units/Time zone should also be `Type=Select` (chevron affordance), not Text. Use `State=Filled`. |
| M7 | **Profile page invents a Settings nav that conflicts with the Settings IA** | Auth · Profile `351:1060` | New "ACCOUNT" group (Profile · Notifications · Security & sessions) isn't in the 9+2 section list; Workspace/Members/Brand Profiles are dropped from the same nav; the original "PERSONAL · Notifications" rows are still in the layer tree but hidden (stale layers). Two Notifications entries, and "Security & sessions" duplicates the in-page "Active sessions" section. Decide the canonical list (either adopt ACCOUNT into the Settings IA + Settings page frames, or slot Profile under PERSONAL) and reconcile both pages. |
| M8 | **Empty-document Inspector contradicts the empty state** | Editor · Empty document `364:1595` (+ Lock banner) | Panel shows `Type: Paragraph` + spec references on a document with zero blocks. IA Properties-variant 1: no selection → *Document* properties (Title · Product · Brand Profile · Document Type · Page size · Release). |
| M9 | **Auth dead-end states missing** | Auth & Account page | The IA's route map explicitly includes **Invalid/expired invite** and **Invalid/expired reset link** as screens ("clear dead-end + re-invite / request-new-link"). Neither is built; no error-state variants exist anywhere in the auth set (invalid credentials, email-already-registered are listed states too). The two dead-ends are the priority — they complete the honest-error principle. |

### 🟢 Minor

| # | Finding | Where |
|---|---|---|
| m1 | Empty text node where the "links expire in…" footer microcopy belongs (IA §5.3) | Auth · Reset password (`350:1105`) |
| m2 | Error-badge iconography converges: 404, Offline, and Maintenance all read as magnifier variants; the 500 triangle carries no "!" mark. Offline → wifi-off/cloud-off; Maintenance → wrench/gear | System & Errors |
| m3 | Slug preview "acme.arther.io" floats as a detached caption between fields — tie it to the Workspace-name field as helper text (IA: *live* slug preview) | Auth · Create workspace |
| m4 | CTA width rhythm: hug-width primary ("Log in", 57px) vs wider Google button vs full-width fields. Full-width primaries would settle the cards | Auth cards |
| m5 | "Terms and Privacy Policy" not visually distinguished as links | Auth · Sign up |
| m6 | Account-menu "Help & assistant" drops the IA's ⌘J shortcut hint (the palette/assistant split was a deliberate IA decision — the hint teaches it) | Auth · Account menu |
| m7 | Maintenance copy has no ETA slot (IA: "ETA if known") | Error · Maintenance |
| m8 | Slash-menu rows show empty placeholder squares that read as checkboxes — use block-type glyphs or drop them | Editor · Slash menu |
| m9 | Profile content omits the avatar control and the Google-managed-password note (IA §5) | Auth · Profile |
| m10 | Spec Table properties panel lacks the Degradation row (IA Properties-variant 3); Cross-cutting overlays still don't consume the DS Notification item / Command palette row molecules built for them (works visually; maintenance risk) | Editor · Spec Table props · Cross-cutting |

**Not built (acknowledged scope, listed for completeness):** block-conversion *menu* (only the confirm dialog exists), token chip popover, Preview · Portal (PDF only), image drag-drop state, drag-reorder/multi-select visuals. All are IA §3 interaction surfaces — fine to defer, worth a line in the handoff so engineering doesn't treat the frame set as exhaustive.

---

## Visual Hierarchy & First Impressions

**Auth:** the eye lands title → fields → primary CTA, correctly; the wordmark anchors without competing. The invited-to eyebrow on Accept invitation is the best moment in the set — context before commitment.
**Editor — Deep:** overlays (slash menu, token picker) sit confidently on the dimmed paper; the token picker's value+type chips (36 V · scalar) are exactly the right density. The dark callout/code/accordion-header panels on light paper are a bold but consistent family choice.
**System & Errors:** centered single-action layout reads instantly; Delete-blocked's inset blocker list gives the dialog real informational weight — the strongest error surface.

## What Works Well

- **All 20 block types, correctly grouped**, in the slash menu — a 1:1 realization of the Visual Block Editor spec via the IA.
- **The archive-instead-of-delete dialog** turns the lifecycle matrix's philosophy into UI: blockers listed, consequences explained, safe action primary.
- **Spec-reference staleness** (v3 · current ✓ / v2 · stale ⚠) is visible in the Inspector exactly as the smart-tracking model intends.
- **Auth is boring in the best way** — labels persist (U1 fix held), naming is consistent ("Log in" everywhere), Google is parallel not privileged, and errors were specified non-enumerating in the IA.
- **Token discipline held under pressure:** 497 paper-text samples, 4 failures — and all four are attributable to two mis-built blocks, not to token drift. The auth cards, error pages, and editor chrome are fully DS-bound.

## Priority Recommendations

1. **Fix the snippet Warning block (C1) and the warn-header token misuse (M4) together** — one frame rebuild + one rebind; this clears every contrast failure on the new surfaces.
2. **Resolve the Prototype page (C2)** — restore from version history or declare it gone and update the handoff/docs; it's referenced as a deliverable.
3. **Repair the Deep-editor chrome inheritances (M2 + M3) at the base frame** — correct outline content (with the stale ●) and a full-width Inspector tab strip, then propagate to the 11 clones. Cheap, and it un-breaks the staleness story the whole feature exists to tell.
4. **Reconcile the Settings/Profile nav (M7)** before the IA docs and frames drift further — it's the only place two surfaces now disagree about the same navigation.
5. **Sweep the placeholder-as-value fields (M6) + add the two auth dead-ends (M9)** — small, closes the auth IA.

---

## Resolution Log — 9 June 2026

All 21 findings actioned in the same session. Verified by a fresh effective-background contrast scan (506 texts on Editor — Deep, **0 failures**) plus screenshot review of every touched frame.

**Critical**
- **C1 ✅** Snippet warning rebuilt light: container `bg/inset`→`bg/surface` (Light context, white like the gallery reference), stroke bound to `safety/warn-border`, body legible at ~16:1.
- **C2 ✅** Prototype deletion confirmed **intentional** by Callum — no restore; docs/memory updated.

**Moderate**
- **M1 ✅** Invite body wraps at 336px (`textAutoResize: HEIGHT`) — full sentence visible.
- **M2 ✅** All 11 Deep frames **+ base `40:132`** now show the real document outline (Overview · Electrical characteristics · Mechanical · Compliance) via Navigator instance text overrides. (Stale-dot-in-outline is still not depicted anywhere in the file — matches the editor page's current pattern; noted as a future IA nicety.)
- **M3 ✅** Two-part fix: DS Inspector component set (3 variants) tab padding 12→7 + label 13→12px (**requires DS republish**); screens-side, all 11 instances got the label override + width 260→275 so History is fully visible *now*.
- **M4 ✅** Both warning headers rebound `safety/warn-border`→`safety/warn-text` (#B23B22; 5.9:1 on white).
- **M5 ✅** Tip callout panel rebound to `bg/surface` (resolves #141416 under its Dark pin) and the label `blue/500`→`text/link` → 5.3:1, no raw primitives left.
- **M6 ✅** Create-workspace fields → `Type=Select, State=Filled` (Metric / UTC with chevrons); workspace name + both Profile fields → `State=Filled` with real values.
- **M7 ✅** Profile nav replaced with a clone of the canonical Settings nav (WORKSPACE/DOCUMENTS/SPEC DATA/PERSONAL/COMING SOON) + new **PERSONAL → Profile** Nav row (Active). ACCOUNT group, "Security & sessions" row, and the hidden stale rows are gone.
- **M8 ✅** Empty-doc + lock-banner Inspectors detached and rewritten as **Document properties** (Title / Primary product / Brand Profile / Document Type / Page size / Release).
- **M9 ✅** Two new frames at the section end: **Auth · Invite expired** (`461:1094`) and **Auth · Reset link expired** (`461:1115`) — message-only dead-end cards with recovery actions per IA.

**Minor**
- **m1 ✅** Reset footer: "For security, reset links expire after 1 hour." (`text/tertiary`, 12px).
- **m2 ✅** Offline → wifi-off vector; Maintenance → wrench vector; 500 triangle carries an "!" cutout.
- **m3 ✅** Slug preview moved inside the Workspace-name field group (6px helper-text gap).
- **m4 ✅** All 10 auth CTAs full-width (`FILL`) — primaries and Google/Resend secondaries match.
- **m5 ✅** "Terms" + "Privacy Policy" underlined and range-bound to `text/link`.
- **m6 ✅** Account menu Help row: right-aligned **⌘J** hint added (space-between row).
- **m7 ✅** Maintenance copy now carries an ETA ("back by 09:30 UTC").
- **m8 ✅** 20 placeholder squares deleted from the slash menu — clean text rows.
- **m9 ✅** Profile: avatar row (48px CK + "Upload new avatar") + Google-password caption added.
- **m10 ✅/⚠** Spec Table panel got its DEGRADATION group (PDF — Static table). Notifications overlay: all 6 rows swapped to **DS Notification item instances** (Comment/Review/Stale types, content preserved). **Command palette rows deliberately left custom**: the DS row has only label+shortcut slots, while the palette design carries category + destination meta — swapping would delete information. Logged as a DS follow-up (palette row v2 with meta slot).

**Outstanding for Callum:** republish the Arther DS so the Inspector tab fix reaches the library (screens already look correct via instance overrides). P4 near-threshold pairs remain accepted-risk.

---

*Critique run with the design:design-critique skill — Plugin-API token/contrast verification (effective-background compositing) + full screenshot review, against the three per-surface IA docs and the three prior audit reports. Initial pass was report-only; all fixes applied 9 June 2026 at Callum's request.*
