import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * C6.5 — on-publish cache invalidation. The app (a separate deployment) POSTs
 * here after a publish to bust the affected workspace's portal cache immediately
 * (`portal:{slug}` tags the snapshot reads), so a newly published document
 * appears without waiting for the ISR interval. Secret-gated (a shared bearer
 * token); disabled until `PORTAL_REVALIDATE_SECRET` is set, in which case ISR
 * (the per-route `revalidate`) is the only refresh path.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PORTAL_REVALIDATE_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'disabled' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: { tags?: unknown };
  try {
    body = (await request.json()) as { tags?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  // Only `portal:` tags, capped — never an open revalidation primitive.
  const tags = (Array.isArray(body.tags) ? body.tags : [])
    .filter((t): t is string => typeof t === 'string' && t.startsWith('portal:') && t.length < 256)
    .slice(0, 20);
  for (const t of tags) revalidateTag(t);

  return NextResponse.json({ ok: true, revalidated: tags.length });
}
