import Link from 'next/link';
import {
  getActiveWorkspace,
  listComponents,
  listFieldsForComponents,
  listFieldsForProduct,
  listOverridesForProduct,
  listProductComponents,
  listProducts,
  listReleasesForProduct,
  listUnits,
} from '@arther/db';
import type { ComponentId, ProductId } from '@arther/types';
import { AppShell, Button, EmptyState, Skeleton } from '@arther/ui';
import { getSupabaseServer } from '../../../lib/supabase/server';
import { AddFieldForm } from './AddFieldForm';
import { AttachComponentForm } from './ComponentForms';
import { NewProductForm } from './NewProductForm';
import { CreateReleaseForm, DeleteReleaseButton } from './ReleaseForms';
import { CATEGORIES, FieldGrid, SpecsRail } from './shared';

export default async function SpecsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const supabase = await getSupabaseServer();

  // Unprovisioned: the first-run frame with skeleton navigator (E2E baseline).
  if (!supabase) {
    return (
      <AppShell
        rail={<SpecsRail active="products" />}
        navigator={
          <div aria-busy="true">
            <Skeleton style={{ height: 16, width: '70%', marginBottom: 8 }} />
            <Skeleton style={{ height: 16, width: '55%', marginBottom: 8 }} />
            <Skeleton style={{ height: 16, width: '65%' }} />
          </div>
        }
      >
        <EmptyState
          title="No products yet"
          description="Products and their shared components live here — the system of record your documents are generated from."
          primaryAction={<Button>Add product</Button>}
          secondaryAction={<Button variant="ghost">Import spreadsheet</Button>}
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) {
    return (
      <AppShell rail={<SpecsRail active="products" />}>
        <EmptyState
          title="Create your workspace first"
          description="Specs live inside a workspace — set yours up and come back."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  const products = await listProducts(supabase, workspace.id);
  const { product } = await searchParams;
  const selectedId = (product ?? products[0]?.id) as ProductId | undefined;
  const selected = products.find((p) => p.id === selectedId);

  const navigator = (
    <nav className="specs-nav" aria-label="Products">
      <ul className="specs-nav__list">
        {products.map((p) => (
          <li key={p.id}>
            <Link
              className={`specs-nav__item${p.id === selectedId ? ' specs-nav__item--active' : ''}`}
              href={`/specs?product=${p.id}`}
              aria-current={p.id === selectedId ? 'true' : undefined}
            >
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
      <NewProductForm />
    </nav>
  );

  if (!selected) {
    return (
      <AppShell rail={<SpecsRail active="products" />} navigator={navigator}>
        <EmptyState
          title="No products yet"
          description="Products and their shared components live here — the system of record your documents are generated from."
        />
      </AppShell>
    );
  }

  const [fields, units, edges, components, overrides, releases] = await Promise.all([
    listFieldsForProduct(supabase, selected.id),
    listUnits(supabase, workspace.id),
    listProductComponents(supabase, selected.id),
    listComponents(supabase, workspace.id),
    listOverridesForProduct(supabase, selected.id),
    listReleasesForProduct(supabase, selected.id),
  ]);
  const componentFields = await listFieldsForComponents(
    supabase,
    edges.map((e) => e.component_id as ComponentId),
  );
  const attachable = components.filter((c) => !edges.some((e) => e.component_id === c.id));

  return (
    <AppShell rail={<SpecsRail active="products" />} navigator={navigator}>
      <div className="specs-content">
        <h1 className="specs-title">{selected.name}</h1>

        <section className="specs-section">
          <h2 className="specs-section__title">Product fields</h2>
          {fields.length > 0 ? (
            <FieldGrid fields={fields} units={units} />
          ) : (
            <p className="specs-grid__meta">No product-level fields yet.</p>
          )}
          <AddFieldForm ownerKind="product" ownerId={selected.id} categories={CATEGORIES} />
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Components</h2>
          {edges.map((edge) => (
            <details key={edge.id} className="specs-component" open>
              <summary className="specs-component__summary">
                {edge.component_name}
                <span className="specs-grid__meta">
                  {' '}
                  ×{edge.quantity}
                  {edge.usage_count > 1 ? ` · shared — used in ${edge.usage_count} products` : ''}
                </span>
              </summary>
              <FieldGrid
                fields={componentFields.get(edge.component_id) ?? []}
                units={units}
                overrideContext={{ edgeId: edge.id, overrides }}
              />
              <AddFieldForm
                ownerKind="component"
                ownerId={edge.component_id}
                categories={CATEGORIES}
              />
            </details>
          ))}
          {edges.length === 0 ? (
            <p className="specs-grid__meta">
              No components attached — shared components carry one field history across every
              product that uses them.
            </p>
          ) : null}
          <AttachComponentForm productId={selected.id} components={attachable} />
          {attachable.length === 0 && components.length === 0 ? (
            <p className="specs-grid__meta">
              The <Link href="/specs/library" className="specs-value-button">Component Library</Link> is
              empty — create components there first.
            </p>
          ) : null}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Releases</h2>
          {releases.length > 0 ? (
            <ul className="specs-form" aria-label="Releases">
              {releases.map((r) => (
                <li key={r.id} className="specs-release">
                  <strong>{r.name}</strong>
                  <span className="specs-release__tag">{r.tag}</span>
                  <span className="specs-grid__meta">
                    {r.pinned_count} pinned {r.pinned_count === 1 ? 'value' : 'values'} ·{' '}
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  {r.notes ? <span className="specs-grid__meta">{r.notes}</span> : null}
                  <DeleteReleaseButton releaseId={r.id} name={r.name} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="specs-grid__meta">
              No releases yet — field edits accumulate in “latest” until you snapshot them.
            </p>
          )}
          <CreateReleaseForm productId={selected.id} />
        </section>
      </div>
    </AppShell>
  );
}
