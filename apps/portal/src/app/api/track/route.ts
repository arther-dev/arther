import { NextResponse } from 'next/server';
import { recordPortalEvent, resolvePortalDocumentRef } from '@arther/db';
import { rateLimit } from '@arther/rate-limit';
import { getPortalDb } from '../../../lib/portal-db';
import { ensureVisitorId } from '../../../lib/portal-visitor';

/**
 * C9.6 — the portal analytics beacon. The published document page is CDN-cached
 * (ISR), so a server-side per-render count undercounts; instead the client posts
 * a `document_viewed` beacon here on view. Everything is best-effort: this route
 * always answers 204 and never surfaces an error — analytics must never break a
 * page. The client supplies only URL coordinates (workspace slug + product id +
 * document slug); `resolvePortalDocumentRef` turns them into a workspace + doc id
 * **only** for a real public publication, so a fabricated beacon records nothing.
 * (PDF `document_downloaded` events are wired with the C5 download path.)
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getPortalDb();
    if (!db) return noContent();

    // Throttle beacon floods by client IP (in-memory fallback when Upstash absent).
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!(await rateLimit('portal_track', ip)).success) return noContent();

    const body = (await request.json().catch(() => null)) as
      | { type?: unknown; workspace?: unknown; product?: unknown; document?: unknown; version?: unknown }
      | null;
    if (!body || body.type !== 'document_viewed') return noContent();

    const workspace = body.workspace;
    const product = body.product;
    const document = body.document;
    const version = typeof body.version === 'string' ? body.version : undefined;
    if (typeof workspace !== 'string' || typeof document !== 'string' || typeof product !== 'string') {
      return noContent();
    }
    if (!UUID_RE.test(product)) return noContent();

    const ref = await resolvePortalDocumentRef(db, {
      workspaceSlug: workspace,
      productId: product,
      documentSlug: document,
      version,
    });
    if (!ref) return noContent();

    const sessionId = await ensureVisitorId();
    await recordPortalEvent(
      db,
      { workspaceId: ref.workspaceId },
      {
        eventType: 'document_viewed',
        documentId: ref.documentId,
        sessionId,
        payload: { version: ref.version },
      },
    );
  } catch {
    // swallow — a metering failure must never affect the visitor
  }
  return noContent();
}
