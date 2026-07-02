import * as z from 'zod/v4';

/**
 * F7.2 — the structural-interpretation contract (ADR-007/ADR-012): the one
 * Zod schema the model's structured output must satisfy. Values arrive in a
 * *raw* shape — units as strings exactly as written in the sheet, tables as
 * source ranges rather than copied numbers — and `normalize.ts` resolves them
 * against the unit registry and the parsed workbook. The model can therefore
 * never mint a unit id, and table numbers come from the file, not the model
 * (the import-side zero-hallucination posture).
 */

const sourceRefSchema = z.strictObject({
    sheet: z.string().min(1),
    /** 1-based row number as rendered in the prompt. */
    row: z.number().int().positive(),
  });
export type ImportSourceRef = z.infer<typeof sourceRefSchema>;

/** A unit exactly as written in the sheet ("rev/min", "uF", "°C"), or null. */
const rawUnit = z.string().nullable();

const tableSourceSchema = z.strictObject({
    sheet: z.string().min(1),
    header_row: z.number().int().positive(),
    first_data_row: z.number().int().positive(),
    last_data_row: z.number().int().positive(),
    columns: z
      .array(
        z.strictObject({
            /** 1-based column index in the sheet. */
            source_column: z.number().int().positive(),
            name: z.string().min(1),
            role: z.enum(['independent', 'dependent', 'series']),
            unit: rawUnit,
          }),
      )
      .min(2),
  });
export type TableSource = z.infer<typeof tableSourceSchema>;

export const rawValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('scalar'), value: z.number(), unit: rawUnit }),
  z.strictObject({ kind: z.literal('range'), min: z.number(), max: z.number(), unit: rawUnit }),
  z.strictObject({
      kind: z.literal('toleranced'),
      nominal: z.number(),
      tolerance: z.number(),
      tolerance_type: z.enum(['absolute', 'percentage']),
      unit: rawUnit,
    }),
  z.strictObject({ kind: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({ kind: z.literal('enum'), selected: z.string().min(1), options: z.array(z.string()) }),
  z.strictObject({
      kind: z.literal('multi_enum'),
      selected: z.array(z.string()),
      options: z.array(z.string()),
    }),
  z.strictObject({ kind: z.literal('table'), source: tableSourceSchema }),
  /** Present in the sheet but not interpretable as a typed value. */
  z.strictObject({ kind: z.literal('empty'), raw_text: z.string().nullable() }),
]);
export type RawFieldValue = z.infer<typeof rawValueSchema>;

export const interpretedFieldSchema = z.strictObject({
    name: z.string().min(1),
    /** Must come from the workspace category list given in the prompt. */
    category: z.string().min(1),
    /** Measurement context ("at 25°C ambient, 50% load") — spec §4.2. */
    conditions: z.string().nullable(),
    /** Where the value was read from — the review screen's provenance. */
    source: sourceRefSchema.nullable(),
    value: rawValueSchema,
  });
export type InterpretedField = z.infer<typeof interpretedFieldSchema>;

export const interpretedComponentSchema = z.strictObject({
    name: z.string().min(1),
    component_type: z.enum(['assembly', 'module', 'part']),
    /** BOM nesting: the parent component's `name`, or null at the top level. */
    parent: z.string().nullable(),
    quantity: z.number().int().positive().nullable(),
    /** The sheet this component was mapped from (structural review). */
    sheet: z.string().nullable(),
    fields: z.array(interpretedFieldSchema),
  });
export type InterpretedComponent = z.infer<typeof interpretedComponentSchema>;

export const interpretationNoteSchema = z.strictObject({
    kind: z.enum([
      'note_row_excluded',
      'unrecognised_unit',
      'embedded_unit',
      'duplicate_field',
      'ambiguous',
      'other',
    ]),
    message: z.string().min(1),
    sheet: z.string().nullable(),
    row: z.number().int().nullable(),
  });
export type InterpretationNote = z.infer<typeof interpretationNoteSchema>;

/** One product per import session (spec §6.2). */
export const interpretedImportSchema = z.strictObject({
    product: z.strictObject({ name: z.string().min(1), description: z.string().nullable() }),
    /** Fields that belong on the product itself (flat parameter lists). */
    product_fields: z.array(interpretedFieldSchema),
    components: z.array(interpretedComponentSchema),
    /** What was excluded or flagged during interpretation (F7.5 inputs). */
    notes: z.array(interpretationNoteSchema),
  });
export type InterpretedImport = z.infer<typeof interpretedImportSchema>;

/** Reference fields are never proposed by import — they're authored in the app. */
export type ImportableFieldType =
  | 'scalar'
  | 'range'
  | 'toleranced'
  | 'boolean'
  | 'enum'
  | 'multi_enum'
  | 'table';
