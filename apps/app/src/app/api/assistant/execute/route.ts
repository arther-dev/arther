import { NextResponse } from 'next/server';
import { createCanDo, type CanDo } from '@arther/authz';
import { rateLimit } from '@arther/rate-limit';
import {
  createComponent,
  createProduct,
  getActiveWorkspace,
  membershipLookupFor,
} from '@arther/db';
import {
  assistantExecuteRequestSchema,
  describeAssistantAction,
  isInternalAssistantPath,
  type AssistantAction,
  type AssistantExecutedAction,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * K.5 — confirm-and-execute for Ask Arther's gated write actions. The assistant
 * route (../route.ts) only *proposes* actions; nothing runs until the user clicks
 * Confirm in the panel, which POSTs the batch here. This route is the security
 * boundary: it re-validates every action (zod) and re-checks `canDo` per action
 * (guardrail 1 — the assistant has no elevated permissions; RLS is defence in
 * depth behind it). Each line item reports its own outcome, so a batch can
 * partially succeed and the panel can show exactly what happened.
 */
type ExecuteContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServer>>>;
  userId: UserId;
  workspace: NonNullable<Awaited<ReturnType<typeof getActiveWorkspace>>>;
  canDo: CanDo;
};

export async function POST(request: Request): Promise<Response> {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'The assistant isn’t available in this environment yet.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // H.5 — share the assistant per-member budget (defense in depth; the writes
  // are also canDo-gated below).
  const throttle = await rateLimit('assistant', user.id);
  if (!throttle.success) {
    return NextResponse.json(
      { error: `Too many requests — try again in ${throttle.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = assistantExecuteRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return NextResponse.json({ error: 'No workspace yet.' }, { status: 400 });

  const ctx: ExecuteContext = {
    supabase,
    userId: user.id as UserId,
    workspace,
    canDo: createCanDo(membershipLookupFor(supabase)),
  };

  // Run the batch in order; each action reports independently (no all-or-nothing,
  // matching the per-line-item confirmation UI).
  const results: AssistantExecutedAction[] = [];
  for (const action of parsed.data.actions) {
    results.push(await executeAction(ctx, action));
  }
  return NextResponse.json({ results });
}

async function executeAction(
  ctx: ExecuteContext,
  action: AssistantAction,
): Promise<AssistantExecutedAction> {
  const label = describeAssistantAction(action);

  // Navigation is immediate + client-side — nothing to mutate; just hand back a
  // validated in-app href (a tampered batch can't smuggle an external link).
  if (action.kind === 'navigate') {
    return isInternalAssistantPath(action.path)
      ? { kind: action.kind, label, ok: true, href: action.path }
      : { kind: action.kind, label, ok: false, error: 'That link isn’t an in-app page.' };
  }

  // Every create runs through canDo — the assistant never has more reach than the
  // signed-in user's role allows.
  const allowed = await ctx.canDo({ id: ctx.userId }, 'spec.write', {
    workspaceId: ctx.workspace.id,
  });
  if (!allowed) {
    return {
      kind: action.kind,
      label,
      ok: false,
      error: 'Viewers can’t create specs — ask for an Editor seat.',
    };
  }

  try {
    if (action.kind === 'create_product') {
      const productId = await createProduct(ctx.supabase, {
        workspaceId: ctx.workspace.id,
        name: action.name,
        createdBy: ctx.userId,
      });
      return { kind: action.kind, label, ok: true, href: `/specs?product=${productId}` };
    }
    // create_component
    await createComponent(ctx.supabase, {
      workspaceId: ctx.workspace.id,
      name: action.name,
      type: action.componentType ?? undefined,
      createdBy: ctx.userId,
    });
    return { kind: action.kind, label, ok: true, href: '/specs/library' };
  } catch {
    return { kind: action.kind, label, ok: false, error: 'Couldn’t complete that action.' };
  }
}
