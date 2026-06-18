import Link from 'next/link';
import {
  getActiveWorkspace,
  getEntityBrief,
  getSpecCoverageForProduct,
  listArchived,
  listArchivedFields,
  listBriefKeyUsage,
  listComponents,
  listFieldsForComponents,
  listFieldsForProduct,
  listOverridesForProduct,
  listProductComponents,
  listProducts,
  listReleasesForProduct,
  listUnits,
  listUsersByIds,
} from '@arther/db';
import {
  briefFragmentKeySchema,
  summariseCoverage,
  type ComponentId,
  type ProductId,
  type SpecFieldId,
  type UserId,
} from '@arther/types';
import { AppShell, Button, EmptyState, Skeleton } from '@arther/ui';
import { getSupabaseServer } from '../../../lib/supabase/server';
import { AddFieldForm } from './AddFieldForm';
import { BriefPanel } from './BriefPanel';
import { CoverageReport, type CoverageGroup } from './CoverageReport';
import { AttachComponentForm } from './ComponentForms';
import { ArchiveToggle } from './DetailForms';
import { FieldDetail } from './FieldDetail';
import { NewProductForm } from './NewProductForm';
import { CreateReleaseForm, DeleteReleaseButton } from './ReleaseForms';
import { CATEGORIES, FieldGrid, SpecsRail } from './shared';

export default async function SpecsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; field?: string; tab?: string; fragment?: string }>;
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
          secondaryAction={
            <Link className="ui-btn ui-btn--ghost" href="/specs/import">
              Import spreadsheet
            </Link>
          }
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
  const { product, field, tab, fragment } = await searchParams;
  const briefTab = tab === 'brief';
  const coverageTab = tab === 'coverage';
  // F8.5: a malformed ?fragment= degrades to the fragment list, never a 500.
  const expandedKey = fragment ? briefFragmentKeySchema.safeParse(fragment).data : undefined;
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
          secondaryAction={
            <Link className="ui-btn ui-btn--ghost" href="/specs/import">
              Import spreadsheet
            </Link>
          }
        />
      </AppShell>
    );
  }

  const [fields, units, edges, components, overrides, releases, archivedProducts, archivedFields] =
    await Promise.all([
      listFieldsForProduct(supabase, selected.id),
      listUnits(supabase, workspace.id),
      listProductComponents(supabase, selected.id),
      listComponents(supabase, workspace.id),
      listOverridesForProduct(supabase, selected.id),
      listReleasesForProduct(supabase, selected.id),
      listArchived(supabase, 'products', workspace.id),
      listArchivedFields(supabase, { productId: selected.id }),
    ]);
  const componentFields = await listFieldsForComponents(
    supabase,
    edges.map((e) => e.component_id as ComponentId),
  );
  const attachable = components.filter((c) => !edges.some((e) => e.component_id === c.id));
  const detailBase = `/specs?product=${selected.id}&`;

  // G6.8 — coverage is only computed on its own tab (a read over block_spec_references).
  const coverage = coverageTab ? await getSpecCoverageForProduct(supabase, selected.id) : null;
  const coverageGroups: CoverageGroup[] = coverage
    ? [
        {
          id: 'product',
          title: 'Product fields',
          fields: fields.map((f) => ({
            id: f.id,
            name: f.name,
            count: coverage.documentCountByField.get(f.id) ?? 0,
          })),
        },
        ...edges.map((e) => ({
          id: e.id,
          title: e.component_name,
          fields: (componentFields.get(e.component_id) ?? []).map((f) => ({
            id: f.id,
            name: f.name,
            count: coverage.documentCountByField.get(f.id) ?? 0,
          })),
        })),
      ]
    : [];
  const coverageSummary = coverage
    ? summariseCoverage(
        coverageGroups.flatMap((g) => g.fields.map((f) => f.id)),
        coverage.documentCountByField,
      )
    : { covered: 0, total: 0 };

  // G0.6: brief data is only needed on the Product Brief tab.
  const brief = briefTab ? await getEntityBrief(supabase, 'product', selected.id) : null;
  const briefUsage = briefTab ? await listBriefKeyUsage(supabase, workspace.id) : [];
  const briefEditorIds = (brief?.fragments.map((f) => f.updated_by).filter(Boolean) ??
    []) as UserId[];
  const briefEditors = await listUsersByIds(supabase, briefEditorIds);
  const briefEditorNames = new Map<string, string>(
    [...briefEditors.entries()].map(([id, u]) => [id, u.name ?? u.email]),
  );

  // F6.2: the product tree, computed at read from the edges (invariant 3).
  const childrenOf = (parentEdgeId: string | null) =>
    edges.filter((e) => e.parent_component_id === parentEdgeId);
  const renderEdge = (edge: (typeof edges)[number]) => (
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
        components={components}
        overrideContext={{ edgeId: edge.id, overrides }}
        detailBase={detailBase}
      />
      <AddFieldForm ownerKind="component" ownerId={edge.component_id} categories={CATEGORIES} />
      {childrenOf(edge.id).map(renderEdge)}
    </details>
  );

  return (
    <AppShell rail={<SpecsRail active="products" />} navigator={navigator}>
      <div className="specs-content">
        <header className="specs-form--row">
          <h1 className="specs-title">{selected.name}</h1>
          <Link className="ui-btn ui-btn--primary" href={`/specs/generate?product=${selected.id}`}>
            Generate document
          </Link>
          <Link className="ui-btn ui-btn--ghost" href={`/specs/import?product=${selected.id}`}>
            Re-import spec sheet
          </Link>
          <Link className="ui-btn ui-btn--ghost" href={`/specs/variants?product=${selected.id}`}>
            Variants
          </Link>
          <ArchiveToggle entity="products" id={selected.id} archived={false} label={selected.name} />
        </header>

        <nav className="specs-tabs" aria-label="Product view">
          <Link
            className={`specs-tabs__tab${!briefTab && !coverageTab ? ' specs-tabs__tab--active' : ''}`}
            href={`/specs?product=${selected.id}`}
            aria-current={!briefTab && !coverageTab ? 'page' : undefined}
          >
            Spec Fields
          </Link>
          <Link
            className={`specs-tabs__tab${briefTab ? ' specs-tabs__tab--active' : ''}`}
            href={`/specs?product=${selected.id}&tab=brief`}
            aria-current={briefTab ? 'page' : undefined}
          >
            Product Brief
          </Link>
          <Link
            className={`specs-tabs__tab${coverageTab ? ' specs-tabs__tab--active' : ''}`}
            href={`/specs?product=${selected.id}&tab=coverage`}
            aria-current={coverageTab ? 'page' : undefined}
          >
            Coverage
          </Link>
        </nav>

        {coverageTab ? (
          <CoverageReport summary={coverageSummary} groups={coverageGroups} />
        ) : briefTab ? (
          <BriefPanel
            entityType="product"
            entityId={selected.id}
            fragments={brief?.fragments ?? []}
            keyUsage={briefUsage}
            expandedKey={expandedKey}
            basePath={`/specs?product=${selected.id}&tab=brief`}
            editorNames={briefEditorNames}
          />
        ) : (
          <>
        <section className="specs-section">
          <h2 className="specs-section__title">Product fields</h2>
          {fields.length > 0 ? (
            <FieldGrid fields={fields} units={units} components={components} detailBase={detailBase} />
          ) : (
            <p className="specs-grid__meta">No product-level fields yet.</p>
          )}
          <AddFieldForm ownerKind="product" ownerId={selected.id} categories={CATEGORIES} />
          {archivedFields.length > 0 ? (
            <details className="specs-grid__meta">
              <summary>{archivedFields.length} archived field{archivedFields.length > 1 ? 's' : ''}</summary>
              <ul className="specs-form" aria-label="Archived fields">
                {archivedFields.map((f) => (
                  <li key={f.id} className="specs-form--row">
                    {f.name}
                    <ArchiveToggle entity="spec_fields" id={f.id} archived label={f.name} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Components</h2>
          {childrenOf(null).map(renderEdge)}
          {edges.length === 0 ? (
            <p className="specs-grid__meta">
              No components attached — shared components carry one field history across every
              product that uses them.
            </p>
          ) : null}
          <AttachComponentForm
            productId={selected.id}
            components={attachable}
            edges={edges.map((e) => ({ id: e.id, component_name: e.component_name }))}
          />
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
          </>
        )}

        {!briefTab && !coverageTab && field ? (
          <FieldDetail
            supabase={supabase}
            fieldId={field as SpecFieldId}
            units={units}
            components={components}
            closeHref={`/specs?product=${selected.id}`}
          />
        ) : null}

        {archivedProducts.length > 0 ? (
          <details className="specs-grid__meta">
            <summary>
              {archivedProducts.length} archived product{archivedProducts.length > 1 ? 's' : ''}
            </summary>
            <ul className="specs-form" aria-label="Archived products">
              {archivedProducts.map((p) => (
                <li key={p.id} className="specs-form--row">
                  {p.name}
                  <ArchiveToggle entity="products" id={p.id} archived label={p.name} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </AppShell>
  );
}
