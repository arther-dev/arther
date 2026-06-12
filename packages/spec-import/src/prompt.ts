import type { ParsedWorkbook } from './parse';
import { renderWorkbookForPrompt } from './parse';
import type { UnitRegistryEntry } from './normalize';

/**
 * F7.2 — the structural-interpretation prompt (spec §6.2 step 2). The rules
 * mirror the contract in `interpretation.ts`: point at cells, don't copy
 * tables, write units as they appear, stay inside the category list.
 */

export interface InterpretationPromptInput {
  workbook: ParsedWorkbook;
  units: UnitRegistryEntry[];
  categories: string[];
  /** Set on re-import — the product the sheet should reconcile into. */
  targetProductName?: string | null;
}

export function buildInterpretationPrompt(input: InterpretationPromptInput): {
  system: string;
  user: string;
} {
  const system = `You are the structural interpreter for Arther's spreadsheet import (SpecReconciler). Hardware spec sheets don't follow a schema — your job is to recover the structure: which sheets or row blocks are components vs. flat parameter lists, which rows are spec fields vs. notes, and what type each field is.

Rules:
- One product per import. If the workbook is a flat parameter list, put fields in product_fields and propose no components. Only propose components when the sheet structure clearly maps to physical sub-assemblies (per-sheet components, BOM-style assembly/component columns, labelled row blocks).
- Field types: a single numeric → scalar. Split min/max columns or "18–36" → one range field (never two scalars). "36 ±5%" or nominal/tolerance columns → toleranced. Yes/No → boolean. A value from a small fixed set → enum (list the options you can see). Multiple selected options → multi_enum. A block of numeric rows under shared column headers (performance curves, derating tables) → ONE table field.
- Tables: never copy the numbers. Emit the source range — sheet, header_row, first_data_row, last_data_row, and per column its 1-based source_column, name, role (exactly one dependent; one or two independent; at most one series), and unit as written.
- Every scalar/range/toleranced value must be read from a cell. Record its source {sheet, row} using the row numbers shown in the rendering. Never invent or convert values — if a cell says "1,250", the value is 1250 in the unit written there.
- Units: write them exactly as they appear ("rev/min", "uF", "°C"). The registry below shows what the workspace can resolve — prefer its symbol only when the sheet's spelling is an exact synonym. A value with no unit gets unit null.
- conditions: capture measurement context ("at 25°C ambient, 50% load") from the row or nearby annotations — it is part of the spec.
- category: pick the best fit from the provided list for every field.
- Rows that are notes, footnotes, headings, or disclaimers are not fields — exclude them and record each in notes (kind note_row_excluded).
- Cells with units embedded in the value string ("36 V ±5%") are fine: extract the numbers, put the unit in unit, and record a notes entry (kind embedded_unit) so the review screen can flag it.
- When unsure, prefer fewer, well-grounded fields and record an ambiguous note over guessing.`;

  const unitLines = input.units
    .map((u) => `${u.symbol}\t${u.name}\t${u.dimension}`)
    .join('\n');
  const target = input.targetProductName
    ? `This is a RE-IMPORT into the existing product ${JSON.stringify(input.targetProductName)} — use that exact name in product.name and keep field names consistent with a typical earlier import of the same sheet.`
    : 'This is a first import — name the product from the sheet contents (model name/number), not the filename, unless the filename is clearly the product name.';

  const user = `${target}

Workspace field categories (use exactly these): ${input.categories.join(', ')}

Unit registry (symbol, name, dimension):
${unitLines}

Workbook ${JSON.stringify(input.workbook.filename)} — rows are numbered; cells separated by " | ":

${renderWorkbookForPrompt(input.workbook)}`;

  return { system, user };
}
