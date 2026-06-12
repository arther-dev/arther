import type { OverrideRow, SpecFieldRow, UnitRow } from '@arther/db';
import { formatFieldValue, isOverridableFieldType } from '@arther/types';
import { BoxIcon, GridIcon, LocalRail, TagIcon } from '@arther/ui';
import { FieldValueEditor, OverrideEditor } from './FieldValueEditor';

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
  overrideContext,
}: {
  fields: SpecFieldRow[];
  units: UnitRow[];
  overrideContext?: OverrideContext;
}) {
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
          const header =
            field.category !== lastCategory ? (
              <tr className="specs-grid__category">
                <th scope="colgroup" colSpan={4}>
                  {field.category}
                </th>
              </tr>
            ) : null;
          lastCategory = field.category;
          const override =
            overrideContext?.overrides.get(`${overrideContext.edgeId}:${field.id}`) ?? null;
          // Effective value in a product context = override, else global (§3.5).
          const effective = override?.value ?? field.value;
          const valueUnitId =
            effective && 'unit_id' in (effective as object)
              ? ((effective as { unit_id?: string }).unit_id ?? field.unit_id)
              : field.unit_id;
          const symbol = units.find((u) => u.id === valueUnitId)?.symbol;
          return (
            <FieldRowWithHeader
              key={field.id}
              header={header}
              field={field}
              units={units}
              symbol={symbol}
              edgeId={overrideContext?.edgeId}
              override={override}
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
  symbol,
  edgeId,
  override,
}: {
  header: React.ReactNode;
  field: SpecFieldRow;
  units: UnitRow[];
  symbol?: string;
  edgeId?: string;
  override: OverrideRow | null;
}) {
  const effective = override?.value ?? field.value;
  const globalSymbol = (() => {
    if (override === null) return symbol;
    const unitId =
      field.value && 'unit_id' in (field.value as object)
        ? ((field.value as { unit_id?: string }).unit_id ?? field.unit_id)
        : field.unit_id;
    return units.find((u) => u.id === unitId)?.symbol;
  })();
  return (
    <>
      {header}
      <tr>
        <td>{field.name}</td>
        <td>
          {formatFieldValue(field.type, effective, symbol)}
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
          <FieldValueEditor field={field} units={units} />
          {edgeId && isOverridableFieldType(field.type) ? (
            <OverrideEditor field={field} units={units} edgeId={edgeId} override={override} />
          ) : null}
        </td>
      </tr>
    </>
  );
}
