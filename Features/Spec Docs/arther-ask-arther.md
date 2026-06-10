# Ask Arther — Feature Specification

**Version:** 1.1
**Date:** May 2026 (rev. 4 Jun 2026)
**Author:** Callum Kelpin
**Status:** Draft
**Changes in v1.1 (4 Jun 2026):** Reconciled with the App Shell IA and `Design/IA/arther-app-ia.md` §11. (1) **Entry point:** Ask Arther is opened from the **top-bar Help icon** and slides in as a panel — it is **no longer a persistent floating character** in the bottom-right corner; the illustrated character remains as the panel's avatar/identity. (2) **Shortcut: `⌘J` / `Ctrl+J`** (not `⌘K`) — the app shell's **command palette owns `⌘K`**, reversing the v1.0 "no command palette is planned" assumption (Resolved Q1). (3) Read + write scope is unchanged. The persistent corner float, viewport-fixed positioning, and always-above-modals behaviours from v1.0 are retired (see §6.1).

---

## 1. Problem Statement

Arther is a powerful, multi-module platform — spec database, AI document generator, visual block editor, publishing portal — with a learning curve that grows with each capability added. New users don't know where to start, experienced users forget how to do infrequent tasks, and everyone occasionally needs help understanding how a spec change propagates or why a document is flagged as stale. Today, the only options are to leave the app and search documentation, or ask a colleague. There is no in-context help that understands what the user is looking at and can take action on their behalf.

The cost of not solving this: slower onboarding, higher support burden, underutilization of powerful features (graph view, smart spec tracking, snippet reuse), and users defaulting to manual workarounds instead of using the system as designed.

---

## 2. Solution Overview

**Ask Arther** is the application's AI assistant, opened from the **Help icon in the top-bar utility cluster** (or with **`⌘J`**). Activating it opens a chat panel that **slides in from the right** without obscuring the current view. Its identity is a small illustrated character — a round, friendly face — shown as the panel's avatar, with expressive status icons (idle, working, done).

Arther is **passive** — it never interrupts or pops up suggestions unprompted; it opens only when the user invokes Help (or `⌘J`). It is **not** a persistent floating element on the canvas (changed in v1.1).

The assistant can **read and write** within the app: it can answer questions about how to use Arther, look up specs and documents, search content, and take actions on the user's behalf — creating specs, updating fields, navigating to pages, and more, each write gated by a confirmation step. Conversation context **persists within the session** and resets on logout or app close.

The character design draws from a set of hand-illustrated icons (documented on the Foundations / Ask Arther page in the design system) featuring a round character with a tuft of dark hair, dot eyes, and a small smile. It now appears as the assistant's **avatar** in the panel header (and optionally the Help control), rather than as a floating character.

---

## 3. Goals

1. **Reduce time-to-answer for "how do I…" questions by 80%** — users get contextual help without leaving the app or searching external docs.
2. **Increase adoption of underused features by 30%** — Arther can surface and demonstrate capabilities like graph view, snippet reuse, and bulk operations when users ask related questions.
3. **Reduce onboarding support tickets by 50%** — new users have an always-available guide that understands their current context.
4. **Maintain task flow** — users can get help and take action without navigating away from their current screen.
5. **Add personality and warmth to the product** — the character reinforces Arther's brand identity as authoritative but approachable.

---

## 4. Non-Goals

1. **Proactive suggestions or nudges** — Arther does not interrupt users with tips, tours, or "did you know" popups. The assistant is passive until clicked. Proactive behavior may be explored in v2 as an opt-in setting.
2. **Document content generation via chat** — Arther can navigate users to the document generator and explain how it works, but the chat interface is not a replacement for the dedicated generation workflow.
3. **Multi-user or shared conversations** — Ask Arther is a single-user assistant. It does not support shared threads, @mentions, or collaborative chat.
4. **Cross-session memory or user profiling** — Conversation history resets each session. Arther does not build a persistent profile of the user's preferences, skill level, or past questions. Persistent memory is a v2 consideration.
5. **Custom character or avatar** — The Arther character is fixed. Users cannot change its appearance, upload custom avatars, or disable the character in favor of a plain chat icon. Customization is out of scope for v1.

---

## 5. User Stories

### Document Author

- As a document author, I want to click the Arther character and ask "how do I insert a spec token into my document" so that I can learn the feature without leaving the editor.
- As a document author, I want to tell Arther "create a new datasheet for the X200 product" so that I can start a new document without navigating through the wizard manually.
- As a document author, I want to ask "which documents reference the voltage rating field" so that I can understand the impact of a spec change before making it.
- As a document author, I want to ask "why is this document flagged as stale" so that I can understand what changed and what I need to review.

### Workspace Administrator

- As a workspace admin, I want to ask Arther "how do I set up an approval workflow for datasheets" so that I can configure review processes without reading documentation.
- As a workspace admin, I want to tell Arther "add a new document type called Installation Guide" so that I can configure the workspace through conversation.

### New User

- As a new user, I want to see a friendly character in the corner that I can click for help so that the application feels approachable despite its complexity.
- As a new user, I want to ask "what should I do first" so that I get a contextual starting point based on the current state of my workspace.
- As a new user, I want to ask Arther to walk me through creating my first spec so that I can learn by doing with guided assistance.

### All Users

- As any user, I want the assistant to understand what screen I'm currently on so that its answers are contextual rather than generic.
- As any user, I want to see Arther's status icon change when it's processing my request so that I know it's working.
- As any user, I want conversation history to persist during my session so that I can refer back to earlier answers without re-asking.

---

## 6. Requirements

### 6.1 Must-Have (P0)

**Character Display**

Ask Arther is reached from the **Help icon in the top-bar utility cluster** on every screen; it does **not** float in the bottom-right corner (changed in v1.1). The illustrated character renders as the assistant's **avatar** — in the chat panel header, and optionally on the Help control. The avatar is approximately 48×48px in the panel header, with a status icon.

- [ ] A **Help** affordance is present in the top-bar utility cluster on every screen (dashboard, spec DB, editor, documents, settings)
- [ ] Invoking Help (click or `⌘J`) opens the Ask Arther panel with the character avatar in its header
- [ ] When closed, the assistant occupies none of the canvas and obscures nothing (no floating element)
- [ ] The character avatar is legible in both light and dark mode with appropriate contrast

The status-icon and animation behaviours described below apply to this **avatar** (panel header / Help control). The v1.0 persistent corner float, viewport-fixed positioning, "always visible above modals", and idle-in-corner behaviours are **removed**.

**Status Icon System**

The character displays a single status icon floating above its head that reflects its current state. Icons transition with a subtle animation (pop-in with slight bounce, ~200ms).

| State | Icon | Trigger |
|-------|------|---------|
| Idle / Ready | Chat bubble (speech dots) | Default resting state |
| Searching | Magnifying glass | Processing a user query, looking up information |
| Complete | Checkmark | Action completed successfully |
| Error | — (uses chat text) | Error communicated in chat panel, not via icon |
| Sleeping | ZZZ | App idle for >5 minutes with no user interaction |
| Celebration | Sparkle/confetti | User completes a milestone (first spec, first publish, etc.) |

- [ ] Status icon reflects current assistant state in real time
- [ ] Icon transitions use a pop-in bounce animation (~200ms ease-out)
- [ ] Idle state returns after 3 seconds of showing a transient state (Complete, Celebration)
- [ ] Sleeping state triggers after 5 minutes of app inactivity
- [ ] Any user interaction (mouse move, keypress) wakes Arther from sleep to idle

**Idle Animation**

The character has a constant subtle idle animation to feel alive — a gentle vertical float (2–3px amplitude, ~3s sinusoidal loop). On hover, the character scales up slightly (1.05×) and the eyes widen. The animation respects `prefers-reduced-motion` — when enabled, the float animation is disabled and hover uses opacity change instead of scale.

- [ ] Gentle float animation runs continuously at rest (~3s loop, 2–3px vertical)
- [ ] Hover state: scale to 1.05× with slight shadow increase, eyes widen
- [ ] Click state: character does a small bounce (squash-and-stretch, ~150ms)
- [ ] Celebration state: character does a small jump (4–6px vertical) with sparkle icon bursting in
- [ ] All animations collapse to simple opacity fades when `prefers-reduced-motion` is active (including hover — opacity change instead of scale)
- [ ] Cursor changes to pointer on hover

**Chat Panel — Opening and Closing**

Clicking the **Help** icon (or pressing **`⌘J`**) opens the chat panel, which **slides in from the right** edge of the screen. The panel is approximately 380px wide × 520px tall. It opens with a slide+fade animation (~250ms ease-out). Clicking Help again, pressing Escape, or clicking outside the panel closes it.

- [ ] Help icon (or `⌘J`) toggles the chat panel open/closed
- [ ] Panel slides in from the right with a slide+fade animation (~250ms)
- [ ] Panel closes on: second activation, Escape key, click outside panel
- [ ] Panel does not extend beyond viewport bounds
- [ ] Opening the panel does not disrupt the user's current work (no page navigation, no focus steal from editor)
- [ ] Panel has a visible close button (×) in the header

**Chat Panel — Layout**

The chat panel contains a header with the Arther character name and close button, a scrollable message area, and a text input with send button at the bottom. Panel dimensions: 380px wide × 520px tall (max), ~280px tall (min). Opens at max height regardless of conversation length.

- [ ] Header: "Ask Arther" label + close (×) button
- [ ] Message area: scrollable, newest messages at bottom, auto-scrolls on new messages
- [ ] User messages: right-aligned, accent-colored background
- [ ] Arther messages: left-aligned, surface-colored background, preceded by small Arther avatar
- [ ] Text input: single-line with auto-expand to max 4 lines, placeholder "Ask me anything…"
- [ ] Send button: enabled only when input is non-empty, also triggered by Enter key
- [ ] Shift+Enter inserts a newline in the input
- [ ] Loading state: animated typing indicator (three dots) in Arther's message bubble while processing

**Chat Panel — Contextual Awareness**

The assistant receives context about the user's current location in the app with every message. This context is injected automatically — the user does not need to describe where they are.

- [ ] Context includes: current module (dashboard, spec DB, editor, documents, settings), current page/view, selected item (if any), user role
- [ ] Context is sent with every message, not just the first
- [ ] Arther references the user's current context naturally: "I can see you're in the editor working on the X200 Datasheet…"
- [ ] If the user asks about something on a different screen, Arther can offer to navigate them there

**LLM Integration**

The assistant uses Claude (Anthropic) as the LLM backend, consistent with Arther's existing AI infrastructure. The system prompt includes Arther product knowledge, the user's current app context, and available actions.

- [ ] LLM backend: Claude (Anthropic), same provider as document generator
- [ ] System prompt includes: full Arther feature documentation, current user context, list of available actions with schemas
- [ ] Responses stream token-by-token into the chat panel (not delivered as a single block)
- [ ] Response latency target: first token within 1 second, full response within 5 seconds for informational queries
- [ ] Arther maintains a warm, knowledgeable tone consistent with the product's "authoritative but approachable" brand voice
- [ ] Arther declines requests outside its capability with a helpful redirect ("I can't do that yet, but here's how you can do it manually…")

**Read Actions**

Arther can look up and surface information from across the application.

- [ ] Search and retrieve spec field values by name, product, or component
- [ ] Search and list documents by title, type, status, or product
- [ ] Look up document staleness status and explain why a document is flagged
- [ ] Search snippets by name or category
- [ ] Explain relationships: which documents reference a given spec field, which components belong to a product
- [ ] Read results are presented inline in the chat as formatted cards (not raw data)

**Write Actions**

Arther can perform actions within the app on the user's behalf. Actions use a **progressive batching** model: read-only actions execute immediately, write actions are batched into a single confirmation.

- [ ] **Immediate (no confirmation):** Navigate to a specific page, document, spec, or setting. Look up and display information.
- [ ] **Confirmation required:** Create a new product or component in the spec database
- [ ] **Confirmation required:** Create or update spec field values
- [ ] **Confirmation required:** Create a new document via the generation pipeline (opens wizard pre-filled)
- [ ] **Confirmation required:** Add a comment to a document
- [ ] **Confirmation required:** Change a document's workflow state
- [ ] **Progressive batching:** When a request involves multiple write actions, Arther executes any read/navigate actions immediately, then presents all write actions in a single confirmation card showing each action as a line item. User confirms or cancels the entire batch.
- [ ] Confirmation UI: Arther presents proposed write actions as a card with action line items, "Confirm" and "Cancel" buttons
- [ ] After execution, Arther reports success/failure and the status icon updates accordingly

**Session Memory**

Conversation persists within the current session. Arther can reference earlier messages in the same conversation.

- [ ] Full conversation history maintained in memory during the session
- [ ] Arther can reference earlier messages: "Earlier you asked about the X200 — do you want me to…"
- [ ] History is cleared on logout or app close
- [ ] No conversation data is stored server-side beyond the active session
- [ ] Conversation history is not shared across browser tabs (each tab has its own session)

### 6.2 Nice-to-Have (P1)

**Suggested Prompts**

When the chat panel opens with no conversation history, display 3 contextual suggested prompts based on the current screen.

- [ ] Dashboard: "What needs my attention?", "Show me stale documents", "What's changed since yesterday?"
- [ ] Spec DB: "Explain this product's component structure", "Which fields are missing values?", "Show me the version history for this field"
- [ ] Editor: "How do I insert a spec token?", "What's the staleness status of this document?", "Help me add a safety block"
- [ ] Suggested prompts are clickable — clicking one sends it as a message

**Rich Response Formatting**

Arther can render structured content in responses beyond plain text.

- [ ] Clickable deep links to specific pages, documents, specs, or settings
- [ ] Inline data tables for spec lookups
- [ ] Step-by-step numbered instructions with visual callouts
- [ ] Code/formula blocks for template syntax

**Keyboard Shortcut**

A global keyboard shortcut toggles the Ask Arther panel.

- [ ] Default shortcut: **`Cmd+J` (Mac) / `Ctrl+J` (Windows)** — `⌘K` is reserved for the app shell's command palette
- [ ] Shortcut is customizable in settings
- [ ] Opening via shortcut focuses the text input immediately

**Celebration States**

Arther reacts to user milestones with the celebration status icon and a brief ambient animation.

- [ ] First spec created
- [ ] First document generated
- [ ] First document published
- [ ] All review approvals received on a document
- [ ] Celebrations are subtle and brief (~2 seconds), never blocking

### 6.3 Future Considerations (P2)

**Proactive Mode (opt-in)** — User can enable a mode where Arther occasionally surfaces contextual tips: "You've been editing for 20 minutes — want me to check for stale tokens?" Disabled by default.

**Cross-Session Memory** — Arther remembers the user's past questions, preferred workflows, and expertise level across sessions. Uses this to personalize responses and avoid repeating explanations.

**Multi-Modal Input** — Users can paste a screenshot or describe a UI element they're confused about, and Arther identifies it and explains its function.

**Custom Arther Moods** — Workspace admins can configure Arther's personality (more formal, more casual) or add custom status icons for team-specific events.

**Onboarding Integration** — Arther is available from the start (see Resolved Questions #3), but a structured conversational onboarding flow — where Arther proactively walks new users through their first product, first spec, and first document step-by-step — is a v2 enhancement on top of the baseline availability.

---

## 7. Success Metrics

### Leading Indicators (Days to Weeks)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Chat activation rate | 40% of active users open the chat panel within first week | Analytics: panel open events / active users |
| Questions per session | ≥1.5 messages per chat session on average | Analytics: message count per session |
| Action completion rate | 70% of write actions proposed by Arther are confirmed and executed | Analytics: confirm clicks / action proposals |
| Contextual accuracy | 85% of responses rated helpful (implicit: user doesn't immediately re-ask or rephrase) | Analytics: follow-up rate after response |

### Lagging Indicators (Weeks to Months)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Support ticket reduction | 50% reduction in "how do I…" support tickets within 60 days | Support system analytics |
| Feature discovery | 30% increase in usage of graph view, snippet reuse, and bulk operations within 90 days | Product analytics: feature usage |
| New user activation | 20% improvement in time-to-first-publish for new users | Cohort analysis |
| Retention impact | 5% improvement in 30-day retention for users who engage with Arther vs. those who don't | Cohort comparison |

---

## 8. Technical Considerations

**LLM Provider**: Claude (Anthropic) — consistent with the existing document generator. The Ask Arther system prompt is a separate prompt from the document generation prompt, optimized for conversational help and action execution rather than long-form content generation.

**Context Window Management**: Each message includes the current app context (module, page, selected item) plus the full conversation history. For long sessions, older messages may be summarized to stay within context limits.

**Action Execution**: Write actions are executed via the same internal APIs used by the application UI. Arther does not have elevated permissions — it can only do what the current user's role allows. If a user doesn't have permission to perform an action, Arther explains why and suggests who to contact.

**Streaming**: Responses are streamed via SSE (Server-Sent Events) to provide token-by-token rendering in the chat panel, matching the streaming pattern used in document generation.

**Rate Limiting**: Ask Arther shares the workspace's LLM usage quota. Heavy chat usage counts against the same limits as document generation. If limits are reached, Arther informs the user and suggests trying again later.

**Privacy**: Conversation content is not logged or stored beyond the active session. No conversation data is used for model training. Enterprise customers can disable Ask Arther at the workspace level via admin settings.

---

## 9. Resolved Questions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Should `Cmd+K` be the shortcut, or does it conflict with the command palette? | **`Cmd+J` / `Ctrl+J`** *(revised v1.1)* | The app shell **does** have a command palette that owns `⌘K` (App Shell IA §5.4). Ask Arther uses `⌘J` instead; the v1.0 "no command palette is planned" assumption is reversed. |
| 2 | What is the LLM usage cost per chat message, and how does this affect the pricing model? Should chat messages have a separate quota from document generation? | **Shared quota** | Chat messages and document generation share the same monthly LLM token pool. Simpler billing model, avoids confusing users with two separate meters. Heavy chat usage naturally trades off against generation capacity, which is self-regulating. |
| 3 | Should Arther be available during the onboarding flow (before the workspace is fully set up), or only after setup is complete? | **Available from the start** | Arther is visible and fully functional from the moment the user enters the workspace — including during initial setup. It can guide users through onboarding, answer setup questions, and reduce the need for a separate onboarding tutorial. |
| 4 | How should Arther handle requests that involve multiple write actions in sequence? | **Progressive batching** | Read-only actions (navigate, look up) execute immediately with no confirmation. Write actions are collected and presented in a single confirmation card showing each action as a line item. Users review and confirm or cancel the batch. This balances speed for power users with safety for destructive operations. |
| 5 | Should the character illustrations be SVG or raster PNG? | **Careful SVG redraw/trace** | The existing raster illustrations will be redrawn as SVG, intentionally preserving the hand-drawn imperfections in the path data rather than cleaning them up. This enables the full animation system (idle float, squash-and-stretch, per-element motion like eye widening on hover, stroke animation) while maintaining the organic, hand-drawn character of the originals. |

---

## 10. Timeline Considerations

**Dependencies**: Ask Arther depends on stable internal APIs for read and write operations across all modules. The spec database API, document management API, and navigation API must be available and documented.

**Phasing**:
- **Phase 1 (MVP)**: Character display, status icons, idle animation, chat panel, LLM integration, read actions, session memory. Ship as beta.
- **Phase 2**: Write actions with confirmation, suggested prompts, rich response formatting, keyboard shortcut. Promote to GA.
- **Phase 3**: Celebration states, proactive mode (opt-in), cross-session memory.

**Hard constraint**: The character illustrations on the Foundations / Ask Arther page must be carefully redrawn/traced as SVG (preserving hand-drawn imperfections in the path data) before Phase 1 UI work begins. The SVG format is confirmed — see Resolved Questions #5.
