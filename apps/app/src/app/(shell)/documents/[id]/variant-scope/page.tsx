import Link from 'next/link';
import {
  getActiveWorkspace,
  listProductComponents,
  listVariants,
  loadBlockVariantScopes,
  loadDocumentTree,
} from '@arther/db';
import { roleAllows } from '@arther/authz';
import { blockAnchorLabel, type DocumentId } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { VariantScopeManager, type ScopeBlock } from './VariantScopeManager';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * V.4 — manage each block's variant scope for a document (§3.4). Editors choose
 * ALL / DERIVED (gated on a component's presence) / MANUAL (specific variants);
 * the document's "Preview as variant" then hides blocks a variant scopes out.
 */
export default async function VariantScopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState title="Variant scope" description="Available once the workspace is provisioned." />
      </AppShell>
    );
  }
  const workspace = await getActiveWorkspace(supabase);
  const tree = workspace && UUID_RE.test(id) ? await loadDocumentTree(supabase, id as DocumentId) : null;
  if (!workspace || !tree) {
    return (
      <AppShell>
        <EmptyState
          title="Variant scope"
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

  if (!roleAllows(workspace.role, 'doc.write')) {
    return (
      <AppShell>
        <EmptyState title="Variant scope" description="Viewers can’t change which blocks a variant shows." />
      </AppShell>
    );
  }

  const variants = await listVariants(supabase, tree.document.product_id);
  const components = (await listProductComponents(supabase, tree.document.product_id)).map((e) => ({
    id: e.component_id as string,
    name: e.component_name,
  }));
  const scopes = await loadBlockVariantScopes(
    supabase,
    tree.blocks.map((b) => b.id),
  );
  const blocks: ScopeBlock[] = tree.blocks.map((b) => {
    const scope = scopes.get(b.id);
    return {
      id: b.id,
      label: blockAnchorLabel(b.display_order, b.content.type),
      type: b.content.type,
      mode: scope?.mode ?? 'ALL',
      variantIds: scope?.variantIds ?? [],
      derivedComponentId: scope?.derivedComponentId ?? null,
    };
  });

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href={`/documents/${tree.document.id}`}>← {tree.document.title}</Link>
        </p>
        <h1 className="specs-title">Variant scope</h1>
        <p className="specs-grid__meta">
          Choose which blocks appear for which variants. <strong>All variants</strong> is the default;{' '}
          <strong>Where a component exists</strong> hides the block for variants that removed that
          component; <strong>Selected variants only</strong> limits it to the variants you pick.
        </p>
        {variants.length === 0 ? (
          <p className="ui-field__hint">
            This product has no variants yet — create one under{' '}
            <Link href={`/specs/variants?product=${tree.document.product_id}`}>Variants</Link> first.
          </p>
        ) : tree.blocks.length === 0 ? (
          <p className="specs-grid__meta">This document has no blocks yet.</p>
        ) : (
          <VariantScopeManager
            documentId={tree.document.id}
            blocks={blocks}
            variants={variants.map((v) => ({ id: v.id as string, name: v.name }))}
            components={components}
          />
        )}
      </div>
    </AppShell>
  );
}
