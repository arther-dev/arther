import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Invitation · Arther' };

/**
 * Accept-invitation surface (auth IA §3). Invitation issuance/lookup is F4.3
 * (Resend + workspace_invitations); until it lands, every token resolves to
 * the honest expired/invalid dead-end the IA specifies rather than a fake
 * acceptance flow.
 */
export default function InvitePage() {
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
