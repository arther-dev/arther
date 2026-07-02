import Link from 'next/link';
import {
  getActiveWorkspace,
  listComponents,
  listFieldsForComponents,
  listProductComponents,
  listUnits,
  listVariantDeltas,
  loadResolvedVariantSpec,
  type SpecFieldRow,
} from '@arther/db';
import {
  describeVariantDelta,
  isOverridableFieldType,
  variantIdSchema,
  type ComponentId,
  type ResolvedSpecEntry,
} from '@arther/types';
import { roleAllows } from '@arther/authz';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { DeltaEditor, type EditorComponent } from './DeltaEditor';

/**
 * V.2/V.3 — a variant's delta editor + resolved-spec preview (Product Variants
 * §4.2/§3.3). The editor (left) expresses departures from the base product as
 * deltas; the resolved spec (below) is recomputed at query time and re-renders on
 * each change. Editor-gated writes; read-only for viewers.
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
  const canEdit = roleAllows(workspace.role, 'doc.write');

  // Base reference: the product's components + their fields (with options/units).
  const edges = await listProductComponents(supabase, variant.productId);
  const componentIds = [...new Set(edges.map((e) => e.component_id))] as ComponentId[];
  const fieldsByComponent: Map<ComponentId, SpecFieldRow[]> =
    componentIds.length > 0
      ? await listFieldsForComponents(supabase, componentIds)
      : new Map<ComponentId, SpecFieldRow[]>();
  const library = (await listComponents(supabase, workspace.id))
    .filter((c) => !c.archived_at)
    .map((c) => ({ id: c.id as string, name: c.name }));
  const units = (await listUnits(supabase, workspace.id)).map((u) => ({ id: u.id as string, symbol: u.symbol }));
  const deltaRows = await listVariantDeltas(supabase, variant.id);

  const editorComponents: EditorComponent[] = edges.map((e) => ({
    componentId: e.component_id,
    componentName: e.component_name,
    fields: (fieldsByComponent.get(e.component_id as ComponentId) ?? []).map((f) => ({
      fieldId: f.id as string,
      name: f.name,
      type: f.type,
      unitId: (f.unit_id as string | null) ?? null,
      options: f.options,
      overridable: isOverridableFieldType(f.type),
    })),
  }));

  const componentName = new Map(library.map((c) => [c.id, c.name]));
  const fieldName = new Map(entries.map((e) => [e.fieldId, e.name]));
  const deltas = deltaRows.map((d) => ({
    id: d.id as string,
    type: d.deltaType as string,
    label: describeVariantDelta({
      type: d.deltaType,
      componentName: d.componentId ? componentName.get(d.componentId) : null,
      fieldName: d.fieldId ? fieldName.get(d.fieldId) : null,
      replacementComponentName: d.replacementComponentId ? componentName.get(d.replacementComponentId) : null,
      newComponentName: d.newComponentId ? componentName.get(d.newComponentId) : null,
    }),
  }));

  // Group the resolved entries by owning component (product-owned first).
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
          Express departures from the base product below; the resolved spec recomputes from base +
          deltas. /{variant.slug}
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

        {canEdit ? (
          <DeltaEditor
            variantId={variant.id}
            components={editorComponents}
            library={library}
            units={units}
            deltas={deltas}
          />
        ) : (
          <p className="ui-field__hint">Viewers can read the resolved spec but can’t edit deltas.</p>
        )}

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
