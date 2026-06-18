import Link from 'next/link';
import { getActiveWorkspace, listProducts, listVariantDeltas, listVariants } from '@arther/db';
import { productIdSchema, type ProductId } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { VariantManager, type VariantListItem } from './VariantManager';

/**
 * V.1 — manage a product's variants (Product Variants §4.1). A variant is a named
 * set of deltas on this base product; the resolved spec is computed at query time
 * (V.2). This page creates / sets-default / deletes variants; the delta editor with
 * a live resolved-spec preview is V.3.
 */
export default async function VariantsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Variants"
          description="Product variants are available once the workspace is provisioned."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  const { product } = await searchParams;
  const pid = product ? productIdSchema.safeParse(product) : null;
  const products = workspace ? await listProducts(supabase, workspace.id) : [];
  const selected = pid?.success ? products.find((p) => p.id === pid.data) : undefined;

  if (!workspace || !selected) {
    return (
      <AppShell>
        <EmptyState
          title="Variants"
          description="Pick a product to manage its variants."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/specs">
              Back to Specs
            </Link>
          }
        />
      </AppShell>
    );
  }

  const variants = await listVariants(supabase, selected.id as ProductId);
  // Each variant's delta count (the variant model is small; one query each).
  const items: VariantListItem[] = await Promise.all(
    variants.map(async (v) => {
      const deltas = await listVariantDeltas(supabase, v.id);
      return {
        id: v.id,
        name: v.name,
        slug: v.slug,
        description: v.description,
        isDefault: v.isDefault,
        deltaCount: deltas.length,
      };
    }),
  );

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href={`/specs?product=${selected.id}`}>← {selected.name}</Link>
        </p>
        <h1 className="specs-title">Variants of {selected.name}</h1>
        <p className="specs-grid__meta">
          A variant is a named set of departures from this base product’s spec — field overrides and
          component swaps, adds, or removals. Its resolved spec is computed from the base plus those
          deltas; nothing is duplicated.
        </p>
        <VariantManager productId={selected.id} variants={items} />
      </div>
    </AppShell>
  );
}
