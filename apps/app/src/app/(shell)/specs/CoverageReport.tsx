/**
 * G6.8 — the spec coverage report (Smart Spec Tracking §3.7 / §5.7). A passive,
 * analytical view over the product's spec fields: which are referenced by at
 * least one of its documents (✓, with a document count) and which are not (○ — a
 * coverage gap). The product-level summary answers "N of M spec fields
 * referenced"; per-group rows let a documentation lead see exactly where the gaps
 * are. No actions, no assignments — it is read-only by design.
 */
export interface CoverageField {
  id: string;
  name: string;
  count: number;
}

export interface CoverageGroup {
  id: string;
  title: string;
  fields: CoverageField[];
}

export function CoverageReport({
  summary,
  groups,
}: {
  summary: { covered: number; total: number };
  groups: CoverageGroup[];
}) {
  if (summary.total === 0) {
    return (
      <section className="specs-section">
        <p className="specs-grid__meta">
          No spec fields yet — add fields to this product (or its components) to track which ones
          your documents reference.
        </p>
      </section>
    );
  }

  return (
    <section className="specs-section" aria-label="Spec coverage">
      <p className="specs-section__title" role="status">
        {summary.covered} of {summary.total} spec field{summary.total === 1 ? '' : 's'} referenced in
        at least one document
      </p>
      {groups
        .filter((g) => g.fields.length > 0)
        .map((group) => {
          const covered = group.fields.filter((f) => f.count > 0).length;
          return (
            <details key={group.id} className="specs-component" open>
              <summary className="specs-component__summary">
                {group.title}
                <span className="specs-grid__meta">
                  {' '}
                  {covered} of {group.fields.length} covered
                </span>
              </summary>
              <ul className="specs-form" aria-label={`${group.title} coverage`}>
                {group.fields.map((field) => {
                  const isCovered = field.count > 0;
                  return (
                    <li key={field.id} className="specs-form--row">
                      <span aria-hidden="true">{isCovered ? '✓' : '○'}</span>
                      <span style={{ flex: 1 }}>{field.name}</span>
                      <span className="specs-grid__meta">
                        {isCovered
                          ? `Referenced in ${field.count} document${field.count === 1 ? '' : 's'}`
                          : 'Not referenced in any document'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
    </section>
  );
}
