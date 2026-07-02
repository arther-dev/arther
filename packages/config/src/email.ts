/**
 * ADR-011 — transactional email is Resend over one fetch, no SDK. This is the
 * single send path (invitations, notification fan-out) so sender identity,
 * delivery telemetry, or a provider switch happen in exactly one place.
 *
 * Gated on RESEND_API_KEY and best-effort by design: returns false instead of
 * throwing so callers can degrade honestly (copyable invite link, in-app-only
 * notification) — email delivery must never fail the mutation that queued it.
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  // RESEND_FROM must be on a domain verified in Resend to reach arbitrary
  // recipients; the onboarding default only delivers to the account owner.
  const from = process.env.RESEND_FROM ?? 'Arther <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
