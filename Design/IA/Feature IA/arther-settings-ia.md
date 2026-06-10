# Information Architecture: Arther — Settings

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **Settings** mode — the backstage. Extends `arther-app-shell-ia.md` (Settings = a rail exception, section-list Navigator, no Inspector) and `arther-app-ia.md` (§4.6); realizes the Workspace Admin spec (v1.1) and places sections owned by other specs (AI Generator, Smart Spec Tracking, Spec DB, Collaboration, External Sync, Billing).
**Decisions this pass (section list locked by the 4-Jun audit — no layout fork):** (1) Settings is a **labeled section-list Navigator + a content form**, no icon rail, no Inspector; (2) **9 launch sections + 2 post-launch placeholders**, grouped Workspace · Documents · Spec data · Personal · Coming soon; (3) **Owner/Admin only, except per-user Notifications** (every member reaches it); (4) **Document Types** is the most configuration-intensive section (schema editor + approval roles); (5) **Brand Profiles** owns portal branding (apply · custom CSS · staged apply · preview); (6) placeholders (Integrations, Billing) ship as **"Coming soon"** from day one so the nav never restructures.

**This IA places + shells the sections; it does not redefine feature behaviour.** Five sections are owned by other specs (Document Quality Standards → AI Generator; Domain Ownership → Smart Spec Tracking; Spec Categories + Units → Spec DB; Notifications → Collaboration). This doc defines their **placement and shell**; their internal models live in those specs.

---

## 1. Purpose & Scope

Settings is where the configuration that gates everyone else's work lives: who's on the team and what they can do, the Document Types and quality standards that shape generation, the Brand Profiles that style output and the portal, the spec governance (categories, units, domain ownership), and each person's own notification preferences. It is **Owner/Admin-leaning, low-frequency, high-stakes** — the screens a new admin sets up first and then rarely revisits.

**In scope:** the **section-list navigation** (9 launch + 2 placeholders, grouped); each section's **content shell + key surfaces** — Workspace (identity), Members (list/invite/roles/ownership transfer), Document Types (list + schema + approval roles), Document Quality Standards (shell), Brand Profiles (list + editor + portal apply), Domain Ownership (matrix), Spec Categories, Units, Notifications (per-user), Integrations + Billing (placeholders); the **role/permission model** as it surfaces; states, flows, naming, component reuse, and URLs.

**Out of scope (referenced at the boundary):** the **internal models** of feature-owned sections (DQS constraints — AI Generator; Domain-ownership routing — Smart Spec Tracking; category/unit schemas — Spec DB; notification delivery — Collaboration); the **Brand Profile field set** (AI Generator) and the **Document Type schema** semantics (AI Generator); seat **enforcement** mechanics (Billing, inline everywhere); SSO / SCIM / audit-log / multi-workspace (Enterprise, post-launch); and all visual / design-system work.

---

## 2. Where Settings Sits (shell recap)

Settings is a top-level **mode** and one of the two **rail exceptions**: instead of an icon rail it uses a **labeled section-list Navigator** (grouped), and it has **no Inspector** — each section is a **form/table in the content area**. It is reached from the top-bar account/module switcher; it is **visible to Owners/Admins only, except Notifications**, which every member can open to manage their own preferences (Members/Viewers entering Settings land directly on Notifications, the only section they see).

---

## 3. Surface & Section Map

The section list (grouped) and each section's URL. **A** = Owner/Admin; **U** = per-user.

- **Workspace** group
  - **Workspace** `/settings/workspace` *(A, default)* — name · logo · **immutable URL slug**
  - **Members** `/settings/members` *(A)* — member list · invite · roles · removal · **ownership transfer**
  - **Brand Profiles** `/settings/brand-profiles` *(A)* — list → **Brand Profile editor** (live preview) · default · **portal apply / custom CSS / staged apply / preview**
- **Documents** group
  - **Document Types** `/settings/document-types` *(A)* — list → **schema editor** + **approval roles** (required/optional, assignees, vacant-role warning) + default Brand Profile
  - **Document Quality Standards** `/settings/quality-standards` *(A)* — standalone DQS entities (create/edit/duplicate/archive), referenced by Document Types
- **Spec data** group
  - **Domain Ownership** `/settings/domain-ownership` *(A)* — the **category → default-owner matrix** + per-product override counts
  - **Spec Categories** `/settings/categories` *(A)* — workspace category list (built-in + custom; reassign-before-delete)
  - **Units** `/settings/units` *(A)* — custom unit registry (name · symbol · dimension · SI factor)
- **Personal** group
  - **Notifications** `/settings/notifications` *(U — all members)* — per-event × per-channel (in-app / email) preferences
- **Coming soon** group *(placeholders)*
  - **Integrations** `/settings/integrations` *(A)* — "Coming soon" (External Sync, post-launch)
  - **Billing** `/settings/billing` *(A)* — "Coming soon" (Billing, post-launch)
- **States:** section default (form) · list → item editor (Document Types, Brand Profiles) · confirm dialogs (ownership transfer, slug-immutability, archive-block) · "Coming soon" placeholder · Loading.

---

## 4. Navigation Model

- **Primary:** the **section-list Navigator** (left), grouped with subheads; selecting a section loads its form/table in the content area. The active section is highlighted; the list is the only nav (no tabs, no rail).
- **List → editor:** the two configuration-heavy sections (**Document Types**, **Brand Profiles**) are list → **dedicated editor** surfaces (the editor takes the content area; a back returns to the list). Brand Profile's editor has a **live preview**.
- **Scope gating:** Members/Viewers see **only Notifications**; Owners/Admins see all; **only the Owner** sees Delete-workspace + initiates ownership transfer; an Admin **can't change their own role**.
- **Confirm flows:** destructive/irreversible actions use dialogs — **ownership transfer** (re-enter password), **slug** (immutability warning on first set), **archive-instead-of-delete** (Document Types/Brand Profiles with dependents).
- **Keyboard / Mobile:** desktop-only authoring app.

---

## 5. Region Content Hierarchy (per section)

Navigator = grouped section list. Content = the active section.

- **Workspace** — name (2–60), logo (PNG/SVG ≤1 MB), **URL slug** (lowercase, unique, **immutable after first set** — explicit warning); Save.
- **Members** — searchable **member table** (name · email · role · joined); **Invite** (emails + role; 7-day link); inline **role change** (Owner-only for Admins; can't self-demote); **remove** (preserves contributions; can't remove self/Owner); **pending invitations** list (revoke/resend); **Transfer ownership** (Owner → an Admin, password-confirmed).
- **Document Types** — **list** (name · #approval roles · #documents generated; archive-only when used) → **editor**: name · description · **schema editor** (sections ↔ spec-field categories) · **approval roles** (labels, required/optional, assigned members, **vacant-role warning**) · default Brand Profile.
- **Document Quality Standards** — list of standalone DQS entities (create/edit/duplicate/archive); referenced by Document Types (shell only).
- **Brand Profiles** — **list** (name · #Document Types defaulting to it; reassign-before-delete) → **editor** (voice · palette · type · logo) with **live preview**; workspace **default**; **portal application** (Apply to portal · custom CSS · staged apply · preview).
- **Domain Ownership** — the **matrix**: Category · Default owner (user picker) · Products-with-overrides count (→ expanded override view).
- **Spec Categories** — workspace category list (built-in + custom; add/rename; **reassign before delete**).
- **Units** — custom unit registry rows (name · symbol · dimension · SI factor; add/edit).
- **Notifications** *(per-user)* — a grid of **event types × channels** (in-app / email) with sensible defaults; per-user, workspace-wide (no per-document prefs at launch).
- **Integrations / Billing** — **"Coming soon"** placeholder (description of what's coming; no config).

---

## 6. Roles & Access (how it surfaces)

| | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| See Settings (all sections) | ✓ | ✓ | — | — |
| See **Notifications** only | ✓ | ✓ | ✓ | ✓ |
| Invite / role changes / remove | ✓ | ✓ | — | — |
| Edit Document Types / Brand Profiles / spec-data sections | ✓ | ✓ | — | — |
| Transfer ownership · Delete workspace | ✓ | — | — | — |

Admin access is about **configuration**, not document-review authority — approver assignments are explicit (set per Document Type), never inherited from workspace role. Seat tiers: Owner/Admin/Member = Editor (paid); Viewer = free (read + comment + approve).

---

## 7. User Flows

### Invite a teammate
1. **Members** → **Invite** → enter emails + pick a role (Admin/Member/Viewer) → send (7-day link) → appears under **pending invitations** until accepted.

### Transfer ownership
1. **Members** → **Transfer ownership** → pick an Admin → **re-enter password** → confirm → previous Owner becomes Admin (irreversible without the new Owner).

### Define a Document Type's approval gate
1. **Document Types** → a type → **editor** → add **approval roles** (Technical / Regulatory / Brand), mark required, **assign members**; a **vacant role** is flagged and blocks send-for-review until filled.

### Style the portal
1. **Brand Profiles** → editor → adjust voice/palette/type/logo (live preview) → **Apply to portal** (staged → review → publish); custom CSS for precise control.

### Set spec governance
1. **Domain Ownership** → assign a default owner per category (+ see per-product override counts). **Spec Categories / Units** → maintain the workspace lists feeding the Spec DB.

### Manage my own alerts
1. Any member → **Notifications** → toggle event × channel (in-app/email).

---

## 8. States

Section form (default = Workspace) · Members table + invite + pending · ownership-transfer dialog · Document Types list · Document Type editor (schema + approval roles, vacant-role warning) · Brand Profiles list · Brand Profile editor (live preview) · Domain Ownership matrix · Categories/Units lists · Notifications grid · "Coming soon" placeholder · archive-block / slug-immutability dialogs · Loading.

---

## 9. Naming Conventions

| Concept | Label | Notes |
|---|---|---|
| The mode | **Settings** | Section-list nav; Owner/Admin except Notifications |
| Workspace roles | **Owner · Admin · Member · Viewer** | One Owner; Viewer = free seat |
| Generation schema | **Document Type** | Schema + approval roles + default brand |
| Output discipline | **Document Quality Standard** | Standalone, referenced by types |
| Identity/style config | **Brand Profile** | Owns portal branding (v1.1) |
| Category→owner map | **Domain Ownership** | Default owner + per-product overrides |
| Per-user alerts | **Notifications** | The only per-user section |
| Not-yet-built | **Coming soon** | Integrations · Billing placeholders |

---

## 10. Component Reuse Map

| Component | Source | Use in Settings |
|---|---|---|
| Top bar · Navigator (section list) | App-shell | The mode frame (no rail, no Inspector) |
| Section subhead · Nav row | DS | Grouped section list |
| Text field · Toggle · Button · Tab · Status pill | DS | Forms, Notifications grid, role pills, list/editor tabs |
| Table row · Field row | DS | Members table, Domain-ownership matrix, Units, Categories |
| Avatar | DS | Member rows, approver assignment |
| **Brand Profile editor + preview** | New (shares Portal render) | Brand Profiles editor |
| **Document Type schema editor** | New | Document Types editor |
| Skeleton | DS | Loading |

---

## 11. Content Growth Plan

- **Members** grow → searchable/sortable table + pending-invites section; pagination.
- **Document Types / Brand Profiles / DQS** grow → list → editor pattern; archive-not-delete keeps history.
- **Categories / Units / Domain-ownership** rows grow → searchable lists; reassign-before-delete guards integrity.
- **Sections** grow (post-launch) → the grouped list + "Coming soon" placeholders mean new sections slot in without restructuring.

---

## 12. URL Strategy

- `/settings/{section}` — `workspace` (default) · `members` · `document-types` · `quality-standards` · `brand-profiles` · `domain-ownership` · `categories` · `units` · `notifications` · `integrations` · `billing`.
- List → editor: `/settings/document-types/{id}` · `/settings/brand-profiles/{id}`.
- Dialogs: `?dialog=invite|transfer-ownership|archive`.
- Reserves `/{workspaceSlug}/…` per the shell.

---

## 13. Resolved Decisions (this pass)

1. **Section-list Navigator + content form**, grouped (Workspace · Documents · Spec data · Personal · Coming soon); no rail, no Inspector.
2. **9 launch sections + 2 placeholders**; **Owner/Admin except per-user Notifications**.
3. **Document Types** and **Brand Profiles** use a **list → dedicated editor** pattern (the two config-heavy sections); Brand Profile editor has a **live preview** and owns **portal apply**.
4. **Feature-owned sections are shelled here, defined elsewhere** (DQS, Domain Ownership, Categories, Units, Notifications).
5. **Placeholders ship as "Coming soon"** so the nav never restructures when Integrations/Billing land.
6. **Irreversible actions gated by dialogs** (ownership transfer = password; slug immutability; archive-instead-of-delete).

*Open (resolve during build):* the **Document Type schema editor** surface depth (structured form vs. more visual — spec open Q); whether **Brand Profile** preview is inline or a split editor; whether spec-data sections (Categories/Units/Domain Ownership) share one "Spec data" parent screen with sub-tabs vs. separate sections (kept separate here).

---

## 14. Out of Scope (this pass)

The internal models of feature-owned sections (DQS / Domain-ownership routing / category-unit schemas / notification delivery); the **Brand Profile field set** + **Document Type schema** semantics (AI Generator); seat **enforcement** mechanics (Billing); SSO / SCIM / audit-log surface / advanced RBAC / multi-workspace (Enterprise, post-launch); responsive/mobile (desktop-only); and all visual / design-system work.

---

*Arther — Settings Information Architecture. Version 0.1, 6 June 2026. Page-level IA for the Settings mode: a grouped section-list Navigator over 9 launch sections (Workspace · Members · Document Types · Document Quality Standards · Brand Profiles · Domain Ownership · Spec Categories · Units · Notifications) + 2 post-launch placeholders (Integrations · Billing), Owner/Admin-only except per-user Notifications, with list→editor patterns for Document Types and Brand Profiles and dialog-gated irreversible actions. Extends `arther-app-shell-ia.md` and `arther-app-ia.md` (§4.6); realizes the Workspace Admin spec v1.1 and places feature-owned sections. Next in the roadmap: Snippets, Cross-cutting, then the Public Portal visitor IA.*
