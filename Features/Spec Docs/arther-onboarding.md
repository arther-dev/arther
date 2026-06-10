# Arther — Onboarding & First-Run Experience

**Version:** 1.1
**Date:** May 2026 (rev. 4 Jun 2026)
**Status:** Specification complete — greenfield design
**Changes in v1.1 (4 Jun 2026):** The AI assistant is now **Ask Arther** (defined in the Ask Arther spec) — **read + write** (it can take actions on the user's behalf behind a confirmation step), opened from the **top-bar Help icon** (shortcut ⌘J), not a bottom-right button. The earlier "explains and directs only / takes no actions" scope is retired; spotlight remains the teaching mechanism and is owned by Ask Arther. Aligns with the decisions in `Design/IA/arther-app-ia.md` §11.

---

## 1. Overview

### 1.1 Philosophy

Arther's onboarding philosophy is a single principle: **no mandatory tutorials, no training modules, no forced walkthroughs.** Users are not required to complete any onboarding sequence before accessing the product. They are not gated behind explainer screens. They are not walked through a multi-step setup wizard before they can do anything.

Instead, Arther embeds **Ask Arther** — the product's AI assistant (defined in the Ask Arther spec) — throughout the product, available from the top-bar Help icon. Users can ask anything at any time. The assistant answers in plain language, can visually highlight the exact element the user needs (spotlight), and can take actions on the user's behalf behind a confirmation step. Learning happens when the user needs it, not upfront.

The one exception is the admin first-run experience, which surfaces a lightweight setup checklist — not a wizard or tutorial, just a clear statement of what needs to be configured before the workspace is ready for use, with direct links to each setting.

### 1.2 Scope

This document specifies the AI assistant surface and its spotlight mechanism, the admin first-run checklist, the member first-run experience, and the empty state patterns used throughout the product. It does not specify the AI assistant's underlying model or knowledge base architecture — those are engineering decisions. It specifies what the assistant can do and how it presents itself to users.

---

## 2. The AI Assistant

### 2.1 Surface

The AI assistant — **Ask Arther** — is available on every screen via a persistent **Help** entry in the **top-bar utility cluster**. Activating it (or pressing ⌘J) opens a chat panel that slides in from the right without obscuring the current view. (Ask Arther's full surface, action model, and shortcut are defined in the Ask Arther spec; this document covers its onboarding role.)

The chat panel has a single input: a free-text field with the placeholder *"Ask me anything about Arther."* The panel retains conversation history for the current session. Opening and closing the panel does not clear the conversation — the history persists until the user explicitly clears it or ends their session.

The assistant answers questions about how to use Arther **and** can act on the user's behalf — looking things up, and creating or editing specs, fields, and documents — with a confirmation step before any write. For onboarding, the behaviours that matter are its plain-language answers and the spotlight (below).

### 2.2 Response Format

Assistant responses are concise and actionable. Each response has two parts:

**Text answer** — a plain-language explanation of what to do, written in direct second-person. No jargon, no cross-references to documentation pages. Example:

> To create a new Document Type, go to Settings → Document Types and click **New Document Type**. From there you can name it, define its approval roles, and assign a default Brand Profile.

**Spotlight (when applicable)** — if the answer involves a specific UI element the user needs to interact with, the assistant triggers a spotlight overlay on that element in the background. The overlay dims the rest of the interface and highlights the target element with a soft ring and a label. The spotlight is triggered automatically with the text response — the user does not need to request it separately.

If the user is not currently on the screen where the relevant element lives, the spotlight is not triggered. Instead, the text response includes a direct link that navigates the user to the correct screen, after which the assistant can spotlight the element if asked again.

### 2.3 Spotlight Mechanism

The spotlight system works by maintaining a registry of named UI elements — every significant interactive element in Arther (buttons, nav items, form fields, panels) has a stable identifier. When the assistant determines that a response involves a specific element, it includes that element's identifier in its response payload. The frontend intercepts this identifier, looks up the element in the registry, and renders the spotlight overlay on top of it.

The spotlight overlay:
- Dims everything except the target element
- Draws a soft animated ring around the target
- Displays a one-line label above or below the element confirming what it is ("New Document Type button")
- Dismisses on click anywhere, or automatically after 5 seconds

The spotlight is non-blocking — the user can interact with the highlighted element while the overlay is active. Clicking the element dismisses the spotlight and proceeds with the action normally.

### 2.4 Scope Boundaries

Ask Arther **can** read workspace data and take write actions (create/edit specs, fields, documents) on the user's behalf, each behind a confirmation step — see the Ask Arther spec for the action model. It still **does not**:
- Answer questions outside of how to use Arther (general questions about documentation standards, hardware industry practices, etc. are out of scope)
- Provide help for, or act on, screens or features that are post-launch placeholders
- Exceed the current user's permissions — it can only do what the user's role allows

When a user asks something outside scope, the assistant responds with a brief, honest acknowledgement: *"I can only help with questions about using Arther. For that, try..."* followed by a redirect to the most relevant Arther feature.

---

## 3. Admin First-Run Experience

### 3.1 The Bootstrapping Problem

When a workspace is first created, it is empty: no Document Types, no Brand Profiles, no products, no members. No member can generate a document until at least one Document Type and one Brand Profile exist. The admin must configure these before the workspace is useful.

Without any structure, a new admin landing on an empty workspace has no signal about where to start. The AI assistant is available, but expecting every admin to know to ask "what do I set up first?" is too much friction.

### 3.2 The Setup Checklist

When an admin logs into a workspace for the first time — or any time the workspace has not yet completed the minimum required configuration — a **setup checklist** is displayed prominently on the workspace home screen.

The checklist is not a wizard. It does not enforce an order. It does not gate the user from accessing other parts of the product. It is simply a list of the things that need to exist before the workspace is ready, each with a direct link.

**Checklist items:**

| Item | Link destination | Done when |
|---|---|---|
| Create your first Brand Profile | Settings → Brand Profiles → New | At least one Brand Profile exists |
| Create your first Document Type | Settings → Document Types → New | At least one Document Type exists (with at least one approval role configured) |
| Invite your team | Settings → Members → Invite | At least one member has been invited (not required — this item can be dismissed) |
| Add your first product | Spec Database → New Product | At least one product exists in the Spec Database |

Each item shows a checkmark when its condition is met. The checklist collapses automatically — not disappears, collapses to a small summary banner — once all required items are complete. The admin can dismiss the collapsed banner permanently. The invite item can be dismissed without completing it, since a solo admin may want to configure the workspace fully before inviting others.

### 3.3 AI Assistant During Setup

The AI assistant is available throughout the setup process. Each empty state screen (Brand Profiles, Document Types, Spec Database) includes a contextual nudge: *"Not sure where to start? Ask the assistant."* alongside the Help button. This is the only explicit prompt — it appears once on empty states and not again once the user has interacted with the assistant.

---

## 4. Member First-Run Experience

### 4.1 Joining the Workspace

When a member accepts a workspace invitation and logs in for the first time, they land on the workspace home screen. There is no welcome modal, no tutorial prompt, no "let's get you started" sequence.

The home screen shows:
- Their document list (empty on first login)
- A single contextual prompt in the empty state: *"Generate your first document to get started."* with a **New Document** button
- The AI assistant available via the persistent Help button

That is the entirety of the member first-run experience. The product is immediately usable. The AI assistant is there if they need it.

### 4.2 First Document Generation

Clicking **New Document** opens the document generation flow, which asks the member to select a product and a Document Type. If both exist in the workspace (which they do if the admin has completed setup), the member can generate their first document immediately.

The generation flow itself contains brief inline labels on each step — not a tutorial, just clear field labels and helper text — so a first-time user understands what they are selecting without needing external guidance.

### 4.3 No Role-Based Onboarding Differences

Members who have been assigned as Approvers on specific Document Types do not receive any different onboarding. Their first encounter with the approval workflow happens naturally when they receive a review request notification. The notification email provides sufficient context — it names the document, the document owner, and the action required. The AI assistant handles any questions about how the review process works.

---

## 5. Empty State Patterns

Empty states throughout the product follow a consistent pattern: a brief one-sentence description of what this area does, a primary action button, and a contextual AI assistant nudge on first visit only.

| Screen | Empty state description | Primary action |
|---|---|---|
| My Documents | "Your documents will appear here once you've generated them." | New Document |
| Spec Database | "Add your products and components to start building your spec library." | New Product |
| Block Library (Content Reuse) | "Save reusable content blocks here to use them across documents." | — (no primary action; blocks are saved from the editor) |
| Brand Profiles (admin) | "Brand Profiles define the visual and tonal identity of your documents." | New Brand Profile |
| Document Types (admin) | "Document Types define the structure and approval process for each type of document you produce." | New Document Type |
| Published Portal | "No documents have been published yet." | — (portal-side only; no action for visitors) |

Empty states do not include illustration graphics or decorative elements. They are functional: tell the user what the screen is for and give them a way to populate it.

---

## 6. Design Decisions

| Decision | Rationale |
|---|---|
| No mandatory tutorials or training modules | Forced onboarding sequences assume that all users need the same introduction at the same pace. They add friction before the user has experienced any value. A product with real complexity is better served by contextual help available on demand than by a linear introduction that most users will click through without retaining. |
| AI assistant as primary onboarding mechanism | The assistant answers the specific question the user has at the moment they have it. This is more efficient than any tutorial, which addresses questions the user may not yet have. The assistant also scales: adding new features does not require updating a tutorial flow, only ensuring the assistant's knowledge base reflects the new feature. |
| Spotlight for teaching; actions behind confirmation | Spotlight eliminates the "but where is that button?" friction and teaches the UI. Ask Arther can also *act* (read+write) — but every write is gated by a confirmation step, which keeps the user in control without forcing them to hunt for a button when they would rather the assistant just did it. *(Updated v1.1: the original "no action-taking" stance is superseded by the Ask Arther read+write decision.)* |
| Admin checklist, not a wizard | A wizard enforces an order and creates the impression that setup is a one-time linear process. A checklist communicates what needs to exist without prescribing when or in what order. Admins can configure Brand Profiles before Document Types or vice versa — the checklist does not care. |
| Invite item is dismissible in the checklist | Some admins will want to fully configure the workspace before inviting anyone. Making the invite item required would force them to invite a placeholder or skip the step in a way that feels like a failure state. Dismissible means the checklist can be completed on the admin's own terms. |
| Checklist collapses rather than disappears | A checklist that disappears entirely on completion provides no signal to a returning admin that setup is done. A collapsed banner is a persistent, low-profile confirmation that the workspace is ready. Admins can dismiss it when they no longer need the reassurance. |
| No role-based onboarding differences for members | Customising the first-run experience per workspace role (Owner, Admin, Member, Approver) adds significant onboarding surface area for marginal gain. The AI assistant handles role-specific questions on demand. The review workflow is self-explanatory in context. |
| Contextual AI nudge on empty states, first visit only | Showing the nudge on every visit to an empty screen becomes noise. Showing it once on first visit gives the user the signal they need without becoming a persistent annoyance once they know the assistant exists. |

---

*Arther — Onboarding & First-Run Experience. Version 1.0, May 2026. No mandatory tutorials or training modules. AI assistant with spotlight mechanism as the primary onboarding tool. Admin first-run: lightweight setup checklist (Brand Profile, Document Type, team invite, first product) with direct links. Member first-run: clean home screen, immediate access to document generation. Empty states: functional, consistent, with a one-time AI assistant nudge.*
