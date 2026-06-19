import { NextResponse } from 'next/server';
import { createAiGateway } from '@arther/ai-gateway';
import { getActiveWorkspace, searchWorkspace } from '@arther/db';
import {
  ASSISTANT_PLANNER_SYSTEM,
  assistantPlanSchema,
  assistantRequestSchema,
  buildAssistantSystemPrompt,
  flattenAssistantConversation,
  type AssistantResult,
} from '@arther/types';
import { getSupabaseServer } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * K.1/K.3/K.4/K.7 — Ask Arther chat. Authenticated members only; the conversation
 * is session-scoped (sent up each turn, never stored). Two passes: a cheap
 * structured **planner** decides whether to search the user's content (K.4), then
 * the prose answer is **streamed** token-by-token (K.3). The transport is NDJSON —
 * one `{type:'results'}` line (if any) followed by `{type:'delta'}` lines — so the
 * panel can render the result cards and the live-typed reply together. Grounded in
 * the K.7 knowledge base + the user's live context. Backed by the one ai-gateway
 * (ADR-007).
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await getSupabaseServer();
  if (!supabase) return ndjsonNotice('The assistant isn’t available in this environment yet.');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const gateway = createAiGateway({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (!gateway.provisioned) {
    return ndjsonNotice(
      'I’m not connected to a model in this environment yet, so I can’t answer right now. Once the workspace is fully provisioned I’ll be able to help.',
    );
  }

  const workspace = await getActiveWorkspace(supabase).catch(() => null);
  const userTurn = flattenAssistantConversation(parsed.data.messages);

  // Pass 1 — planner: does the user want to find their own content? (Cheap; a
  // failure just means "don't search" — the answer still streams.)
  let query: string | null = null;
  try {
    const plan = await gateway.structured({
      schema: assistantPlanSchema,
      system: ASSISTANT_PLANNER_SYSTEM,
      user: userTurn,
      maxTokens: 128,
    });
    query = plan.search?.query ?? null;
  } catch {
    query = null;
  }

  // Pass 1.5 — run the read action (RLS-scoped) and summarize it for the answer.
  let results: AssistantResult[] | undefined;
  let searchSummary: string | undefined;
  if (query && workspace) {
    results = await runAssistantSearch(supabase, workspace.id, query).catch(() => undefined);
    if (results && results.length > 0) {
      searchSummary = results.map((r) => `- ${r.title} (${r.kind}): ${r.subtitle}`).join('\n');
    } else {
      searchSummary = `(no matches for "${query}")`;
    }
  }

  // Pass 2 — stream the prose answer over NDJSON, leading with the result cards.
  const system = buildAssistantSystemPrompt({
    context: parsed.data.context,
    role: workspace?.role ?? null,
    searchSummary,
  });
  const encoder = new TextEncoder();
  const line = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (results && results.length > 0) controller.enqueue(line({ type: 'results', results }));
      try {
        let any = false;
        for await (const delta of gateway.streamText({ system, user: userTurn, maxTokens: 1024 })) {
          any = true;
          controller.enqueue(line({ type: 'delta', text: delta }));
        }
        if (!any) controller.enqueue(line({ type: 'delta', text: 'Sorry — I didn’t have a reply for that.' }));
      } catch {
        controller.enqueue(line({ type: 'delta', text: 'Sorry — I hit a problem answering that. Please try again.' }));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** A one-line NDJSON notice (keeps the panel's stream-reading path uniform). */
function ndjsonNotice(text: string): Response {
  const body = `${JSON.stringify({ type: 'delta', text })}\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** K.4 — workspace search → deep-linked result cards (capped, docs first). */
async function runAssistantSearch(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServer>>>,
  workspaceId: Parameters<typeof searchWorkspace>[1],
  query: string,
): Promise<AssistantResult[]> {
  const hits = await searchWorkspace(supabase, workspaceId, query);
  const results: AssistantResult[] = [
    ...hits.documents.slice(0, 5).map((d) => ({
      kind: 'document' as const,
      title: d.title,
      subtitle: d.snippet,
      href: `/documents/${d.documentId}`,
    })),
    ...hits.specFields.slice(0, 5).map((f) => ({
      kind: 'spec' as const,
      title: f.name,
      subtitle: f.category,
      href: f.productId ? `/specs?product=${f.productId}&field=${f.fieldId}` : '/specs',
    })),
    ...hits.components.slice(0, 4).map((c) => ({
      kind: 'component' as const,
      title: c.name,
      subtitle: c.type,
      href: '/specs/library',
    })),
  ];
  return results.slice(0, 10);
}
