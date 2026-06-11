import { z } from 'zod';

/**
 * The FieldValue union — the one schema source (ADR-012) for the 8 spec
 * field types, per the Spec Database spec §4
 * (Features/Spec Docs/arther-spec-database-architecture.md). spec_fields.value
 * is stored as JSONB; the database does not validate shape — these schemas do,
 * at every boundary (field editors, AI tool-use contracts, import
 * normalisation, server actions).
 */

const uuid = z.string().uuid();

/** Matches the spec_fields.type check constraint (migration 0003). */
export const fieldTypeSchema = z.enum([
  'scalar',
  'range',
  'toleranced',
  'boolean',
  'enum',
  'multi_enum',
  'table',
  'reference',
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

/** §4.2 — single numeric value; unit required for all numeric types. */
export const scalarValueSchema = z
  .object({
    value: z.number().finite(),
    unit_id: uuid,
  })
  .strict();
export type ScalarValue = z.infer<typeof scalarValueSchema>;

/** §4.3 — min and max sharing a unit. */
export const rangeValueSchema = z
  .object({
    min: z.number().finite(),
    max: z.number().finite(),
    unit_id: uuid,
  })
  .strict()
  .refine((v) => v.min <= v.max, { message: 'range min must be ≤ max' });
export type RangeValue = z.infer<typeof rangeValueSchema>;

/** §4.4 — nominal ± tolerance (absolute or percentage). */
export const tolerancedValueSchema = z
  .object({
    nominal: z.number().finite(),
    tolerance: z.number().finite().nonnegative(),
    tolerance_type: z.enum(['absolute', 'percentage']),
    unit_id: uuid,
  })
  .strict();
export type TolerancedValue = z.infer<typeof tolerancedValueSchema>;

/** §4.5 */
export const booleanValueSchema = z.object({ value: z.boolean() }).strict();
export type BooleanValue = z.infer<typeof booleanValueSchema>;

const optionList = z.array(z.string().min(1)).min(1).refine(
  (options) => new Set(options).size === options.length,
  { message: 'options must be unique' },
);

/** §4.6 — options belong to the field, consistent across all products. */
export const enumValueSchema = z
  .object({
    selected: z.string().min(1),
    options: optionList,
  })
  .strict()
  .refine((v) => v.options.includes(v.selected), {
    message: 'selected must be one of options',
  });
export type EnumValue = z.infer<typeof enumValueSchema>;

export const multiEnumValueSchema = z
  .object({
    selected: z.array(z.string().min(1)),
    options: optionList,
  })
  .strict()
  .refine((v) => new Set(v.selected).size === v.selected.length, {
    message: 'selected values must be unique',
  })
  .refine((v) => v.selected.every((s) => v.options.includes(s)), {
    message: 'every selected value must be one of options',
  });
export type MultiEnumValue = z.infer<typeof multiEnumValueSchema>;

/**
 * §4.7 — performance curves / derating tables. Supported shapes: 2D curve
 * (1 independent), multi-series 2D (+1 series), 2D surface (2 independent;
 * stores correctly, heatmap renderer deferred). Every column carries a unit;
 * row values are keyed by column id.
 */
export const tableValueSchema = z
  .object({
    columns: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            unit_id: uuid,
            role: z.enum(['independent', 'dependent', 'series']),
          })
          .strict(),
      )
      .min(2),
    rows: z.array(
      z
        .object({
          id: z.string().min(1),
          values: z.record(z.string(), z.number().finite().nullable()),
        })
        .strict(),
    ),
    interpolation: z.enum(['linear', 'spline', 'step', 'none']),
  })
  .strict()
  .superRefine((table, ctx) => {
    const ids = table.columns.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'column ids must be unique' });
    }
    const roles = { independent: 0, dependent: 0, series: 0 };
    for (const c of table.columns) roles[c.role] += 1;
    if (roles.independent < 1 || roles.independent > 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a table needs 1 or 2 independent columns',
      });
    }
    if (roles.dependent !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a table needs exactly 1 dependent column',
      });
    }
    if (roles.series > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'at most 1 series column' });
    }
    const idSet = new Set(ids);
    const rowIds = new Set<string>();
    for (const row of table.rows) {
      if (rowIds.has(row.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate row id "${row.id}"` });
      }
      rowIds.add(row.id);
      for (const key of Object.keys(row.values)) {
        if (!idSet.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `row "${row.id}" references unknown column "${key}"`,
          });
        }
      }
    }
  });
export type TableValue = z.infer<typeof tableValueSchema>;

/** §4.8 — points at a Component Library entity. Circular refs are checked at save (F5.9), not here. */
export const referenceValueSchema = z.object({ component_id: uuid }).strict();
export type ReferenceValue = z.infer<typeof referenceValueSchema>;

export const fieldValueSchemas = {
  scalar: scalarValueSchema,
  range: rangeValueSchema,
  toleranced: tolerancedValueSchema,
  boolean: booleanValueSchema,
  enum: enumValueSchema,
  multi_enum: multiEnumValueSchema,
  table: tableValueSchema,
  reference: referenceValueSchema,
} as const satisfies Record<FieldType, z.ZodTypeAny>;

export type FieldValue =
  | ScalarValue
  | RangeValue
  | TolerancedValue
  | BooleanValue
  | EnumValue
  | MultiEnumValue
  | TableValue
  | ReferenceValue;

/** Validate a JSONB value against its field's declared type. */
export function parseFieldValue(type: FieldType, value: unknown): FieldValue {
  return fieldValueSchemas[type].parse(value) as FieldValue;
}

export function safeParseFieldValue(type: FieldType, value: unknown) {
  return fieldValueSchemas[type].safeParse(value);
}

/**
 * §3.5 — product-level overrides exist for scalar field types only; table and
 * reference fields never support overrides (F5.6 enforces type-change blocking
 * on this set).
 */
export const OVERRIDABLE_FIELD_TYPES = [
  'scalar',
  'range',
  'toleranced',
  'enum',
  'boolean',
] as const satisfies readonly FieldType[];

export function isOverridableFieldType(type: FieldType): boolean {
  return (OVERRIDABLE_FIELD_TYPES as readonly FieldType[]).includes(type);
}
