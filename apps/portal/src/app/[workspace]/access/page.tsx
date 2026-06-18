import { cookies } from 'next/headers';
import { BlockRenderer } from '@arther/block-renderer';
import { getGatedPortalDocument } from '@arther/db';
import { verifyPortalSession } from '@arther/config/magic-link';
import type { DocumentId } from '@arther/types';
import { getPortalDb } from '../../../lib/portal-db';

/**
 * C7.2 — the gated document view. Reads the HMAC session cookie minted by
 * `/api/access`; only with a valid session for this document is the frozen
 * snapshot served (via the gated service-role read, which the public portal
 * queries deliberately exclude). Reads cookies, so it is always dynamic — gated
 * pages are never CDN-cached (unlike the public C6.5 routes). The token is never
 * here; it was exchanged for the session at `/api/access`.
 */
export const dynamic = 'force-dynamic';

const ACCESS_COOKIE = 'arther_portal_access';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Gate({ title, body }: { title: string; body: string }) {
  return (
    <main className="portal-shell">
      <h1 className="portal-title">{title}</h1>
      <p className="portal-empty">{body}</p>
    </main>
  );
}

export default async function GatedAccessPage({
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ d?: string; denied?: string }>;
}) {
  const { d = '', denied } = await searchParams;
  const secret = process.env.PORTAL_SESSION_SECRET;

  if (!UUID_RE.test(d)) {
    return <Gate title="Access required" body="This link is invalid or incomplete." />;
  }

  const cookieStore = await cookies();
  const session = secret
    ? verifyPortalSession(cookieStore.get(ACCESS_COOKIE)?.value, secret)
    : null;

  if (!session || session.d !== d) {
    const body =
      denied === 'invalid'
        ? 'This access link is invalid, expired, or has been revoked. Ask the owner for a new link.'
        : denied === 'throttled'
          ? 'Too many attempts — wait a minute and open your access link again.'
          : denied === 'disabled'
            ? 'Gated access isn’t available on this portal yet.'
            : 'Open your access link to view this document. Sessions last 24 hours.';
    return <Gate title="Access required" body={body} />;
  }

  const db = getPortalDb();
  const doc = db ? await getGatedPortalDocument(db, d as DocumentId) : null;
  if (!doc) {
    return <Gate title="Not found" body="This document isn’t published, or the link is wrong." />;
  }

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <p className="portal-header__eyebrow">{doc.productName}</p>
        <h1 className="portal-title">{doc.title}</h1>
        <p className="portal-meta">Version {doc.version} · Private document</p>
      </header>
      <article className="br-document">
        {doc.blockTree.length > 0 ? (
          <BlockRenderer blocks={doc.blockTree} resolved={doc.resolutionManifest} />
        ) : (
          <p className="portal-empty">This document has no content.</p>
        )}
      </article>
    </main>
  );
}
