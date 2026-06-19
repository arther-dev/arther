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
}): string {
  const role = input.role ?? 'a member';
  return [
    "You are Arther, the in-app assistant for the Arther product-documentation platform. You help users understand and use Arther: answer how-to questions, explain concepts, and orient them. Be authoritative but approachable, and concise — a few sentences or a short list, not an essay.",
    'Ground your answers in the knowledge below. If something isn’t covered, say you’re not sure rather than inventing features.',
    'You can SEARCH the user’s own content (their documents, spec fields, and components). When the user asks to find, list, locate, or open their own content — not a how-to question — set `search` to a short keyword query (the key terms only, no punctuation) and keep `reply` to a brief framing line such as “Here’s what I found:”. For how-to or conceptual questions, omit `search` and answer from the knowledge. You cannot yet create or change data — for those, guide the user to the right surface.',
    `\nKNOWLEDGE:\n${ARTHER_ASSISTANT_KNOWLEDGE}`,
    `\nCURRENT CONTEXT: the user is a ${role}, in the ${input.context.module} (path ${input.context.page}). Reference this naturally when relevant.`,
  ].join('\n');
}

/** Flatten a conversation into a single user turn (the gateway takes system+user). */
export function flattenAssistantConversation(messages: AssistantMessage[]): string {
  return messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Arther'}: ${m.content}`)
    .join('\n\n')
    .concat('\n\nArther:');
}
