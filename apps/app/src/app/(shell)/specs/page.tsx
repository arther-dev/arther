import Link from 'next/link';
import {
  getActiveWorkspace,
  listFieldsForProduct,
  listProducts,
  listUnits,
  type SpecFieldRow,
  type UnitRow,
} from '@arther/db';
import { formatFieldValue, type ProductId } from '@arther/types';
import {
  AppShell,
  BoxIcon,
  Button,
  EmptyState,
  GridIcon,
  LocalRail,
  Skeleton,
  TagIcon,
} from '@arther/ui';
import { getSupabaseServer } from '../../../lib/supabase/server';
import { AddFieldForm } from './AddFieldForm';
import { NewProductForm } from './NewProductForm';
import { ScalarValueEditor } from './ScalarValueEditor';

const RAIL = (
  <LocalRail
    items={[
      { id: 'products', label: 'Products', icon: <BoxIcon />, active: true },
      { id: 'library', label: 'Component Library', icon: <GridIcon /> },
      { id: 'releases', label: 'Releases', icon: <TagIcon /> },
    ]}
  />
);

function FieldGrid({ fields, units }: { fields: SpecFieldRow[]; units: UnitRow[] }) {
  const unitSymbol = new Map(units.map((u) => [u.id as string, u.symbol]));
  let lastCategory = '';
  return (
    <table className="specs-grid">
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Value</th>
          <th scope="col">Source</th>
          <th scope="col"></th>
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => {
          const categoryHeader =
            field.category !== lastCategory ? (
              <tr key={`cat-${field.category}`} className="specs-grid__category">
                <th scope="colgroup" colSpan={4}>
                  {field.category}
                </th>
              </tr>
            ) : null;
          lastCategory = field.category;
          return (
            <FragmentRow
              key={field.id}
              header={categoryHeader}
              field={field}
              units={units}
              symbol={field.unit_id ? unitSymbol.get(field.unit_id) : undefined}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function FragmentRow({
  header,
  field,
  units,
  symbol,
}: {
  header: React.ReactNode;
  field: SpecFieldRow;
  units: UnitRow[];
  symbol?: string;
}) {
  const valueSymbol =
    field.type === 'scalar' && field.value
      ? units.find((u) => u.id === (field.value as { unit_id?: string }).unit_id)?.symbol
      : symbol;
  return (
    <>
      {header}
      <tr>
        <td>{field.name}</td>
        <td>{formatFieldValue(field.type, field.value, valueSymbol)}</td>
        <td className="specs-grid__meta">{field.source}</td>
        <td>
          {field.type === 'scalar' ? (
            <ScalarValueEditor field={field} units={units} />
          ) : (
            <span className="specs-grid__meta">editor soon</span>
          )}
        </td>
      </tr>
    </>
  );
}

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
        rail={RAIL}
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
      <AppShell rail={RAIL}>
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
      <AppShell rail={RAIL} navigator={navigator}>
        <EmptyState
          title="No products yet"
          description="Products and their shared components live here — the system of record your documents are generated from."
        />
      </AppShell>
    );
  }

  const [fields, units] = await Promise.all([
    listFieldsForProduct(supabase, selected.id),
    listUnits(supabase, workspace.id),
  ]);
  const categories = [
    'Electrical',
    'Mechanical',
    'Performance',
    'Thermal',
    'Environmental',
    'Compliance',
    'General',
  ];

  return (
    <AppShell rail={RAIL} navigator={navigator}>
      <div className="specs-content">
        <h1 className="specs-title">{selected.name}</h1>
        {fields.length > 0 ? (
          <FieldGrid fields={fields} units={units} />
        ) : (
          <p className="specs-grid__meta">No spec fields yet — add the first one below.</p>
        )}
        <AddFieldForm productId={selected.id} categories={categories} />
      </div>
    </AppShell>
  );
}
