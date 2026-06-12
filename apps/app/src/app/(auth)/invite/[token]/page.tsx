import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { getInvitation } from '@arther/db';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { AcceptInviteForm } from './AcceptInviteForm';

export const metadata: Metadata = { title: 'Invitation · Arther' };

/**
 * Accept-invitation surface (F4.3, auth IA §3). The unguessable invitation id
 * is the token; lookup goes through the 0014 definer RPC (the invitee isn't a
 * member yet, so plain RLS would hide the row). Anything not pending — bad
 * token, expired, revoked, already accepted, unprovisioned env — renders the
 * honest dead-end the IA specifies.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await getSupabaseServer();
  const tokenIsId = z.string().uuid().safeParse(token).success;

  const invitation =
    supabase && tokenIsId ? await getInvitation(supabase, token).catch(() => null) : null;

  if (!supabase || !invitation || invitation.status !== 'pending') {
    return (
      <>
        <h1>This invitation isn’t valid</h1>
        <p className="auth-subtext">
          The link may have expired or already been used — invitations expire after 7 days. Ask
          your workspace admin to send a new one.
        </p>
        <div className="auth-links">
          <span />
          <Link href="/login">Log in</Link>
        </div>
      </>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <h1>Join {invitation.workspace_name}</h1>
      <p className="auth-subtext">
        <strong>{invitation.email}</strong> is invited as <strong>{invitation.role}</strong>.
      </p>
      {user ? (
        <AcceptInviteForm invitationId={token} />
      ) : (
        <>
          <p className="auth-subtext">
            Log in — or sign up — with that email, then open this link again to accept.
          </p>
          <div className="auth-links">
            <Link href="/signup">Sign up</Link>
            <Link href="/login">Log in</Link>
          </div>
        </>
      )}
    </>
  );
}
