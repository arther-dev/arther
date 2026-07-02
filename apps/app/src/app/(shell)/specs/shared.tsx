import Link from 'next/link';
import type { OverrideRow, SpecFieldRow, UnitRow } from '@arther/db';
import { formatFieldValue, isOverridableFieldType, unitSymbolFor } from '@arther/types';
import { BoxIcon, GridIcon, LocalRail, TagIcon } from '@arther/ui';
import { FieldOrderControls } from './DetailForms';
import { FieldValueEditor, OverrideEditor, type ComponentOption } from './FieldValueEditor';

/** Workspace categories are seeded by 0003; custom categories arrive with Settings. */
export const CATEGORIES = [
  'Electrical',
  'Mechanical',
  'Performance',
  'Thermal',
  'Environmental',
  'Compliance',
  'General',
];

export function SpecsRail({ active }: { active: 'products' | 'library' | 'releases' }) {
  return (
    <LocalRail
      items={[
        {
          id: 'products',
          label: 'Products',
          icon: <BoxIcon />,
          active: active === 'products',
          href: '/specs',
        },
        {
          id: 'library',
          label: 'Component Library',
          icon: <GridIcon />,
          active: active === 'library',
          href: '/specs/library',
        },
        {
          id: 'releases',
          label: 'Releases',
          icon: <TagIcon />,
          active: active === 'releases',
          href: '/specs/releases',
        },
      ]}
    />
  );
}

/** A shared component rendered inside one product: the edge + its overrides. */
export interface OverrideContext {
  edgeId: string;
  overrides: Map<string, OverrideRow>;
}

export function FieldGrid({
  fields,
  units,
  components = [],
  overrideContext,
  detailBase,
}: {
  fields: SpecFieldRow[];
  units: UnitRow[];
  /** Component Library options for reference pickers + name resolution. */
  components?: ComponentOption[];
  overrideContext?: OverrideContext;
  /** When set, field names link to the detail panel: `${detailBase}field=<id>`. */
  detailBase?: string;
}) {
  // F6 — fields render in (category, display_order); track each field's position
  // within its category so reorder controls can disable at the boundaries.
  const categoryTotal = new Map<string, number>();
  for (const f of fields) categoryTotal.set(f.category, (categoryTotal.get(f.category) ?? 0) + 1);
  let lastCategory = '';
  let categoryIndex = 0;
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
          const isNewCategory = field.category !== lastCategory;
          const header = isNewCategory ? (
            <tr className="specs-grid__category">
              <th scope="colgroup" colSpan={4}>
                {field.category}
              </th>
            </tr>
          ) : null;
          categoryIndex = isNewCategory ? 0 : categoryIndex + 1;
          lastCategory = field.category;
          const isFirst = categoryIndex === 0;
          const isLast = categoryIndex === (categoryTotal.get(field.category) ?? 1) - 1;
          const override =
            overrideContext?.overrides.get(`${overrideContext.edgeId}:${field.id}`) ?? null;
          // Effective value in a product context = override, else global (§3.5).
          const effective = override?.value ?? field.value;
          const symbol = unitSymbolFor(effective, field.unit_id, units);
          return (
            <FieldRowWithHeader
              key={field.id}
              header={header}
              field={field}
              units={units}
              components={components}
              symbol={symbol}
              edgeId={overrideContext?.edgeId}
              override={override}
              detailBase={detailBase}
              isFirst={isFirst}
              isLast={isLast}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function FieldRowWithHeader({
  header,
  field,
  units,
  components,
  symbol,
  edgeId,
  override,
  detailBase,
  isFirst,
  isLast,
}: {
  header: React.ReactNode;
  field: SpecFieldRow;
  units: UnitRow[];
  components: ComponentOption[];
  symbol?: string;
  edgeId?: string;
  override: OverrideRow | null;
  detailBase?: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const effective = override?.value ?? field.value;
  const globalSymbol =
    override === null ? symbol : unitSymbolFor(field.value, field.unit_id, units);
  // §5.5: a reference renders as a navigable link to the referenced component.
  const referenced =
    field.type === 'reference' && effective
      ? components.find((c) => c.id === (effective as { component_id: string }).component_id)
      : undefined;
  return (
    <>
      {header}
      <tr>
        <td>
          {detailBase ? (
            <Link
              href={`${detailBase}field=${field.id}#field-detail`}
              className="specs-field-link"
              aria-label={`${field.name} — history and comments`}
            >
              {field.name}
            </Link>
          ) : (
            field.name
          )}
        </td>
        <td>
          {referenced ? (
            <Link href="/specs/library" className="specs-value-button">
              → {referenced.name}
            </Link>
          ) : (
            formatFieldValue(field.type, effective, symbol)
          )}
          {override ? (
            <span className="specs-grid__meta">
              {' '}
              <span className="specs-override-chip">Override</span> · global:{' '}
              {formatFieldValue(field.type, field.value, globalSymbol)}
            </span>
          ) : null}
        </td>
        <td className="specs-grid__meta">{field.source}</td>
        <td>
          <div className="specs-form--row" style={{ gap: 6, alignItems: 'center' }}>
            <FieldValueEditor field={field} units={units} components={components} />
            <FieldOrderControls fieldId={field.id} isFirst={isFirst} isLast={isLast} />
          </div>
          {edgeId && isOverridableFieldType(field.type) ? (
            <OverrideEditor field={field} units={units} edgeId={edgeId} override={override} />
          ) : null}
        </td>
      </tr>
    </>
  );
}
