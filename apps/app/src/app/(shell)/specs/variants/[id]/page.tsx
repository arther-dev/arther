import Link from 'next/link';
import {
  getActiveWorkspace,
  listComponents,
  listVariantDeltas,
  loadResolvedVariantSpec,
} from '@arther/db';
import { describeVariantDelta, variantIdSchema, type ResolvedSpecEntry } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../lib/supabase/server';

/**
 * V.2 — a variant's resolved spec (Product Variants §3.3), computed at query time
 * from the base product + the variant's deltas. Read-only here; the delta editor
 * with live editing is V.3. Overridden values and swapped/added components are
 * flagged, and any resolution warnings (e.g. an override targeting a removed
 * field) are surfaced.
 */
export default async function VariantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = variantIdSchema.safeParse(id);

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState title="Variant" description="Variants are available once the workspace is provisioned." />
      </AppShell>
    );
  }
  const workspace = await getActiveWorkspace(supabase);
  const resolved = workspace && parsed.success ? await loadResolvedVariantSpec(supabase, parsed.data) : null;
  if (!workspace || !resolved) {
    return (
      <AppShell>
        <EmptyState
          title="Variant"
          description="This variant doesn’t exist, or you don’t have access to it."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/specs">
              Back to Specs
            </Link>
          }
        />
      </AppShell>
    );
  }

  const { variant, entries, warnings } = resolved;
  const deltas = await listVariantDeltas(supabase, variant.id);
  const componentName = new Map(
    (await listComponents(supabase, workspace.id)).map((c) => [c.id as string, c.name]),
  );
  const fieldName = new Map(entries.map((e) => [e.fieldId, e.name]));

  // Group the resolved entries by their owning component (product-owned first).
  const groups = new Map<string, { label: string; entries: ResolvedSpecEntry[] }>();
  for (const e of entries) {
    const key = e.componentId ?? '__product__';
    const label = e.componentName ?? 'Product-level';
    if (!groups.has(key)) groups.set(key, { label, entries: [] });
    groups.get(key)!.entries.push(e);
  }

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href={`/specs/variants?product=${variant.productId}`}>← Variants</Link>
        </p>
        <h1 className="specs-title">{variant.name}</h1>
        <p className="specs-grid__meta">
          Resolved spec, computed from the base product plus this variant’s deltas. /{variant.slug}
          {variant.isDefault ? ' · default' : ''}
        </p>

        {warnings.length > 0 ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Warnings</h2>
            <ul className="specs-form" aria-label="Resolution warnings">
              {warnings.map((w, i) => (
                <li key={i} className="ui-field__error">
                  {w.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="specs-section">
          <h2 className="specs-section__title">Deltas</h2>
          {deltas.length === 0 ? (
            <p className="specs-grid__meta">
              No deltas yet — this variant currently resolves identically to the base product. Add
              deltas in the editor (V.3).
            </p>
          ) : (
            <ul className="specs-form" aria-label="Deltas">
              {deltas.map((d) => (
                <li key={d.id} className="specs-release">
                  <span className="specs-release__tag">{d.deltaType}</span>
                  <span>
                    {describeVariantDelta({
                      type: d.deltaType,
                      componentName: d.componentId ? componentName.get(d.componentId) : null,
                      fieldName: d.fieldId ? fieldName.get(d.fieldId) : null,
                      replacementComponentName: d.replacementComponentId
                        ? componentName.get(d.replacementComponentId)
                        : null,
                      newComponentName: d.newComponentId ? componentName.get(d.newComponentId) : null,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Resolved spec</h2>
          {entries.length === 0 ? (
            <p className="specs-grid__meta">This variant has no spec fields.</p>
          ) : (
            [...groups.values()].map((group, gi) => (
              <div key={gi} style={{ marginBottom: 12 }}>
                <h3 className="specs-grid__meta" style={{ fontWeight: 600 }}>
                  {group.label}
                </h3>
                <ul className="specs-form" aria-label={`Fields for ${group.label}`}>
                  {group.entries.map((e) => (
                    <li key={`${e.componentId ?? 'p'}:${e.fieldId}`} className="specs-release">
                      <span>{e.name}</span>
                      <span className="specs-grid__meta">{e.category}</span>
                      {e.overridden ? (
                        <span className="import-status import-status--review">Overridden</span>
                      ) : null}
                      {e.origin === 'added' ? (
                        <span className="import-status import-status--draft">Added</span>
                      ) : e.origin === 'swapped' ? (
                        <span className="import-status import-status--draft">Swapped in</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}
