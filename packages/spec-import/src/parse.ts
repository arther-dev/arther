import ExcelJS from 'exceljs';

/**
 * F7.1 — sheet/row extraction. Excel and CSV converge on one neutral shape so
 * everything downstream (prompt rendering, table materialisation, source
 * cross-checks) is format-agnostic. Row/column indices are 1-based everywhere
 * to match what a person sees in Excel — the interpretation contract's
 * source refs use the same coordinates.
 */

export type ParsedCell = string | number | boolean | null;

export interface ParsedSheet {
  name: string;
  /** Dense row-major grid; `rows[0]` is sheet row 1. */
  rows: ParsedCell[][];
}

export interface ParsedWorkbook {
  filename: string;
  sheets: ParsedSheet[];
}

export class SpreadsheetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpreadsheetParseError';
  }
}

/** Hard cap so a pathological export can't balloon prompts or session rows. */
const MAX_ROWS_PER_SHEET = 5000;
const MAX_COLUMNS = 100;

export async function parseWorkbook(input: {
  filename: string;
  bytes: Uint8Array;
}): Promise<ParsedWorkbook> {
  const lower = input.filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    return {
      filename: input.filename,
      sheets: [{ name: csvSheetName(input.filename), rows: parseCsv(decodeText(input.bytes)) }],
    };
  }
  if (lower.endsWith('.xlsx')) {
    return { filename: input.filename, sheets: await parseXlsx(input.bytes) };
  }
  throw new SpreadsheetParseError(
    'Unsupported file type — upload an Excel workbook (.xlsx) or a CSV file.',
  );
}

function csvSheetName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base.length > 0 ? base : 'Sheet1';
}

function decodeText(bytes: Uint8Array): string {
  // Strip a UTF-8 BOM if present (Excel CSV exports carry one).
  const offset = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder('utf-8').decode(bytes.subarray(offset));
}

/** RFC-4180-ish CSV: quoted fields, embedded commas/quotes/newlines, CRLF. */
export function parseCsv(text: string): ParsedCell[][] {
  const rows: ParsedCell[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row.map(coerceCell));
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch !== '\r') {
      field += ch;
    }
    if (rows.length >= MAX_ROWS_PER_SHEET) break;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  // Drop fully-empty trailing rows (a final newline is not a row).
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c === null)) rows.pop();
  return rows;
}

/** Numbers stay numbers; everything else is a trimmed string or null. */
function coerceCell(raw: string): ParsedCell {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // Bare numerics only — "24 V" stays a string for the interpreter to read.
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return trimmed;
}

async function parseXlsx(bytes: Uint8Array): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new SpreadsheetParseError(
      'Could not read the workbook — is it a valid .xlsx file? (Legacy .xls needs re-saving as .xlsx.)',
    );
  }
  const sheets: ParsedSheet[] = [];
  workbook.eachSheet((sheet) => {
    const rows: ParsedCell[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber > MAX_ROWS_PER_SHEET) return;
      const cells: ParsedCell[] = [];
      const count = Math.min(row.cellCount, MAX_COLUMNS);
      for (let col = 1; col <= count; col += 1) {
        cells.push(excelCellValue(row.getCell(col).value));
      }
      // eachRow skips leading empty rows unless we pad: rowNumber is 1-based.
      while (rows.length < rowNumber - 1) rows.push([]);
      rows.push(trimTrailingNulls(cells));
    });
    if (rows.some((r) => r.length > 0)) sheets.push({ name: sheet.name, rows });
  });
  if (sheets.length === 0) {
    throw new SpreadsheetParseError('The workbook has no non-empty sheets.');
  }
  return sheets;
}

function trimTrailingNulls(cells: ParsedCell[]): ParsedCell[] {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === null) end -= 1;
  return cells.slice(0, end);
}

/** Flatten ExcelJS's cell-value union to the neutral cell type. */
function excelCellValue(value: ExcelJS.CellValue): ParsedCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : t;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) {
      return excelCellValue(value.result as ExcelJS.CellValue);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      const t = value.richText.map((r) => r.text).join('').trim();
      return t === '' ? null : t;
    }
    if ('text' in value && typeof value.text === 'string') {
      const t = value.text.trim();
      return t === '' ? null : t;
    }
    if ('error' in value) return null;
  }
  return null;
}

/**
 * The interpreter's view of the file: every sheet as numbered pipe-delimited
 * rows (1-based, matching source refs). Cells are rendered verbatim so units
 * embedded in value strings ("36 V ±5%") survive for type inference.
 */
export function renderWorkbookForPrompt(
  workbook: ParsedWorkbook,
  opts: { maxRowsPerSheet?: number; maxCellLength?: number } = {},
): string {
  const maxRows = opts.maxRowsPerSheet ?? 400;
  const maxCell = opts.maxCellLength ?? 120;
  const parts: string[] = [];
  for (const sheet of workbook.sheets) {
    parts.push(`### Sheet: ${JSON.stringify(sheet.name)} — ${sheet.rows.length} rows`);
    sheet.rows.slice(0, maxRows).forEach((row, i) => {
      const cells = row.map((c) => {
        const s = c === null ? '' : String(c);
        return s.length > maxCell ? `${s.slice(0, maxCell)}…` : s;
      });
      parts.push(`${i + 1} | ${cells.join(' | ')}`);
    });
    if (sheet.rows.length > maxRows) {
      parts.push(`… ${sheet.rows.length - maxRows} more rows omitted`);
    }
    parts.push('');
  }
  return parts.join('\n');
}
