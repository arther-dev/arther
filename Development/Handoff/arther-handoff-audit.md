# Arther — Developer Handoff Audit

**Date:** 2026-06-09 · **Auditor:** Claude (for Callum) · **Scope:** the 5 docs in `Development/Handoff/`
**Method:** full read of all 5 docs → cross-check against the IA suite, the four design audits, the PRD/feature specs, and the architecture audit → live Plugin-API verification of both Figma files (DS `GESXbRrqd3dYh8XkFBLpeC`, Screens `pdMPtD58F3MeLrTzWsoX3E`) — variables, styles, components, keys, page/section/frame inventory, and ~30 node-ID spot checks.

**Verdict: structurally sound, substantively stale in spots — fix before circulating.** Coverage is complete (all 15 feature IAs are represented; every surface spec matches its IA's decisions) and the large majority of node refs, token values, counts, and component keys verified clean against the live files. But the handoff was written 06-08 and the world moved: one referenced page no longer exists, two docs contradict each other on an a11y rule and a shortcut, the typography table doesn't match the file, and the 06-09 architecture audit (ADR-013/014) post-dates it. 5 High / 7 Medium / 8 Low findings.

---

## High — would mislead a developer

| # | Where | Finding | Evidence (live read) | Fix |
|---|---|---|---|---|
| **H1** | 00 walkthrough · 04 footer | **The interactive prototype page `372:911` no longer exists.** The Screens file has 15 pages; none is the prototype. Both references are dead ends. | `figma.root.children` contains no page `372:911` / "Prototype — App Tour" | Confirm whether the deletion was intentional. If yes, delete both references; if no, rebuild the prototype, then update the row |
| **H2** | 01 §3 | **The typography table doesn't match the file's 12 text styles.** It names `Heading/H3`, `Body/Small`, and `Mono/*` — none exist — and omits `Display`, `Title`, `Body/Large`, `Overline`, which do. A `<Text variant>` API built from this table is wrong. (`Overline`, not `Caption/Strong`, is likely the small-caps micro-label style — verify in Dev Mode.) | Actual styles: Display · Heading/H1 · Heading/H2 · Title · Body/Large · Body/Default · Body/Strong · Label/Default · Label/Strong · Caption/Default · Caption/Strong · Overline | Regenerate the table from the file with exact size/weight per style |
| **H3** | 03 D Figma · 00 walkthrough | **Editor state frames are on the wrong page, and that page is missing from the file map.** 03 D says they "live on the app-shell page"; they live on the dedicated page **`Documents · Editor` (60:800)** — 3 sections (Editing surfaces 6 · Output & review 3 · System states 3), 12 frames incl. the base shell `40:132`. The 00 walkthrough table has no row for this page at all. | Page `60:800` verified; App Shells page holds only Modes 7 / States & flows 5 / Overlays 3 | Fix 03 D's location; add a `Documents · Editor` row to the 00 table |
| **H4** | 01 §2.2 + §2.5(1) vs 00/02 | **The `text/tertiary` accessibility rule is pre-remediation and the docs contradict each other.** 01 gives the contrast range `4.22–4.79:1` and a "AA-safe on canvas/surface/panel only — use `text/secondary` on raised/active/inset" rule. Those are the numbers for the *old* `ink/250` value. The shipped token aliases **`ink/200` `#8A8A90`**, which the DS audit logs as AA on **all six** dark surfaces (4.56–5.62). Docs 00/02 already cite the post-fix 4.56 figure, so the handoff disagrees with itself. | `text/tertiary` Dark → `ink/200` → `#8a8a90` (live); DS-audit resolution log entry 1 | Update §2.2 to 4.56–5.62; delete or soften §2.5(1) (a canvas/surface-only convention is now optional belt-and-braces, not a requirement) |
| **H5** | 02 §6 vs 03 D | **`⌘\` is assigned twice:** 02 → Toggle Navigator *(tbc)*; 03 D → Focus mode. The collision is inherited from the IA suite (app-shell IA §11 vs editor IA) and was never reconciled — a dev will wire both. | app-shell IA: "Toggle Navigator `⌘\` (tbc) · Focus: dedicated toggle (tbc)"; editor IA: "`⌘\` Focus" | Decide once (suggest: `⌘\` = Focus per the editor IA; panels get `⌘.`/`⌥⌘\`), fix both handoff docs **and** the app-shell IA |

## Medium — wrong counts/values a dev would copy

| # | Where | Finding | Live value | Fix |
|---|---|---|---|---|
| **M1** | 00 · 01 §12 | Variable count "98" is stale | **101** (Primitives 35 · Color 37 · Spacing 11 · Radius 7 · Size 11); 5 collections ✓ | Update both mentions |
| **M2** | 01 §5 | Radius table: says "6 tokens", hedges values, and **omits two tokens** | **7**: 2xs 2 · xs 4 · sm 6 · md 8 · lg 12 · **xl 16** · **pill 999** | Replace table with exact 7-row list |
| **M3** | 01 §4 | Spacing token **names** are wrong: "`space/2` … `space/64`" | Names are t-shirt: `space/2xs…space/6xl` (values 2·4·8·12·16·20·24·32·40·48·64 ✓) | Fix naming so the CSS-var export matches Figma |
| **M4** | 01 §9.1/9.2 | Component classification drift: **Nav rail item + Nav row are Atoms** in the file (doc lists them as molecules), and the **`Panel` molecule (key `3b1bdb21`) is undocumented**. Totals (25/13/10/6 = 54) only reconcile with the file's grouping | Atoms page: 9 sets + 4 standalone incl. Nav rail item/Nav row; Molecules: 7 sets + 3 standalone incl. Panel | Move the two rows; add a Panel row |
| **M5** | 00 table · 04 E | Auth frame count stale: "9 frames" | **11** — `Invite expired` + `Reset link expired` were added (states 04 E's text already specifies, so the spec needs no change — just the Figma refs) | Update both counts; list the 2 new frames |
| **M6** | 00 (stack §, companions) · 03 D | **Pre-dates the 06-09 architecture audit.** "ADR-001…012" → now **014**: ADR-013 **TipTap (ProseMirror)** decides the editor engine (block tree = TipTap JSON = Zod schema; spec tokens = atom inline nodes) — directly relevant to 03 D's editor Data/RSC notes; ADR-014 Upstash. Companion list omits `arther-architecture-audit.md` | `arther-adrs.md` ADR-013/014 (Proposed, 9 Jun) | Bump ADR range; add 1–2 lines to 03 D (TipTap, atom inline tokens); add the audit to companions |
| **M7** | 03 B | "**Seven** field-type editors" — then lists **eight** (scalar · range · toleranced · boolean · enum · multi-enum · table · reference). The miscount is upstream (PRD §143, spec-DB §4.1, specs IA all say "seven" over an 8-item list) and was copied faithfully | Spec-DB §4.1 table = 8 types | Say **eight** in the handoff; flag the upstream docs for the same one-word fix |

## Low — nits and hygiene

| # | Where | Finding | Fix |
|---|---|---|---|
| L1 | 00 line 4 | "all 11 surfaces" — docs 03–04 spec **12** surfaces (+ shell & overlays in 02) | "12 surfaces" |
| L2 | 02 §12 | Dead ref: "Legacy Specs app-shell reference frame `6:2`" — node doesn't exist | Delete the row |
| L3 | 01 §2.1 | `bg/raised` "~#1E1E1E" → actual **#1A1A1F** (`ink/750`); `bg/active` "—" → **#1C1C20** (`ink/700`) | Use exact values |
| L4 | 03 A | First-run checklist: handoff says 5 steps and matches the mockup's 5 rows, but the mockup's own counter says "1 of **4** done" and the dashboard IA + onboarding spec define **4** (Generate-first-doc reads as the goal CTA, not a counted step). Also: the mockup builds rows from raw icons, not `Wizard step` instances, though the handoff maps the checklist to Wizard step | Decide 4-steps+goal-row vs 5; fix the counter or the IA; either swap mockup rows to Wizard step instances or keep the mapping as build intent (it's fine as the code spec) |
| L5 | 00 · 01 §12 | Text field listed as "`5723efd7…` / `045ed181…`" with no explanation — **`045ed181` is the component-set key** (12 variants, h 40); `5723efd7` is a variant-level key. 04 E cites the set correctly | Keep the set key; label the other or drop it |
| L6 | 03 C | "Configure detail frames `239:911`, `239:1039`" — `239:1039` is the **Generating** frame; `239:911` is Configure — all complete | Relabel |
| L7 | 01 §7 | Token/component divergence the doc papers over: `size/rail-item` = **40** but the Nav rail item component is **44** high (the table's 44 matches the component). A token export will emit 40 | Reconcile in the DS (retune token or rename it), then state one number |
| L8 | 03 D | Editor "paper" `40:216` is literally named "Frame" in the file | Name the layer (file hygiene; the ID ref works) |

---

## Verified clean (so you don't re-check)

- **File map:** all 13 listed surface pages + section IDs + frame counts match live — Specs `233:1798/1799/1800` (5+5+4=14) · Dashboard `258:1111` (6) · New Document `245:1087` (6) · Reviews `269:1343` (6) · Import `280:1097` (6) · Portal `290:1163` (6) · Settings `303:1183` (6) · Snippets `313:1165` (6) · Cross-cutting `321:1307` (5) · Public Portal `325:911` (8 incl. the 2 mobile frames, all 8 IDs resolve) · Auth `355:1033` · Editor — Deep `365:1775` (11, names match) · System & Errors `369:931` (7, names match) · App Shells 3 sections (7+5+3=15).
- **Spot nodes:** `200:911`, `250:911` (review modal), `250:1107`, `260:944`, `271:912`, `342:911` (accent-systems note), `40:132/216/222` all resolve.
- **Tokens:** bg ramp `#0E0E10/#141416/#16161A/#232328` ✓ · `text/primary #ECECEE`, `text/secondary` ink/160 `#9A9AA2`, `text/tertiary` hex `#8A8A90` ✓ · `border/input` ink/300 `#6E6E76`, `border/focus #378ADD` ✓ · `text/link` dark `#378ADD` / light `#1A66C9` ✓ · status live/stale/review + safety warn-bg/warn-text ✓ · spacing **values** ✓ · size tokens (topbar 64, rail-w 72, sidebar 264, inspector 260, avatar 30…) ✓.
- **DS structure:** 54 components (25 icons · 13 atoms · 10 molecules · 6 shell) ✓ · 12 text + 3 effect styles (counts) ✓ · Button set `f8bc95b9` (18 variants, h 36) ✓ · Editor toolbar set `6df07589` (Authoring/Review) ✓ · Content toolbar `28:32` ✓ · control heights (Button/Tab 36 · Icon button 34 · Nav rail item 44 · Field row 48 · Text field/Nav row 40 · Avatar 30 · Spec token 24) ✓ · **Field row `21:38` counterAxis AUTO, h 48 — the republish landed** ✓.
- **Substance vs IA/specs:** all 15 feature IAs covered; Dashboard 12 states + precedence ✓; Reviews grouping/state machine/AND-approval ✓; Settings 9+2 sections + roles table ✓; Specs tabs/rails ✓; 20 block types (count and list) ✓; Portal 4 rail views, no Branding ✓; two-accent-system rule consistent everywhere ✓; a11y claims match the a11y audit's resolution log (criticals fixed in-file; remainder correctly framed as code-level) ✓.

**Not verified** (out of Plugin-API reach or deprioritized): published-library sync state, per-style font metrics, individual icon component keys, light-mode values beyond the sampled set.

---

## Recommended fix order

1. **H1** — settle the prototype question with a human decision, then H3 (file-map row + location fix) in the same pass.
2. **H2, H4, M1–M4, L3, L5, L7** — one sweep through doc 01 against the live DS read (this audit has all the values).
3. **H5** — pick the `⌘\` owner; patch 02 §6, 03 D, and the app-shell IA together.
4. **M5–M7, L1, L2, L6, L8** — mechanical edits, 10 minutes.
5. Upstream one-worders from M7 (PRD/spec-DB/specs IA "seven"→"eight") and the L4 checklist-count decision.

*All fixes are text edits to the 5 handoff docs except H1 (needs a decision), L4 (needs a decision), L7/L8 (Figma-side).*

---

## Resolution log — 2026-06-09

All text fixes applied in place the same day (decisions by Callum). **H1:** prototype deletion confirmed intentional → references removed from 00/04, removal logged in 00 known issues. **H5:** `⌘\` = **Focus** (matches the editor IA); panel toggles → `⌥⌘\` / `⌥⌘⇧\` *(tbc)* — patched in 02 §6 **and** the app-shell IA §11. **L4:** checklist = **4 counted steps + an uncounted "Generate your first document" goal row** — reconciles the mockup, its "1 of 4" counter, and the IA with no Figma change.

Upstream one-worders applied too — a project-wide sweep caught every stale count: PRD (SpecField entity), spec-DB §4.1 + its decisions-rationale row, the specs IA ("seven"→"eight"; its field-type-editor list also gained the missing `multi-enum`), the app-wide IA (×2), and the product-synthesis diagram ("7→8 field types"). The dashboard IA's "seven types" is the *action-item* taxonomy and is correct as-is. Discovered during the fix pass and folded into H2's rewrite: the live type ramp uses **three weights** — Regular · Medium · **SemiBold** (Display, H1, H2, Overline) — so 01 §3's "two weights only" claim was also wrong; the section was regenerated from a live read with exact sizes, line-heights, and Overline's +6% tracking.

**L7/L8 closed 2026-06-09 (Figma-side):** `size/rail-item` retuned 40 → **44** after verifying it is bound nowhere in the DS (Atoms/Shell/Foundations scans clean — zero layout impact; include in the next DS republish) · `40:216` renamed **"Paper — document canvas"**. **Nothing from this audit remains open.**
