import Link from 'next/link';
import { BlockRenderer } from '@arther/block-renderer';
import {
  getActiveWorkspace,
  listVariants,
  loadBlockVariantScopes,
  loadDocumentTree,
  resolveSpecFieldsForVariant,
} from '@arther/db';
import {
  applyTokenReplacements,
  blockAnchorLabel,
  isBlockVisibleForVariant,
  variantIdSchema,
  type BlockContent,
  type DocumentId,
  type SpecFieldResolution,
} from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { ComparePicker } from './ComparePicker';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Cell {
  visible: boolean;
  content: BlockContent | null;
  resolution: SpecFieldResolution;
}

/**
 * V.8 — internal block-level variant comparison (Product Variants §4.6). Two
 * variants render side-by-side from the shared document: each block is resolved
 * and scoped per variant. Blocks that differ (different resolved content, or
 * present in one variant only) are highlighted; a block absent from a variant
 * shows a "Not in this variant" placeholder. Read-only.
 */
export default async function CompareVariantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { id } = await params;
  const { a, b } = await searchParams;
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState title="Compare variants" description="Available once the workspace is provisioned." />
      </AppShell>
    );
  }
  const workspace = await getActiveWorkspace(supabase);
  const tree = workspace && UUID_RE.test(id) ? await loadDocumentTree(supabase, id as DocumentId) : null;
  if (!workspace || !tree) {
    return (
      <AppShell>
        <EmptyState
          title="Compare variants"
          description="This document doesn’t exist, or you don’t have access to it."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/specs">
              Back to Specs
            </Link>
          }
        />
      </AppShell>
    );
  }

  const variants = await listVariants(supabase, tree.document.product_id);
  const variantOptions = variants.map((v) => ({ id: v.id as string, name: v.name }));
  const aValid = a && variantIdSchema.safeParse(a).success ? variants.find((v) => v.id === a) : undefined;
  const bValid = b && variantIdSchema.safeParse(b).success ? variants.find((v) => v.id === b) : undefined;

  const header = (
    <>
      <p className="specs-grid__meta">
        <Link href={`/documents/${tree.document.id}`}>← {tree.document.title}</Link>
      </p>
      <h1 className="specs-title">Compare variants</h1>
      <ComparePicker documentId={tree.document.id} variants={variantOptions} a={a} b={b} />
    </>
  );

  if (variants.length < 2) {
    return (
      <AppShell>
        <div className="specs-content">
          {header}
          <p className="ui-field__hint">This product needs at least two variants to compare.</p>
        </div>
      </AppShell>
    );
  }
  if (!aValid || !bValid) {
    return (
      <AppShell>
        <div className="specs-content">
          {header}
          <p className="specs-grid__meta">Pick two variants above to compare them block by block.</p>
        </div>
      </AppShell>
    );
  }

  const [resA, resB, scopes] = await Promise.all([
    resolveSpecFieldsForVariant(supabase, aValid.id, workspace.id),
    resolveSpecFieldsForVariant(supabase, bValid.id, workspace.id),
    loadBlockVariantScopes(
      supabase,
      tree.blocks.map((bl) => bl.id),
    ),
  ]);
  const compsA = new Set(resA?.componentIds ?? []);
  const compsB = new Set(resB?.componentIds ?? []);

  const cellFor = (
    blockContent: BlockContent,
    blockId: string,
    res: typeof resA,
    comps: Set<string>,
    variantId: string,
  ): Cell => {
    const visible = isBlockVisibleForVariant(scopes.get(blockId), { variantId, componentIds: comps });
    return {
      visible,
      content: visible && res ? applyTokenReplacements(blockContent, res.replacements) : null,
      resolution: res?.resolution ?? {},
    };
  };

  const rows = tree.blocks.map((bl) => {
    const cellA = cellFor(bl.content, bl.id, resA, compsA, aValid.id);
    const cellB = cellFor(bl.content, bl.id, resB, compsB, bValid.id);
    const differ =
      cellA.visible !== cellB.visible ||
      (cellA.visible &&
        cellB.visible &&
        JSON.stringify(cellA.content) !== JSON.stringify(cellB.content));
    return { id: bl.id, label: blockAnchorLabel(bl.display_order, bl.content.type), cellA, cellB, differ };
  });

  const renderCell = (cell: Cell) =>
    cell.visible && cell.content ? (
      <BlockRenderer blocks={[cell.content]} resolved={cell.resolution} />
    ) : (
      <p className="specs-grid__meta" style={{ fontStyle: 'italic' }}>
        Not in this variant
      </p>
    );

  return (
    <AppShell>
      <div className="specs-content">
        {header}
        <div className="specs-form--row" style={{ gap: 8, fontWeight: 600, marginTop: 8 }}>
          <span style={{ flex: 1 }}>{aValid.name}</span>
          <span style={{ flex: 1 }}>{bValid.name}</span>
        </div>
        <ul className="specs-form" aria-label="Block comparison" style={{ listStyle: 'none', padding: 0 }}>
          {rows.map((row) => (
            <li
              key={row.id}
              className="specs-release"
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                background: row.differ ? 'var(--surface-warning, #fff7ed)' : undefined,
              }}
            >
              <div className="br-document" style={{ flex: 1, minWidth: 0 }}>
                {renderCell(row.cellA)}
              </div>
              <div className="br-document" style={{ flex: 1, minWidth: 0 }}>
                {renderCell(row.cellB)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
