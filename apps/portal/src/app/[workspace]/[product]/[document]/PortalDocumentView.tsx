import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { BlockRenderer } from '@arther/block-renderer';
import {
  getPortalDocument,
  getPortalVariantDocument,
  getPortalWorkspace,
  listDocumentPublishedVariants,
  type DocumentVariantIndex,
  type PortalDocument,
} from '@arther/db';
import { portalTag } from '../../../../lib/portal-cache';
import { getPortalDb } from '../../../../lib/portal-db';
import { ViewBeacon } from './ViewBeacon';
import { VariantSwitcher } from './VariantSwitcher';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_INDEX: DocumentVariantIndex = {
  documentId: '' as DocumentVariantIndex['documentId'],
  baseAvailable: false,
  variants: [],
};

export type Loaded =
  | { state: 'unprovisioned' }
  | { state: 'notfound' }
  | { state: 'ok'; doc: PortalDocument; workspaceName: string; index: DocumentVariantIndex };

/**
 * C6.5 — the snapshot read is wrapped in Next's data cache (tagged per workspace)
 * so the rendered document page is CDN-cacheable (ISR), independent of Supabase's
 * uncached fetch. Publishing busts `portalTag(workspace)` (the revalidate
 * endpoint), and the per-route `revalidate` is the slow time fallback.
 *
 * V.9 — the document's published-variant index is loaded alongside so the variant
 * switcher renders on the base page too (where it doubles as the picker).
 */
export function loadDocument(
  workspaceSlug: string,
  productId: string,
  documentSlug: string,
  version: string | undefined,
): Promise<Loaded> {
  return unstable_cache(
    async (): Promise<Loaded> => {
      const db = getPortalDb();
      if (!db) return { state: 'unprovisioned' };
      const workspace = await getPortalWorkspace(db, workspaceSlug);
      if (!workspace || !UUID_RE.test(productId)) return { state: 'notfound' };
      const doc = await getPortalDocument(db, {
        workspaceId: workspace.id,
        productId,
        documentSlug,
        version,
      });
      if (!doc) return { state: 'notfound' };
      const index =
        (await listDocumentPublishedVariants(db, {
          workspaceId: workspace.id,
          productId,
          documentSlug,
        })) ?? EMPTY_INDEX;
      return { state: 'ok', doc, workspaceName: workspace.name, index };
    },
    ['portal-document', workspaceSlug, productId, documentSlug, version ?? 'latest'],
    { revalidate: 600, tags: [portalTag(workspaceSlug)] },
  )();
}

/** V.9 — the same cached read, scoped to one variant (by slug). */
export function loadVariantDocument(
  workspaceSlug: string,
  productId: string,
  documentSlug: string,
  variantSlug: string,
  version: string | undefined,
): Promise<Loaded> {
  return unstable_cache(
    async (): Promise<Loaded> => {
      const db = getPortalDb();
      if (!db) return { state: 'unprovisioned' };
      const workspace = await getPortalWorkspace(db, workspaceSlug);
      if (!workspace || !UUID_RE.test(productId)) return { state: 'notfound' };
      const doc = await getPortalVariantDocument(db, {
        workspaceId: workspace.id,
        productId,
        documentSlug,
        variantSlug,
        version,
      });
      if (!doc) return { state: 'notfound' };
      const index =
        (await listDocumentPublishedVariants(db, {
          workspaceId: workspace.id,
          productId,
          documentSlug,
        })) ?? EMPTY_INDEX;
      return { state: 'ok', doc, workspaceName: workspace.name, index };
    },
    ['portal-variant-document', workspaceSlug, productId, documentSlug, variantSlug, version ?? 'latest'],
    { revalidate: 600, tags: [portalTag(workspaceSlug)] },
  )();
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="portal-shell">
      <h1 className="portal-title">{title}</h1>
      <p className="portal-empty">{body}</p>
    </main>
  );
}

/**
 * The shared rendered shell for a base or variant document: the frozen snapshot
 * through the one `@arther/block-renderer`, plus the V.9 variant switcher and the
 * analytics beacon. `current` marks which entry the switcher highlights.
 */
function DocumentShell({
  workspaceSlug,
  productId,
  documentSlug,
  version,
  result,
  current,
}: {
  workspaceSlug: string;
  productId: string;
  documentSlug: string;
  version: string | undefined;
  result: Extract<Loaded, { state: 'ok' }>;
  current: { kind: 'base' } | { kind: 'variant'; slug: string };
}) {
  const { doc, workspaceName, index } = result;
  return (
    <main id="main-content" tabIndex={-1} className="portal-shell">
      <ViewBeacon
        workspace={workspaceSlug}
        product={productId}
        document={documentSlug}
        version={version}
        variant={current.kind === 'variant' ? current.slug : undefined}
      />
      <header className="portal-header">
        <p className="portal-header__eyebrow">{doc.productName}</p>
        <h1 className="portal-title">{doc.title}</h1>
        <p className="portal-meta">
          {doc.variant ? <>{doc.variant.name} · </> : null}Version {doc.version} ·{' '}
          <Link href={`/${workspaceSlug}`}>{workspaceName}</Link>
        </p>
      </header>
      <VariantSwitcher
        workspaceSlug={workspaceSlug}
        productId={productId}
        documentSlug={documentSlug}
        index={index}
        current={current}
      />
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

/**
 * C6.2 — server-render a frozen published snapshot. The snapshot is self-contained
 * (inline tokens carry their values; `resolutionManifest` feeds spec_table/chart),
 * so there are no live spec lookups. Interactive blocks (accordion → `<details>`,
 * video → `<video controls>`) are native HTML, so the page is readable and
 * interactive without JavaScript. `version` omitted → the latest non-archived
 * publication. V.9 — the base page carries the variant switcher/picker.
 */
export async function PortalDocumentView({
  workspaceSlug,
  productId,
  documentSlug,
  version,
}: {
  workspaceSlug: string;
  productId: string;
  documentSlug: string;
  version?: string;
}) {
  const result = await loadDocument(workspaceSlug, productId, documentSlug, version);
  if (result.state === 'unprovisioned') {
    return (
      <Message
        title="Portal"
        body="Published documentation appears here once the workspace is provisioned."
      />
    );
  }
  if (result.state === 'notfound') {
    return <Message title="Not found" body="This document isn’t published, or the link is wrong." />;
  }
  return (
    <DocumentShell
      workspaceSlug={workspaceSlug}
      productId={productId}
      documentSlug={documentSlug}
      version={version}
      result={result}
      current={{ kind: 'base' }}
    />
  );
}

/**
 * V.9 — the canonical per-variant page (`…/{document}/var/{variantSlug}`). Renders
 * the variant's own frozen snapshot (the variant's delta-resolved block tree +
 * manifest), with the same persistent switcher highlighting this variant.
 */
export async function PortalVariantDocumentView({
  workspaceSlug,
  productId,
  documentSlug,
  variantSlug,
  version,
}: {
  workspaceSlug: string;
  productId: string;
  documentSlug: string;
  variantSlug: string;
  version?: string;
}) {
  const result = await loadVariantDocument(workspaceSlug, productId, documentSlug, variantSlug, version);
  if (result.state === 'unprovisioned') {
    return (
      <Message
        title="Portal"
        body="Published documentation appears here once the workspace is provisioned."
      />
    );
  }
  if (result.state === 'notfound') {
    return (
      <Message title="Not found" body="This variant isn’t published, or the link is wrong." />
    );
  }
  return (
    <DocumentShell
      workspaceSlug={workspaceSlug}
      productId={productId}
      documentSlug={documentSlug}
      version={version}
      result={result}
      current={{ kind: 'variant', slug: variantSlug }}
    />
  );
}
