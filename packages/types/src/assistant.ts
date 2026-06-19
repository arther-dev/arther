import * as z from 'zod/v4';

/**
 * K — Ask Arther (the in-app assistant). Session-scoped, no new tables: the
 * conversation lives in the panel and clears on logout. This module owns the pure,
 * shared pieces — the message/request contracts, the context→module mapping, the
 * launch knowledge base baked into the system prompt (K.7), and the prompt
 * assembly. The streaming transport + the panel UI live in the app; read/write
 * actions (K.4/K.5) and spotlight (K.6) layer on later.
 */

export const ASSISTANT_ROLES = ['user', 'assistant'] as const;
export type AssistantRole = (typeof ASSISTANT_ROLES)[number];

export interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

export const assistantMessageSchema = z.object({
  role: z.enum(ASSISTANT_ROLES),
  content: z.string().min(1).max(8000),
});

/** Context the panel sends with every message (K.2): where the user is. */
export const assistantContextSchema = z.object({
  module: z.string().max(60),
  page: z.string().max(200),
});
export type AssistantClientContext = z.infer<typeof assistantContextSchema>;

export const assistantRequestSchema = z.object({
  messages: z.array(assistantMessageSchema).min(1).max(40),
  context: assistantContextSchema,
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/** The structured reply the gateway returns: a text turn, optionally a search. */
export const assistantReplySchema = z.object({
  reply: z.string(),
  /** K.4 — when the user asks to find their own content, the model requests a search. */
  search: z.object({ query: z.string().min(1).max(120) }).nullable().optional(),
});

/**
 * K.5 — the write/navigate actions the assistant can propose. `navigate` runs
 * immediately (no confirmation, no mutation); `create_*` are **gated**: they're
 * only ever proposed, and execute behind an explicit user confirmation and a
 * `canDo` check (the assistant has no elevated permissions — spec §7). The set is
 * intentionally small; more actions slot into this union as their execute paths
 * are wired (create field, add comment, change document state).
 */
export const ASSISTANT_ACTION_KINDS = ['navigate', 'create_product', 'create_component'] as const;
export type AssistantActionKind = (typeof ASSISTANT_ACTION_KINDS)[number];

export const ASSISTANT_COMPONENT_TYPES = ['assembly', 'module', 'part'] as const;

export const assistantActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('navigate'),
    /** An in-app path the user can jump to (re-validated server-side). */
    path: z.string().min(1).max(200),
    /** A short human name for the destination, e.g. "the Spec database". */
    label: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal('create_product'),
    name: z.string().min(1).max(200),
  }),
  z.object({
    kind: z.literal('create_component'),
    name: z.string().min(1).max(200),
    componentType: z.enum(ASSISTANT_COMPONENT_TYPES).nullable(),
  }),
]);
export type AssistantAction = z.infer<typeof assistantActionSchema>;

/** A write action mutates data — everything except `navigate`. Only write
 *  actions require confirmation + a `canDo` check before they run. */
export function isAssistantWriteAction(action: AssistantAction): boolean {
  return action.kind !== 'navigate';
}

/**
 * K.3/K.4/K.5 — the streaming route's fast first pass: triage one message into
 * (a) whether to search the user's own content and (b) which actions to propose.
 * Returns only decisions (no reply text), so it stays cheap.
 */
export const assistantPlanSchema = z.object({
  search: z.object({ query: z.string().min(1).max(120) }).nullable(),
  /** K.5 — proposed actions (empty when the user only wants an answer). */
  actions: z.array(assistantActionSchema).max(8).default([]),
});

export const ASSISTANT_PLANNER_SYSTEM = [
  'You triage one user message for the Arther in-app assistant. Decide two things, and nothing else — whether to search the user’s OWN content, and which actions to propose. Do not answer the question.',
  'SEARCH: if the user wants to find, list, locate, or open their own documents, spec fields, or components, set `search.query` to the key search terms (a few keywords, no punctuation). For how-to, conceptual, or general questions, set `search` to null.',
  'ACTIONS: only when the user clearly and explicitly asks for one, add it to `actions` — otherwise return an empty list, and never invent an action the user did not ask for:',
  '- `navigate` — they ask to go to / open / take me to a place: set `path` to the in-app route (e.g. /specs, /specs/library, /specs/variants, /documents, /snippets, /settings, /dashboard) and `label` to a short destination name.',
  '- `create_product` — they ask to create or add a new product: set `name`.',
  '- `create_component` — they ask to create or add a new component: set `name` and `componentType` (assembly, module, or part — null if unspecified).',
  'Propose multiple actions only if the user asked for multiple. Creating data always requires the user to confirm afterwards, so propose only what they actually asked for.',
].join('\n');

/** K.5 — the confirm-and-execute request: the batch the panel sends back after
 *  the user confirms. Re-validated and re-authorized (per action) server-side. */
export const assistantExecuteRequestSchema = z.object({
  actions: z.array(assistantActionSchema).min(1).max(8),
});
export type AssistantExecuteRequest = z.infer<typeof assistantExecuteRequestSchema>;

/** K.5 — the per-action outcome the execute route returns for each line item. */
export interface AssistantExecutedAction {
  kind: AssistantActionKind;
  label: string;
  ok: boolean;
  error?: string;
  /** On success, where the new/affected thing lives (for a follow-up link). */
  href?: string;
}

/** A one-line description of a proposed action — the confirm-card line item and
 *  the prompt summary share this wording. Pure. */
export function describeAssistantAction(action: AssistantAction): string {
  switch (action.kind) {
    case 'navigate':
      return `Go to ${action.label}`;
    case 'create_product':
      return `Create product “${action.name}”`;
    case 'create_component':
      return `Create ${action.componentType ?? 'part'} “${action.name}”`;
  }
}

/** Compact summary of proposed actions for the system prompt. */
export function summarizeProposedActions(actions: AssistantAction[]): string {
  return actions.map((a) => `- ${describeAssistantAction(a)}`).join('\n');
}

/** Guard: a navigate target must be an in-app, relative path — no scheme and no
 *  protocol-relative `//host` — so a proposed navigation can never leave the app. */
export function isInternalAssistantPath(path: string): boolean {
  return /^\/(?!\/)[^\s\\]*$/.test(path);
}

/** K.4 — a read-action result card the panel renders inline under the reply. */
export const ASSISTANT_RESULT_KINDS = ['document', 'spec', 'component'] as const;
export type AssistantResultKind = (typeof ASSISTANT_RESULT_KINDS)[number];

export interface AssistantResult {
  kind: AssistantResultKind;
  title: string;
  subtitle: string;
  href: string;
}

/** The /api/assistant response the panel consumes. */
export interface AssistantResponse {
  reply: string;
  results?: AssistantResult[];
}

export const ASSISTANT_RESULT_KIND_LABELS: Record<AssistantResultKind, string> = {
  document: 'Document',
  spec: 'Spec field',
  component: 'Component',
};

/** Route segment → human module name (K.2), shared by the panel + the prompt. */
const MODULE_PREFIXES: Array<[prefix: string, name: string]> = [
  ['/dashboard', 'Dashboard'],
  ['/specs/variants', 'Product variants'],
  ['/specs', 'Spec database'],
  ['/documents', 'Document editor'],
  ['/snippets', 'Block library'],
  ['/settings', 'Settings'],
  ['/welcome', 'Onboarding'],
];

export function assistantModuleForPath(pathname: string): string {
  return MODULE_PREFIXES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Arther';
}

/**
 * K.7 — the launch knowledge base: a compact description of what Arther is and
 * how its surfaces fit together, baked into the system prompt so the assistant can
 * answer "how do I…" without a vector store (the spec defers that until the corpus
 * outgrows the context window). Kept terse and factual.
 */
export const ARTHER_ASSISTANT_KNOWLEDGE = `Arther is a product-documentation platform for hardware teams. Core surfaces:
- Spec database (/specs): products, components, and typed spec fields (scalar, range, toleranced, enum, boolean, table, reference). Field values are versioned; changing one propagates into the documents that cite it and flags stale prose for review.
- Product variants (/specs/variants): a variant is a named set of deltas on a base product (override a field, swap/add/remove a component). Resolved specs are computed from base + deltas at query time. A document can be previewed "as a variant", and blocks can be scoped ALL / DERIVED (shown where a component exists) / MANUAL.
- Document editor (/documents): documents are generated from the spec database and authored as blocks. They move through a lifecycle: Draft → Review (approvals) → Published. Spec values appear as live tokens, never hand-typed.
- Block library / snippets (/snippets): reusable block sequences. A snippet stays live-linked to its source; editing the source propagates to embeds. A document can override an embed locally; archiving a snippet freezes its embeds into static copies.
- Publishing & portal: an approved document is published as a frozen snapshot to a public (or gated) portal page.
- Collaboration: block-anchored comments, @mentions, approval roles, and notifications.
- Settings: brand profiles, document types, quality standards, approval roles, notification preferences.
Roles: owner/admin/member can edit (editors); viewers are read-only.`;

/**
 * K.3/K.7 — assemble the assistant's system prompt: identity + tone, the launch
 * knowledge base, and the live user context (module · page · role). Pure so the
 * route and tests agree on the wording.
 */
export function buildAssistantSystemPrompt(input: {
  context: AssistantClientContext;
  role?: string | null;
  /** K.3 — a compact summary of read-action search hits to weave into the reply. */
  searchSummary?: string | null;
  /** K.5 — a compact summary of the actions you've proposed for this turn. */
  proposalSummary?: string | null;
}): string {
  const role = input.role ?? 'a member';
  const parts: string[] = [
    "You are Arther, the in-app assistant for the Arther product-documentation platform. You help users understand and use Arther: answer how-to questions, explain concepts, orient them, and take a few actions on their behalf. Be authoritative but approachable, and concise — a few sentences or a short list, not an essay.",
    'Ground your answers in the knowledge below. If something isn’t covered, say you’re not sure rather than inventing features.',
  ];
  if (input.searchSummary) {
    parts.push(
      `The user asked to find their own content, and a search returned these items (the panel shows them as clickable cards below your reply):\n${input.searchSummary}\nBriefly point the user to them in one or two sentences; if the list is empty, say nothing matched and suggest a different search.`,
    );
  }
  if (input.proposalSummary) {
    parts.push(
      `You’ve proposed these actions for the user’s request (the panel shows them below your reply — navigation is a one-tap link, and each create action waits for the user to Confirm and runs only if their role allows it):\n${input.proposalSummary}\nTell the user in one sentence what you’ll do, and ask them to confirm any create below. If they’re a viewer (read-only), note they’ll need an editor seat to create content.`,
    );
  }
  parts.push(
    'You can navigate the user to a page and create a product or component in the spec database — always as a proposal the user confirms first, never directly. For anything else (editing field values, documents, comments, settings), guide the user to the right surface rather than claiming you did it.',
    `\nKNOWLEDGE:\n${ARTHER_ASSISTANT_KNOWLEDGE}`,
    `\nCURRENT CONTEXT: the user is a ${role}, in the ${input.context.module} (path ${input.context.page}). Reference this naturally when relevant.`,
  );
  return parts.join('\n');
}

/** Flatten a conversation into a single user turn (the gateway takes system+user). */
export function flattenAssistantConversation(messages: AssistantMessage[]): string {
  return messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Arther'}: ${m.content}`)
    .join('\n\n')
    .concat('\n\nArther:');
}
