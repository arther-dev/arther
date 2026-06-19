import { NextResponse } from 'next/server';
import { createAiGateway } from '@arther/ai-gateway';
import { getActiveWorkspace } from '@arther/db';
import {
  assistantReplySchema,
  assistantRequestSchema,
  buildAssistantSystemPrompt,
  flattenAssistantConversation,
} from '@arther/types';
import { getSupabaseServer } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * K.1/K.3/K.7 — Ask Arther chat. Authenticated members only; the conversation is
 * session-scoped (sent up each turn, never stored). The system prompt carries the
 * launch knowledge base + the user's live context (module · page · role). Backed by
 * the single ai-gateway call site (ADR-007). A friendly notice when the gateway is
 * unprovisioned keeps the panel usable in any environment. (Token-by-token
 * streaming + read/write actions are follow-up slices.)
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ reply: 'The assistant isn’t available in this environment yet.' });
  }
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
    return NextResponse.json({
      reply:
        'I’m not connected to a model in this environment yet, so I can’t answer right now. Once the workspace is fully provisioned I’ll be able to help.',
    });
  }

  const workspace = await getActiveWorkspace(supabase).catch(() => null);
  const system = buildAssistantSystemPrompt({
    context: parsed.data.context,
    role: workspace?.role ?? null,
  });
  const userTurn = flattenAssistantConversation(parsed.data.messages);

  try {
    const { reply } = await gateway.structured({
      schema: assistantReplySchema,
      system,
      user: userTurn,
      maxTokens: 1024,
    });
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { reply: 'Sorry — I hit a problem answering that. Please try again.' },
      { status: 200 },
    );
  }
}
