/**
 * Excel/CSV paste parsing for the table mini-spreadsheet (F6.3, spec §5.5):
 * engineers already have curves in a spreadsheet — paste must "just work".
 * Pure: clipboard text in, named columns + numeric rows out; the editor maps
 * the result onto TableValue (ids, roles, units) where the user can adjust
 * the column mapping before save.
 */

export interface PastedTable {
  /** From the header row when one is detected, else "Column 1…N". */
  columnNames: string[];
  /** Row-major cells; empty or non-numeric data cells become null. */
  rows: Array<Array<number | null>>;
  headerDetected: boolean;
}

function splitLine(line: string, delimiter: '\t' | ','): string[] {
  return line.split(delimiter).map((cell) => cell.trim());
}

function toNumber(cell: string): number | null {
  if (cell === '') return null;
  const n = Number(cell);
  return Number.isFinite(n) ? n : null;
}

/** Excel multi-cell copies are TSV; fall back to CSV for file-shaped pastes. */
export function parseTablePaste(text: string): PastedTable | null {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/\u00a0/g, ' '))
    .filter((l) => l.trim() !== '');
  if (lines.length === 0) return null;

  const delimiter = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  const grid = lines.map((l) => splitLine(l, delimiter));
  const width = Math.max(...grid.map((r) => r.length));
  if (width < 2) return null; // a table needs at least two columns (schema)

  // Header heuristic: any non-empty, non-numeric cell in the first row.
  const first = grid[0]!;
  const headerDetected = first.some((cell) => cell !== '' && toNumber(cell) === null);

  const dataRows = headerDetected ? grid.slice(1) : grid;
  const rows = dataRows.map((r) =>
    Array.from({ length: width }, (_, i) => toNumber(r[i] ?? '')),
  );
  if (rows.length === 0 || rows.every((r) => r.every((c) => c === null))) return null;

  const columnNames = Array.from({ length: width }, (_, i) =>
    headerDetected && first[i] ? first[i]! : `Column ${i + 1}`,
  );
  return { columnNames, rows, headerDetected };
}
