import type { SpecFieldRow, UnitRow } from '@arther/db';
import { formatFieldValue } from '@arther/types';
import { BoxIcon, GridIcon, LocalRail, TagIcon } from '@arther/ui';
import { FieldValueEditor } from './FieldValueEditor';

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
        { id: 'releases', label: 'Releases', icon: <TagIcon />, active: active === 'releases' },
      ]}
    />
  );
}

export function FieldGrid({ fields, units }: { fields: SpecFieldRow[]; units: UnitRow[] }) {
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
          const valueUnitId =
            field.value && 'unit_id' in (field.value as object)
              ? ((field.value as { unit_id?: string }).unit_id ?? field.unit_id)
              : field.unit_id;
          const symbol = units.find((u) => u.id === valueUnitId)?.symbol;
          return (
            <FieldRowWithHeader key={field.id} header={header} field={field} units={units} symbol={symbol} />
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
}: {
  header: React.ReactNode;
  field: SpecFieldRow;
  units: UnitRow[];
  symbol?: string;
}) {
  return (
    <>
      {header}
      <tr>
        <td>{field.name}</td>
        <td>{formatFieldValue(field.type, field.value, symbol)}</td>
        <td className="specs-grid__meta">{field.source}</td>
        <td>
          <FieldValueEditor field={field} units={units} />
        </td>
      </tr>
    </>
  );
}
