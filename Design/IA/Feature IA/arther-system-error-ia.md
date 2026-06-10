# Information Architecture: Arther — System & Error States

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for **whole-page system & error states** — the screens shown when something is missing, forbidden, broken, offline, or under maintenance, plus the product's signature **archive-instead-of-delete** guard. **Net-new** (beyond the original roadmap). Grounds in the Error-Handling & Entity Lifecycle Matrix v1.0 (philosophy + dependency-block dialogs), the Connectivity Model, and the App Shell + Public Portal IAs. Extends `arther-app-ia.md`.
**Decisions this pass:** (1) two visual families — **app system pages are dark + DS-bound** (centered message on the app canvas); the **portal not-found is light + brand-skinned** (the only public-facing error). (2) errors are **honest and non-blaming**, follow the matrix's "**allow the action, surface the consequence**" principle, and always offer a **way forward** (a primary recovery action + a safe secondary). (3) the **delete-blocked → archive** dialog is a first-class surface (the matrix's archive-only rule made visible). (4) the **connectivity indicator** (Connected/Saving/Offline chip) is owned by Cross-cutting; here we cover only the **full-page offline/connection-lost** state.

---

## 1. Purpose & Scope

These are the dead-ends and recovery points. They're rare, but they set trust: a 404 that helps you back to safety, a permission wall that says who to ask, a server error that doesn't blame the user, an offline state that reassures that work is saved, and — most distinctively — a **delete that refuses to orphan content** and offers archiving instead. The job is to keep the person oriented and in control even when the system can't do what was asked.

**In scope:** the **app system pages** — **404** (not found), **403** (no access / insufficient permission), **500** (something went wrong), **offline / connection lost**, **maintenance**; the **delete-blocked → archive-instead** dialog (and its sibling: "documents returned to Draft" cascade notice); and the **public portal not-found** (light, branded). Per-type copy/iconography, the recovery-action pattern, and app-vs-portal theming.

**Out of scope (boundaries):** **inline / in-context errors** owned by each feature (form validation = Auth; generation failure = New Document; import validation = Import; publish blocked-by-placeholder = Editor/Portal) — those live in their own IAs; the **connectivity indicator chip** + autosave status (Cross-cutting IA); the **entity-lifecycle cascade logic** itself (Error-Handling Matrix + feature specs — this IA only renders the *user-facing* block/notice); auth dead-ends like **expired invite / reset link** (Auth IA); and the portal's *empty* homepage when a workspace simply hasn't published (Public Portal IA — though it shares the not-found rendering).

---

## 2. Error Philosophy (from the matrix)

1. **Allow the action, surface the consequence.** Prefer letting a lifecycle action proceed while explaining the cascade over hard-blocking it — *except* where it would orphan content or break a document in Review.
2. **Archive-only for entities with dependents.** A Product/Component/Field/Document Type/Brand Profile/Snippet with active dependents **cannot be hard-deleted**; the system blocks delete, lists the blockers, and offers **archive** instead.
3. **Documents in Review are protected.** Anything that would compromise a document under review returns it to **Draft** with an explanatory notice — never a silent broken state.
4. **Honest, non-blaming, recoverable.** Errors state plainly what happened, never blame the user, and always offer a way forward (retry, go home, request access, contact admin).
5. **Attribution is permanent.** Nothing is anonymised on archive/removal — error/notice copy reflects this.

---

## 3. Surface Map

- **404 — Page not found** (app) → "We couldn't find that page" + **Back to dashboard** + secondary (Search / Go to Documents)
- **403 — No access** (app) → "You don't have access to this" + who to ask (workspace admin) + **Back to dashboard** / Request access
- **500 — Something went wrong** (app) → "Something went wrong on our end" + **Try again** + secondary (Back to dashboard); reassurance that work is auto-saved
- **Offline / connection lost** (app) → "You're offline" + "Your changes are saved and will sync when you reconnect" + **Retry**; auto-reconnect
- **Maintenance** (app) → "Arther is undergoing maintenance" + ETA if known + status-page link
- **Delete blocked → Archive instead** (dialog) → "Can't delete {entity}" + **list of blocking dependents** + **Archive instead** (primary) / Cancel; explains archive vs delete
- **Cascade notice** (toast/inline, referenced) → "{Document} was returned to Draft because {reason}" — owned by the relevant feature, shown here for completeness
- **Portal not-found** (public, light/branded) → branded header + "Page not found" + link to the documentation home; **no** app chrome, **no** hint that a workspace exists
- **States:** 404 · 403 · 500 · offline · maintenance · delete-blocked dialog · portal not-found.

---

## 4. Region / Content Hierarchy

### App system page (dark, centered)
1. **Mark** — Arther wordmark or a state glyph (lost / lock / alert / offline) in a tinted badge.
2. **Title** — one plain line ("We couldn't find that page").
3. **Body** — one or two sentences: what happened + reassurance (work is saved) + who to ask (for 403).
4. **Actions** — a **primary** recovery (Back to dashboard / Try again / Request access) + an optional **secondary** (ghost) path.
5. Minimal or no app chrome — the shell may be absent (hard error) or present with a dimmed canvas (in-app 404).

### Delete-blocked → archive dialog (scrim + dialog)
1. Title — "Can't delete {Product name}".
2. Reason — "It's referenced by {N} documents" + a short **list of blockers** (document names / dependent entities).
3. Explanation — archiving removes it from new content but preserves existing references (the matrix's archive behaviour).
4. Actions — **Archive instead** (primary) · Cancel. (Hard delete only becomes available once dependencies are resolved.)

### Portal not-found (light, branded)
Branded header (logo) + "Page not found" + a single link back to the documentation home. Clean, no setup prompts, no app chrome.

---

## 5. App vs. Portal Theming

- **App system pages + dialogs:** dark, **DS-token-bound**, monochrome (+ safety-red for the destructive/blocked accents). Centered on `bg/canvas`.
- **Portal not-found:** **light, brand-skinned** (consumes the customer Brand Profile, like the rest of the visitor portal — see the two-accent-systems note in `arther-public-portal-ia.md`). The only public-facing error and the only light one here.

---

## 6. Naming Conventions

| State | Title | Primary action |
|---|---|---|
| 404 | **Page not found** | Back to dashboard |
| 403 | **You don't have access** | Request access / Back to dashboard |
| 500 | **Something went wrong** | Try again |
| Offline | **You're offline** | Retry |
| Maintenance | **Down for maintenance** | View status |
| Delete blocked | **Can't delete {entity}** | **Archive instead** |
| Portal 404 | **Page not found** | Go to documentation home |

---

## 7. Component Reuse Map

| Component | Source | Use |
|---|---|---|
| Centered state layout | New (reuses the Auth-card / empty-state pattern) | All app system pages |
| State glyph badge | DS icon set (lock / alert / search) + tinted badge | Page mark |
| Button (Primary / Ghost) | DS **Button** | Recovery actions |
| Confirm dialog (scrim + panel) | New + DS Button (reuses Convert-block / Send-back dialog pattern) | Delete-blocked → archive |
| Branded portal header | Public Portal | Portal not-found |

App states are dark + DS-bound; the portal not-found is light + brand-skinned.

---

## 8. Resolved Decisions (this pass)

1. **Two families** — dark DS app pages + one light branded portal not-found.
2. **Always a way forward** — every error has a primary recovery action; no dead dead-ends.
3. **Archive-instead-of-delete is a first-class dialog**, surfacing the blocking dependents (the matrix's core guard, made visible).
4. **Reassure on transient failure** — 500/offline state that work is auto-saved (the editor auto-saves).
5. **Non-blaming, plain-language copy**; 403 names who to ask.

---

## 9. Out of Scope (this pass)

Inline/in-context errors owned by features (Auth validation, generation failure, import validation, publish-blocked placeholder); the connectivity indicator chip + autosave status (Cross-cutting); the entity-lifecycle cascade *logic* (Error-Handling Matrix + feature specs); expired-invite / reset-link dead-ends (Auth); and the portal's not-yet-published empty homepage (Public Portal, though it shares this not-found rendering).

---

*Arther — System & Error States Information Architecture. Version 0.1, 6 June 2026. Whole-page system states — 404, 403, 500, offline, maintenance — plus the product's signature archive-instead-of-delete dialog (from the Error-Handling & Entity Lifecycle Matrix) and the public portal not-found. App pages are dark + DS-bound and always offer a recovery action; the portal not-found is light + brand-skinned. Errors follow the matrix's "allow the action, surface the consequence" principle: honest, non-blaming, and never orphaning content or breaking a document in review. Extends `arther-app-ia.md`.*
