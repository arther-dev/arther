/**
 * G2.1 — generation pre-flight completeness (AI Document Generator spec §5.1).
 * Before generation, the author sees which spec fields the chosen Document Type
 * will draw on and which are still empty — so they confirm with eyes open.
 *
 * A required field left empty does NOT block generation: it becomes a
 * placeholder block that can't be published (G2.7). So this is a readiness
 * *report*, not a gate — the surface warns, the author decides.
 *
 * Pure (one source, ADR-012): the page assembles the field + section inputs from
 * the spec graph and the Document Type, and this maps fields to sections by
 * category exactly as the generator will at G2.2.
 */

export interface PreflightField {
  name: string;
  category: string;
  required: boolean;
  /** The field has a value (not null — "not yet entered"). */
  populated: boolean;
  owner: 'product' | 'component';
  /** Set when owner is 'component'. */
  componentName?: string;
}

export interface PreflightSection {
  name: string;
  /** The `spec_field_categories` the section injects (Document Type §4.2). */
  categories: string[];
}

export interface PreflightFieldRef {
  name: string;
  owner: 'product' | 'component';
  componentName?: string;
}

export interface SectionReadiness {
  name: string;
  categories: string[];
  total: number;
  populated: number;
  empty: number;
  /** Empty AND required — generates as a placeholder (can't publish). */
  requiredEmpty: PreflightFieldRef[];
  /** Categories the section asks for that the product has no field in. */
  unmappedCategories: string[];
}

export interface GenerationReadiness {
  sections: SectionReadiness[];
  /** Fields in no section's categories — they won't be injected anywhere. */
  uncategorizedFields: PreflightFieldRef[];
  totals: { total: number; populated: number; empty: number; requiredEmpty: number };
}

function toRef(field: PreflightField): PreflightFieldRef {
  return field.owner === 'component'
    ? { name: field.name, owner: 'component', componentName: field.componentName }
    : { name: field.name, owner: 'product' };
}

/**
 * Map a product's fields onto a Document Type's sections by category and report
 * completeness per section and overall. A field whose category appears in two
 * sections is counted in both (it is injected into both); the totals count each
 * distinct field once.
 */
export function computeGenerationReadiness(
  sections: ReadonlyArray<PreflightSection>,
  fields: ReadonlyArray<PreflightField>,
): GenerationReadiness {
  const covered = new Set<string>();
  const sectionReadiness = sections.map((section): SectionReadiness => {
    for (const category of section.categories) covered.add(category);
    const categorySet = new Set(section.categories);
    const matched = fields.filter((field) => categorySet.has(field.category));
    const populated = matched.filter((field) => field.populated).length;
    return {
      name: section.name,
      categories: section.categories,
      total: matched.length,
      populated,
      empty: matched.length - populated,
      requiredEmpty: matched.filter((field) => field.required && !field.populated).map(toRef),
      unmappedCategories: section.categories.filter(
        (category) => !fields.some((field) => field.category === category),
      ),
    };
  });

  const uncategorizedFields = fields.filter((field) => !covered.has(field.category)).map(toRef);
  const populated = fields.filter((field) => field.populated).length;
  return {
    sections: sectionReadiness,
    uncategorizedFields,
    totals: {
      total: fields.length,
      populated,
      empty: fields.length - populated,
      requiredEmpty: fields.filter((field) => field.required && !field.populated).length,
    },
  };
}
