'use client';

import { useActionState, useMemo, useState } from 'react';
import type { SpecFieldRow, UnitRow } from '@arther/db';
import { parseTablePaste, type TableValue } from '@arther/types';
import { Button, SpecChart } from '@arther/ui';
import { updateFieldValueAction, type SpecsFormState } from './actions';

/**
 * Table mini-spreadsheet (F6.3 L, spec §5.5): column mapping (name/unit/role),
 * numeric rows, Excel/CSV paste, and a live chart preview through the same
 * SpecChart the Phase 2 Chart block renders with. State lives client-side and
 * is submitted as one JSON value — the server re-validates against
 * tableValueSchema (1–2 independent, exactly 1 dependent, ≤1 series).
 */

interface DraftColumn {
  id: string;
  name: string;
  unit_id: string;
  role: 'independent' | 'dependent' | 'series';
}
interface DraftRow {
  id: string;
  cells: Record<string, string>; // raw input text per column id
}

const ROLE_BY_INDEX: DraftColumn['role'][] = ['independent', 'dependent', 'series'];

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function fromValue(field: SpecFieldRow): { columns: DraftColumn[]; rows: DraftRow[]; interpolation: TableValue['interpolation'] } {
  const v = field.value as TableValue | null;
  if (!v) {
    const cols = [
      { id: newId(), name: 'X', unit_id: field.unit_id ?? '', role: 'independent' as const },
      { id: newId(), name: 'Y', unit_id: field.unit_id ?? '', role: 'dependent' as const },
    ];
    return { columns: cols, rows: [emptyRow(cols)], interpolation: 'linear' };
  }
  return {
    columns: v.columns.map((c) => ({ ...c })),
    rows: v.rows.map((r) => ({
      id: r.id,
      cells: Object.fromEntries(
        v.columns.map((c) => [c.id, r.values[c.id] === null || r.values[c.id] === undefined ? '' : String(r.values[c.id])]),
      ),
    })),
    interpolation: v.interpolation,
  };
}

function emptyRow(columns: DraftColumn[]): DraftRow {
  return { id: newId(), cells: Object.fromEntries(columns.map((c) => [c.id, ''])) };
}

export function TableEditor({
  field,
  units,
  onClose,
}: {
  field: SpecFieldRow;
  units: UnitRow[];
  onClose: () => void;
}) {
  const initial = useMemo(() => fromValue(field), [field]);
  const [columns, setColumns] = useState<DraftColumn[]>(initial.columns);
  const [rows, setRows] = useState<DraftRow[]>(initial.rows);
  const [interpolation, setInterpolation] = useState(initial.interpolation);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    async (prev, formData) => {
      const result = await updateFieldValueAction(prev, formData);
      if (!result.error) onClose();
      return result;
    },
    {},
  );

  const tableValue: TableValue | null = useMemo(() => {
    if (columns.length < 2) return null;
    return {
      columns: columns.map((c) => ({ ...c })),
      rows: rows.map((r) => ({
        id: r.id,
        values: Object.fromEntries(
          columns.map((c) => {
            const raw = (r.cells[c.id] ?? '').trim();
            const n = Number(raw);
            return [c.id, raw === '' || !Number.isFinite(n) ? null : n];
          }),
        ),
      })),
      interpolation,
    } as TableValue;
  }, [columns, rows, interpolation]);

  function handlePaste(text: string) {
    const parsed = parseTablePaste(text);
    if (!parsed) {
      setDraftError('Nothing tabular in the clipboard — copy at least two columns from Excel/CSV.');
      return;
    }
    setDraftError(null);
    const cols = parsed.columnNames.map((name, i) => ({
      id: newId(),
      name,
      unit_id: field.unit_id ?? '',
      role: ROLE_BY_INDEX[Math.min(i, 2)]!,
    }));
    setColumns(cols);
    setRows(
      parsed.rows.map((cells) => ({
        id: newId(),
        cells: Object.fromEntries(cols.map((c, i) => [c.id, cells[i] === null ? '' : String(cells[i])])),
      })),
    );
  }

  function setColumn(id: string, patch: Partial<DraftColumn>) {
    setColumns((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeColumn(id: string) {
    setColumns((cs) => cs.filter((c) => c.id !== id));
    setRows((rs) => rs.map((r) => ({ ...r, cells: Object.fromEntries(Object.entries(r.cells).filter(([k]) => k !== id)) })));
  }
  function addColumn() {
    const col: DraftColumn = { id: newId(), name: `Column ${columns.length + 1}`, unit_id: field.unit_id ?? '', role: 'series' };
    setColumns((cs) => [...cs, col]);
    setRows((rs) => rs.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: '' } })));
  }
  function setCell(rowId: string, colId: string, value: string) {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r)));
  }

  function validateDraft(): string | null {
    if (columns.length < 2) return 'A table needs at least two columns.';
    if (columns.some((c) => !c.name.trim())) return 'Name every column.';
    if (columns.some((c) => !c.unit_id)) return 'Pick a unit for every column.';
    const dependents = columns.filter((c) => c.role === 'dependent').length;
    const independents = columns.filter((c) => c.role === 'independent').length;
    const series = columns.filter((c) => c.role === 'series').length;
    if (independents < 1 || independents > 2) return 'Mark 1 or 2 columns independent.';
    if (dependents !== 1) return 'Mark exactly 1 column dependent.';
    if (series > 1) return 'At most 1 series column.';
    return null;
  }

  return (
    <form
      action={action}
      className="specs-form specs-table-editor"
      noValidate
      onSubmit={(e) => {
        const problem = validateDraft();
        if (problem) {
          e.preventDefault();
          setDraftError(problem);
        }
      }}
    >
      <input type="hidden" name="fieldId" value={field.id} />
      <input type="hidden" name="type" value="table" />
      <input type="hidden" name="tableJson" value={tableValue ? JSON.stringify(tableValue) : ''} />

      <div
        className="specs-table-editor__paste"
        onPaste={(e) => {
          const text = e.clipboardData.getData('text/plain');
          if (text.includes('\t') || text.includes('\n')) {
            e.preventDefault();
            handlePaste(text);
          }
        }}
      >
        <label className="ui-field__label" htmlFor={`paste-${field.id}`}>
          Paste from Excel/CSV (replaces the grid)
        </label>
        <textarea
          id={`paste-${field.id}`}
          className="ui-field__input specs-table-editor__paste-input"
          rows={1}
          placeholder="Click and press ⌘V / Ctrl+V"
          value=""
          onChange={() => {}}
        />
      </div>

      <table className="specs-grid specs-table-editor__grid">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} scope="col">
                <input
                  aria-label={`Column name`}
                  className="ui-field__input specs-table-editor__cell"
                  value={c.name}
                  onChange={(e) => setColumn(c.id, { name: e.target.value })}
                />
                <select
                  aria-label={`${c.name} role`}
                  className="ui-field__input"
                  value={c.role}
                  onChange={(e) => setColumn(c.id, { role: e.target.value as DraftColumn['role'] })}
                >
                  <option value="independent">independent</option>
                  <option value="dependent">dependent</option>
                  <option value="series">series</option>
                </select>
                <select
                  aria-label={`${c.name} unit`}
                  className="ui-field__input"
                  value={c.unit_id}
                  onChange={(e) => setColumn(c.id, { unit_id: e.target.value })}
                >
                  <option value="" disabled>
                    Unit…
                  </option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.symbol}
                    </option>
                  ))}
                </select>
                {columns.length > 2 ? (
                  <button
                    type="button"
                    className="specs-value-button"
                    aria-label={`Remove column ${c.name}`}
                    onClick={() => removeColumn(c.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </th>
            ))}
            <th scope="col">
              <button type="button" className="specs-value-button" onClick={addColumn}>
                + Column
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {columns.map((c) => (
                <td key={c.id}>
                  <input
                    aria-label={`${c.name} value`}
                    className="ui-field__input specs-table-editor__cell"
                    inputMode="decimal"
                    value={r.cells[c.id] ?? ''}
                    onChange={(e) => setCell(r.id, c.id, e.target.value)}
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className="specs-value-button"
                  aria-label="Remove row"
                  onClick={() => setRows((rs) => rs.filter((row) => row.id !== r.id))}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="specs-form--row">
        <button type="button" className="specs-value-button" onClick={() => setRows((rs) => [...rs, emptyRow(columns)])}>
          + Row
        </button>
        <label className="ui-field__label" htmlFor={`interp-${field.id}`}>
          Interpolation
        </label>
        <select
          id={`interp-${field.id}`}
          className="ui-field__input"
          value={interpolation}
          onChange={(e) => setInterpolation(e.target.value as TableValue['interpolation'])}
        >
          <option value="linear">linear</option>
          <option value="spline">spline</option>
          <option value="step">step</option>
          <option value="none">none</option>
        </select>
      </div>

      {tableValue ? (
        <SpecChart columns={tableValue.columns} rows={tableValue.rows} interpolation={tableValue.interpolation} />
      ) : null}

      <div className="specs-form--row">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save table'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {draftError ? <p className="ui-field__error">{draftError}</p> : null}
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
