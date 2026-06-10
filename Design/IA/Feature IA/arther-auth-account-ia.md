# Information Architecture: Arther — Auth & Account

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **authentication & account** surfaces — the product's front door and the per-user account/profile. **Net-new** (beyond the original per-screen roadmap). Grounds in the Onboarding spec v1.1 (workspace bootstrapping, member invite, first-run), the Enterprise-Readiness spec (Decision 3: **email/password + Google OAuth at launch; SSO/SAML deferred**, auth decoupled from identity), and the Workspace Admin spec (roles, invites). Extends `arther-app-ia.md`.
**Decisions this pass:** (1) **two launch auth methods** — email/password and **Continue with Google**; SSO is a deferred, additive provider (no UI at launch beyond a quiet placeholder). (2) The unauthenticated surfaces use a **centered, branded auth card** on a dark canvas — **not** the app shell (no top bar / rail / inspector). (3) **First sign-up → create-workspace** (a new account with no workspace must create one); **invited users → accept-invite → straight into the workspace** (no workspace creation). (4) **No workspace switcher** at launch (multi-workspace is deferred) — the account menu is profile + sign-out, not org-switching. (5) The **account menu + profile settings** live **inside** the app shell (top-bar avatar); per-user **Notifications** already lives in Settings → Notifications.

---

## 1. Purpose & Scope

These are the surfaces a person hits before they're "in," plus the per-user account controls once they are: create an account, log in, recover a password, create or join a workspace, and manage their own profile. They must be fast, conventional (no surprises at the front door), trustworthy (clear security copy, honest errors), and route correctly into the right post-auth destination (new workspace vs. an existing one).

**In scope:** **Log in**, **Sign up**, **email verification** ("check your email"), **Create workspace** (first-run for a new account), **Accept invitation** (invited member), **Forgot password** + **Reset password**, the **account menu** (top-bar avatar dropdown), and the **Profile** settings page (name, email, password, avatar, sign-out / sessions). Auth methods (email/password + Google). The post-auth routing logic. States: loading, field errors, invalid credentials, email-already-registered, expired/invalid invite or reset link, unverified email.

**Out of scope (referenced at the boundary):** the **admin first-run checklist** + member empty (Onboarding spec → already realized on the **Dashboard**); **workspace settings** (name/slug/units/roles/members — Settings IA); **per-user Notifications** (Settings → Notifications); **Ask Arther** onboarding (Cross-cutting IA); **SSO/SAML/OIDC, SCIM provisioning, multi-workspace switching, 2FA/MFA** (all deferred — see §13); billing/plan (Settings placeholder); and the visitor portal's own **magic-link gate** (that's a *document* gate, a different mechanism — Public Portal IA §5).

---

## 2. Where It Sits

The unauthenticated surfaces are **outside the app shell**: a centered **branded auth card** (Arther wordmark + card) on the dark app canvas — no top bar, rail, or inspector, because there is no workspace context yet. They are their own routes under an auth path. Once authenticated, the user is inside the shell; the **account menu** hangs off the **top-bar avatar** (the rightmost utility-cluster item), and **Profile** is a settings-style page. Auth is **decoupled from identity** (Enterprise-Readiness Decision 3): email/password and Google are two providers writing to one normalized user; the UI treats them as parallel choices, never as different account types.

---

## 3. Surface & Route Map

- **Log in** `/login` — email + password · **Continue with Google** · "Forgot password?" · link to Sign up
- **Sign up** `/signup` — name · email · password · **Continue with Google** · link to Log in
  - **Check your email** `/signup/verify` — verification-sent confirmation (resend · change email)
- **Create workspace** `/welcome` — first-run for a brand-new account: workspace name · auto-slug · default units · time zone → enters the app
- **Accept invitation** `/invite/{token}` — "You've been invited to **{workspace}**" → set name + password **or** Continue with Google → joins the workspace
  - **Invalid / expired invite** — clear dead-end + "ask your admin to re-invite"
- **Forgot password** `/forgot` — email entry → "check your email"
- **Reset password** `/reset/{token}` — new password + confirm → success → Log in
  - **Invalid / expired reset link** — clear dead-end + "request a new link"
- **Account menu** — top-bar avatar dropdown: name/email · **Profile** · Settings · Help (Ask Arther) · **Log out**
- **Profile** `/settings/profile` (in-shell) — name · email (+ change/verify) · **change password** · avatar · active sessions / sign out everywhere
- **States:** loading/submitting · field validation · invalid credentials · email already registered · unverified email · expired invite · expired reset link · OAuth error.

---

## 4. Core Flows

1. **New account → workspace:** Sign up (or Google) → verify email → **Create workspace** → land on the **Dashboard** with the admin first-run checklist (Onboarding spec; Dashboard IA).
2. **Invited member → join:** open invite link → **Accept invitation** (set credentials or Google) → land on the **Dashboard** (member first-run empty: "Generate your first document"). No workspace creation.
3. **Returning user:** Log in (email/password or Google) → last location / Dashboard.
4. **Password recovery:** Forgot password → email → Reset password → Log in.
5. **Account management:** top-bar avatar → Account menu → Profile (edit name, change password, avatar, sign out / sign out everywhere).

---

## 5. Region / Content Hierarchy

### Unauthenticated card (Log in / Sign up / Forgot / Reset / Accept invite / Create workspace)
1. **Brand** — Arther wordmark, centered, above the card.
2. **Card** — title + one-line subtext; the relevant fields (DS **Text field**s); a **primary** Button (Log in / Create account / Send reset link / Set password / Create workspace / Join workspace); for Log in & Sign up, a divider + **Continue with Google**; contextual links (Forgot password? · Sign up ↔ Log in).
3. **Footer line** — legal/security microcopy (terms/privacy on sign-up; "links expire in…" on reset).
4. **Accept invite** adds an **invited-to** header (workspace name + inviter) so the user knows what they're joining.
5. **Create workspace** is a single short form (name → live slug preview `{slug}.arther.io` · default units · time zone).

### Account menu (in-shell overlay)
Avatar + name/email header · **Profile** · **Settings** · **Help (Ask Arther ⌘J)** · divider · **Log out**. (No workspace switcher at launch.)

### Profile (in-shell settings page)
Sections: **Profile** (avatar, name, email + verify/change) · **Password** (change password; for Google-only accounts, "set a password" / managed-by-Google note) · **Sessions** (active sessions + "sign out everywhere") · (link to **Notifications** in Settings).

---

## 6. States

Loading/submitting · inline field validation (email format, password strength, confirm-match) · **invalid credentials** (generic "email or password is incorrect" — no account enumeration) · **email already registered** (→ offer Log in) · **unverified email** (resend) · **expired/invalid invite** · **expired/invalid reset link** · **OAuth error / cancelled** · success confirmations (reset done, email sent).

---

## 7. Auth Methods

- **Email + password** — primary; password rules shown inline; recovery via email link.
- **Continue with Google (OAuth)** — parallel on Log in, Sign up, Accept invite; a Google-provisioned account may have no password (Profile shows "set a password").
- **SSO (SAML/OIDC)** — **deferred**; auth is decoupled so SSO arrives as an additive provider. At launch, no SSO entry point (an optional quiet "Single sign-on — coming soon" line may sit under the methods, but is not interactive).

---

## 8. Naming Conventions

| Concept | Label | Notes |
|---|---|---|
| Create account | **Sign up** / **Create account** | |
| Authenticate | **Log in** | not "Sign in" — pick one; "Log in/out" used throughout |
| Third-party | **Continue with Google** | parallel to email/password |
| New org | **Create workspace** | first-run for a new account |
| Join org | **Accept invitation / Join workspace** | invited member |
| Recovery | **Forgot password → Reset password** | tokenized email links |
| End session | **Log out** · **Sign out everywhere** | |
| Per-user prefs | **Profile** | distinct from workspace **Settings** |

---

## 9. Component Reuse Map

| Component | Source | Use |
|---|---|---|
| Auth card | New (auth) | Centered container for all unauth screens |
| Arther wordmark | DS / brand | Above the card |
| Text field (+ states) | DS **Text field** (045ed181…) | All inputs (Error/Filled/Focus states) |
| Button (Primary / Secondary / Ghost) | DS **Button** | Submit + Google + links |
| Divider | DS **Divider** | "or" between password + Google |
| Avatar | DS **Avatar** | Account menu + Profile |
| Account menu | New (overlay) | Top-bar avatar dropdown (reuses the overlay/menu pattern from Cross-cutting) |
| Settings page chrome | Settings IA / app shell | Profile page lives in the section-list Settings shell |

All dark + DS-token-bound (the auth surfaces are part of the app, not the branded portal — so monochrome DS, **not** a customer Brand Profile).

---

## 10. Resolved Decisions (this pass)

1. **Two launch methods** (email/password + Google); SSO deferred/additive; no SSO UI beyond an optional non-interactive note.
2. **Centered branded auth card**, outside the app shell; account menu + Profile inside it.
3. **Routing:** new account → Create workspace → Dashboard (admin checklist); invited → Accept invite → Dashboard (member empty); returning → last location.
4. **No workspace switcher** at launch (multi-workspace deferred).
5. **Honest, non-enumerating errors** (generic invalid-credentials; explicit expired-link dead-ends).

---

## 11. Out of Scope (this pass)

SSO/SAML/OIDC + SCIM provisioning; **2FA/MFA**; multi-workspace membership + switching; the admin first-run checklist + member empty (Dashboard); workspace settings + member management (Settings); per-user Notifications (Settings → Notifications); billing/plan; the visitor portal's document magic-link gate (Public Portal); and Ask Arther onboarding (Cross-cutting).

---

*Arther — Auth & Account Information Architecture. Version 0.1, 6 June 2026. The product's front door: log in / sign up (email-password + Google), email verification, create-workspace (new account) vs. accept-invitation (invited member), password recovery, and the in-shell account menu + Profile settings. Email/password + Google at launch; SSO/SAML, SCIM, 2FA, and multi-workspace switching are deferred (Enterprise-Readiness Decision 3). Centered branded auth card outside the app shell, dark + DS-bound. Grounds in the Onboarding spec v1.1 and extends `arther-app-ia.md`.*
