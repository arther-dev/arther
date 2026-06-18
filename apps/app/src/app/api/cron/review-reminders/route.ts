import { NextResponse } from 'next/server';
import { createServiceClient, runReviewReminders } from '@arther/db';

/**
 * C3.6 — the daily review-reminder cron endpoint. Vercel Cron (see vercel.json)
 * calls this once a day with `Authorization: Bearer ${CRON_SECRET}`. Gated on
 * `CRON_SECRET` (unset → 503, disabled); rejects any caller without the secret.
 * Runs the reminder job under the service role (no user JWT in a cron).
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Reminders are not configured.' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await runReviewReminders(createServiceClient(), new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: 'Reminder run failed.' }, { status: 500 });
  }
}
