# Vibecode Launch Readiness — Best Practices

A pre-launch audit checklist for AI-assisted (vibe-coded) apps. Work through each section before shipping anything to real users. Mark each item as:

- ✅ **Pass** — confirmed good
- ⚠️ **Needs attention** — present but incomplete
- ❌ **Fail** — missing or broken; do not ship until resolved
- ➖ **N/A** — not applicable to this project

---

## 1. Infrastructure

- [ ] Real domain configured (not a localhost or preview URL)
- [ ] SSL certificate active and auto-renewing
- [ ] Development and production environments are separate
- [ ] Environment variables set in production (not hardcoded, not in public files)
- [ ] `.env` files are in `.gitignore`
- [ ] Security headers configured (Content-Security-Policy, X-Frame-Options, etc.)

**If unsure about security headers**, run this prompt against the codebase:
> "Review my app as a security specialist and make sure I have strong security headers and a solid baseline security posture"

---

## 2. Authentication & Security

- [ ] Token-based auth (JWT) in use — not session-based
- [ ] Email verification required on signup
- [ ] Rate limiting on all API endpoints
- [ ] Input validation on all user-facing fields
- [ ] Basic bot protection in place (honeypot, CAPTCHA, or equivalent)
- [ ] No sensitive data (passwords, keys, PII) logged to console or error trackers
- [ ] App checked against OWASP Top 10 (SQL injection, XSS, broken auth, etc.)

**Run this prompt for an OWASP review:**
> "Review my app against OWASP standards and highlight vulnerabilities"

---

## 3. Data Leakage & Row-Level Security

> ⚠️ This is the most commonly missed category in vibe-coded apps.

- [ ] No `.env` values or secrets appearing in frontend/client-side code
- [ ] API responses return only the data the client actually needs — not full database rows or internal fields
- [ ] No secrets, tokens, or PII appearing in server logs
- [ ] No API keys exposed in browser network calls (open DevTools → Network tab and check)
- [ ] **Row-level security (RLS) is enforced on all data tables** — AI almost never adds this. Log in as a second test user, change a `user_id` in a request, and verify you cannot see another user's data. If you can, your app is one curious user away from a disaster.
- [ ] **Credentials have never been pasted into an AI chat session.** Every AI conversation is stored on a platform whose security posture you do not control (Lovable's recent breach exposed exactly this). Rotate every secret you have ever pasted into an AI tool. Today, not eventually.

**If your key is visible in the browser, assume it's already been taken. Fix: move it server-side or use a proxy.**

**Run this prompt to catch leaks:**
> "Check my app for any credential or sensitive data leaks in frontend or API routes"

**Run this prompt to catch exposed keys:**
> "Ensure no API keys are exposed in frontend code or network calls"

---

## 4. Database

- [ ] All schema changes were made via migration files — not direct edits
- [ ] Indexes exist on columns used in WHERE and JOIN clauses
- [ ] Automated database backups are configured
- [ ] Production database is not shared with development
- [ ] Migrations have been run in production and confirmed

---

## 5. Payments

> Skip if no payments involved.

- [ ] Payment flow tested end-to-end with a real card (not just test mode)
- [ ] **Webhook handling covers the full post-sale lifecycle, not just success.** You must explicitly handle: `subscription.updated`, `subscription.deleted`, `invoice.payment_failed`, and `charge.refunded`. Without these, cancelled users keep accessing paid features and refunds do not lock access. Non-negotiable.
- [ ] Subscription cancellation flow works and was tested
- [ ] Failed payment behavior defined (grace period? immediate lock?)
- [ ] Receipts or confirmation emails send correctly

---

## 6. Duplicate Workflows

> A silent vibe-coding failure mode. AI-assisted apps commonly accumulate duplicate logic from re-prompting the same feature with different wording weeks apart — two workflows fire on the same trigger, welcome emails send twice, Stripe gets hit twice on signup.

- [ ] Sort all functions, routes, and background workflows alphabetically and scan for near-duplicates. Almost always at least one exists.
- [ ] Each trigger (signup, payment, webhook event) fires exactly one handler — confirmed by reading the code, not just by testing

---

## 7. Error Handling & Observability

> Silent failures are a top cause of user churn in vibe-coded apps. Most AI-generated apps show a white screen or spin forever when an external API call fails — users refresh once and leave.

- [ ] Error monitoring is set up (Sentry free tier takes ~10 minutes to wire in)
- [ ] User-facing error messages exist everywhere the app calls an external API — no silent failures or white screens
- [ ] Ask: "What does the user see when [the OpenAI/Stripe/etc. call] fails?" If the answer is vague, it's broken.
- [ ] Long operations run as background jobs, not inline
- [ ] Long lists are paginated (no unbounded queries)
- [ ] Page load tested under realistic data volume (not just empty test data)

---

## 8. User Flows

- [ ] Happy path tested with a real user account (not admin/test)
- [ ] Edge cases tested: empty states, invalid inputs, network failure
- [ ] Mobile tested if the app has mobile users
- [ ] Onboarding flow works for a brand new user with no data

---

## 9. Legal & Compliance

> You're in legal territory the moment you collect any user data. You don't need to be perfect, but you do need to not be reckless.

- [ ] Privacy policy published and linked — explains how data is stored and handled
- [ ] Terms of service published and linked
- [ ] Cookie consent in place if serving EU users (GDPR)
- [ ] Data retention policy defined — you know what you store and for how long
- [ ] No obviously problematic handling of user data (sharing, selling, excessive collection)

---

## Audit Output Format

After working through the checklist, produce:

**Summary**: One sentence on overall readiness.

**Blockers** (❌ items): List each with a one-line fix recommendation. Nothing ships until these are resolved.

**Warnings** (⚠️ items): List each with a recommendation. These won't kill the launch but should be scheduled for the first week post-launch.

**Recommended follow-up prompts**: Any of the active review prompts above that haven't been run yet.

**Ship it?**: A clear YES / NO / YES WITH CAVEATS.

---

## Tips for Running the Audit

1. Open browser DevTools → Network tab and check what API responses actually return. This is the fastest way to catch overly verbose responses that AI tools commonly generate.
2. Log in as a second test user and manually probe the API with a different `user_id`. This is the fastest way to catch unauthorized data access that AI tools commonly miss.
3. Don't guess on ❌ items — if you're not sure, investigate before marking pass.
