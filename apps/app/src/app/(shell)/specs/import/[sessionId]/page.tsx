import Link from 'next/link';
import { getActiveWorkspace, getImportSession, listUnits, type UnitRow } from '@arther/db';
import type {
  ImportPlan,
  NormalizedComponent,
  NormalizedField,
  PlannedMutation,
} from '@arther/spec-import';
import { formatFieldValue } from '@arther/types';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { CATEGORIES } from '../../shared';
import { CommitForm, DiscardButton, RetryForm, ReviewStepForm } from '../ImportForms';
import { ImportStepper, type ImportStep } from '../stepper';
import { parseDecisions, recomputePlan } from '../plan';

/** Retry re-runs Claude interpretation through this route — give it room. */
export const maxDuration = 300;

export default async function ImportSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <main className="import-canvas">
        <h1 className="specs-title">Import</h1>
        <p className="ui-field__error">Not configured in this environment yet.</p>
      </main>
    );
  }
  const workspace = await getActiveWorkspace(supabase);
  const { sessionId } = await params;
  const session = workspace ? await getImportSession(supabase, sessionId) : null;
  if (!workspace || !session) {
    return (
      <main className="import-canvas">
        <h1 className="specs-title">Import not found</h1>
        <p className="specs-grid__meta">
          This import session doesn’t exist or isn’t yours.{' '}
          <Link href="/specs/import">Start a new import</Link>.
        </p>
      </main>
    );
  }

  const filename = session.source_filename ?? 'spreadsheet';

  if (session.status === 'failed') {
    return (
      <main className="import-canvas">
        <ImportStepper current="upload" />
        <h1 className="specs-title">Import of {filename} failed</h1>
        <p className="ui-field__error" role="alert">{session.error}</p>
        <div className="import-step__footer">
          {session.file_storage_key ? <RetryForm sessionId={session.id} /> : null}
          <Link className="ui-btn ui-btn--ghost" href="/specs/import">
            Start over
          </Link>
          <DiscardButton sessionId={session.id} />
        </div>
      </main>
    );
  }

  if (session.status === 'committed') {
    return (
      <main className="import-canvas">
        <h1 className="specs-title">Import committed</h1>
        <p className="specs-grid__meta">
          {filename} was applied
          {session.committed_at ? ` on ${new Date(session.committed_at).toLocaleString()}` : ''} and
          a release was created.
        </p>
        <Link className="ui-btn ui-btn--primary" href={`/specs?product=${session.target_product_id}`}>
          Open the product
        </Link>
      </main>
    );
  }

  if (session.status === 'discarded') {
    return (
      <main className="import-canvas">
        <h1 className="specs-title">Import discarded</h1>
        <p className="specs-grid__meta">
          Nothing was applied. <Link href="/specs/import">Start a new import</Link>.
        </p>
      </main>
    );
  }

  if (session.status !== 'proposed' || !session.interpreted_structure) {
    return (
      <main className="import-canvas">
        <ImportStepper current="upload" />
        <h1 className="specs-title">Interpreting {filename}…</h1>
        <p className="specs-grid__meta">
          The structural interpretation is still running — refresh in a moment. If this state
          persists, the original request was interrupted; start the import again.
        </p>
        <DiscardButton sessionId={session.id} />
      </main>
    );
  }

  const { step: rawStep } = await searchParams;
  const step: ImportStep = (['structure', 'fields', 'validate', 'commit'] as const).includes(
    rawStep as never,
  )
    ? (rawStep as ImportStep)
    : 'structure';

  const decisions = parseDecisions(session);
  const [{ plan }, units] = await Promise.all([
    recomputePlan(supabase, workspace.id, session, decisions),
    listUnits(supabase, workspace.id),
  ]);
  const normalized = session.interpreted_structure.normalized;
  const warnings = session.interpreted_structure.warnings;
  const isReimport =
    Boolean(session.target_product_id) && !plan.mutations.some((m) => m.kind === 'create_product');

  const byKey = new Map(plan.mutations.map((m) => [m.key, m] as const));

  return (
    <main className="import-canvas">
      <ImportStepper current={step} sessionId={session.id} />
      <header className="specs-form--row">
        <h1 className="specs-title">
          {isReimport ? 'Re-import' : 'Import'}: {filename}
        </h1>
        <DiscardButton sessionId={session.id} />
      </header>

      {step === 'structure' ? (
        <StructureStep
          sessionId={session.id}
          normalized={normalized}
          decisions={decisions}
          plan={plan}
        />
      ) : null}
      {step === 'fields' ? (
        <FieldsStep
          sessionId={session.id}
          normalized={normalized}
          decisions={decisions}
          byKey={byKey}
          units={units}
        />
      ) : null}
      {step === 'validate' ? (
        <ValidateStep sessionId={session.id} warnings={warnings} plan={plan} />
      ) : null}
      {step === 'commit' ? (
        <CommitStep sessionId={session.id} plan={plan} filename={filename} />
      ) : null}
    </main>
  );
}

type Decisions = ReturnType<typeof parseDecisions>;

/** Step 2 — which sheets become which components (accept/correct/skip). */
function StructureStep({
  sessionId,
  normalized,
  decisions,
  plan,
}: {
  sessionId: string;
  normalized: { productName: string; components: NormalizedComponent[]; productFields: NormalizedField[] };
  decisions: Decisions;
  plan: ImportPlan;
}) {
  const creatingProduct = plan.mutations.find((m) => m.kind === 'create_product');
  const componentBadge = (c: NormalizedComponent): string => {
    if (decisions.components[c.key]?.skip) return 'skipped';
    if (plan.mutations.some((m) => m.kind === 'create_component' && m.ckey === c.key)) {
      return 'new component';
    }
    const attach = plan.mutations.find(
      (m) => m.kind === 'attach_component' && m.key === `${c.key}.attach`,
    );
    if (attach && attach.kind === 'attach_component' && attach.matchedExisting) {
      return 'matches existing — will attach';
    }
    return 'already attached — fields merge';
  };

  return (
    <ReviewStepForm sessionId={sessionId} step="structure" submitLabel="Continue to field review">
      <section className="specs-section">
        <h2 className="specs-section__title">Product</h2>
        <p>
          {creatingProduct
            ? `New product: ${normalized.productName}`
            : 'Reconciling into the existing product.'}
          <span className="specs-grid__meta">
            {' '}
            · {normalized.productFields.length} product-level field
            {normalized.productFields.length === 1 ? '' : 's'}
          </span>
        </p>
      </section>
      <section className="specs-section">
        <h2 className="specs-section__title">Components</h2>
        {normalized.components.length === 0 ? (
          <p className="specs-grid__meta">
            The sheet reads as a flat parameter list — every field lands on the product itself.
          </p>
        ) : (
          <ul className="specs-form" aria-label="Proposed components">
            {normalized.components.map((c) => (
              <li key={c.key} className="import-row">
                <label className="import-row__include">
                  <input
                    type="checkbox"
                    name={`skip:${c.key}`}
                    defaultChecked={decisions.components[c.key]?.skip ?? false}
                  />{' '}
                  Skip
                </label>
                <input
                  className="ui-field__input"
                  name={`name:${c.key}`}
                  defaultValue={decisions.components[c.key]?.name ?? c.name}
                  aria-label={`Component name (${c.name})`}
                />
                <span className="import-status">{componentBadge(c)}</span>
                <span className="specs-grid__meta">
                  {c.componentType} · ×{c.quantity}
                  {c.parentName ? ` · in ${c.parentName}` : ''}
                  {c.sheet ? ` · sheet “${c.sheet}”` : ''} · {c.fields.length} field
                  {c.fields.length === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ReviewStepForm>
  );
}

/** Step 3 — per-field type/unit/category review (accept/correct/skip). */
function FieldsStep({
  sessionId,
  normalized,
  decisions,
  byKey,
  units,
}: {
  sessionId: string;
  normalized: { productFields: NormalizedField[]; components: NormalizedComponent[] };
  decisions: Decisions;
  byKey: Map<string, PlannedMutation>;
  units: UnitRow[];
}) {
  const owners: Array<{ label: string; fields: NormalizedField[] }> = [
    { label: 'Product', fields: normalized.productFields },
    ...normalized.components
      .filter((c) => !decisions.components[c.key]?.skip)
      .map((c) => ({ label: decisions.components[c.key]?.name ?? c.name, fields: c.fields })),
  ];
  const statusOf = (key: string): string => {
    const m = byKey.get(key);
    if (!m) return decisions.fields[key]?.skip ? 'skipped' : '—';
    if (m.kind === 'create_field') return 'added';
    if (m.kind === 'set_value') return 'changed';
    if (m.kind === 'unchanged') return 'unchanged';
    if (m.kind === 'type_conflict') return 'type conflict';
    return '—';
  };

  return (
    <ReviewStepForm sessionId={sessionId} step="fields" submitLabel="Continue to validation">
      {owners.map((owner) => (
        <section key={owner.label} className="specs-section">
          <h2 className="specs-section__title">{owner.label}</h2>
          <table className="specs-grid">
            <thead>
              <tr>
                <th scope="col">Import</th>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Value</th>
                <th scope="col">Unit</th>
                <th scope="col">Category</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {owner.fields.map((field) => {
                const d = decisions.fields[field.key];
                const effectiveUnit = d?.unitId !== undefined ? d.unitId : field.unitId;
                const symbol = units.find((u) => u.id === effectiveUnit)?.symbol;
                return (
                  <tr key={field.key}>
                    <td>
                      <input type="hidden" name={`present:${field.key}`} value="1" />
                      <input
                        type="checkbox"
                        name={`include:${field.key}`}
                        defaultChecked={!d?.skip}
                        aria-label={`Import ${field.name}`}
                      />
                    </td>
                    <td>
                      <input
                        className="ui-field__input"
                        name={`name:${field.key}`}
                        defaultValue={d?.name ?? field.name}
                        aria-label={`Field name (${field.name})`}
                      />
                    </td>
                    <td className="specs-grid__meta">{field.type}</td>
                    <td>
                      {field.value
                        ? formatFieldValue(field.type, field.value, symbol)
                        : <span className="specs-grid__meta">no value</span>}
                    </td>
                    <td>
                      {field.unitId !== null ? (
                        <select
                          className="ui-field__input"
                          name={`unit:${field.key}`}
                          defaultValue={effectiveUnit ?? ''}
                          aria-label={`Unit for ${field.name}`}
                        >
                          <option value="">(none)</option>
                          {units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.symbol} — {u.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="specs-grid__meta">—</span>
                      )}
                    </td>
                    <td>
                      <select
                        className="ui-field__input"
                        name={`category:${field.key}`}
                        defaultValue={d?.category ?? field.category}
                        aria-label={`Category for ${field.name}`}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="specs-grid__meta">
                      {field.source ? `${field.source.sheet}:${field.source.row}` : '—'}
                    </td>
                    <td>
                      <span className={`import-status import-status--${statusOf(field.key).replace(' ', '-')}`}>
                        {statusOf(field.key)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </ReviewStepForm>
  );
}

/** Step 4 — F7.5 validation pass: advisory, never blocking. */
function ValidateStep({
  sessionId,
  warnings,
  plan,
}: {
  sessionId: string;
  warnings: Array<{ kind: string; message: string; componentName?: string | null; fieldName?: string | null; sheet?: string | null; row?: number | null }>;
  plan: ImportPlan;
}) {
  const conflicts = plan.mutations.filter((m) => m.kind === 'type_conflict');
  return (
    <div className="import-step">
      <section className="specs-section">
        <h2 className="specs-section__title">
          Validation — {warnings.length + conflicts.length} advisory warning
          {warnings.length + conflicts.length === 1 ? '' : 's'}
        </h2>
        {warnings.length + conflicts.length === 0 ? (
          <p className="specs-grid__meta">Nothing flagged — clean interpretation.</p>
        ) : (
          <ul className="specs-form" aria-label="Validation warnings">
            {conflicts.map(
              (m) =>
                m.kind === 'type_conflict' && (
                  <li key={m.key} className="import-warning">
                    <strong>type conflict</strong> — {m.ownerLabel} › {m.name}: the sheet reads as{' '}
                    {m.incomingType} but the existing field is {m.existingType}. The value won’t be
                    imported; edit the field in Specs afterwards.
                  </li>
                ),
            )}
            {warnings.map((w, i) => (
              <li key={i} className="import-warning">
                <strong>{w.kind.replace(/_/g, ' ')}</strong>
                {w.componentName || w.fieldName
                  ? ` — ${[w.componentName, w.fieldName].filter(Boolean).join(' › ')}`
                  : ''}
                : {w.message}
                {w.sheet ? (
                  <span className="specs-grid__meta">
                    {' '}
                    ({w.sheet}
                    {w.row ? `:${w.row}` : ''})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="specs-grid__meta">
          Warnings are advisory — affected values were imported as text notes or left empty, never
          guessed.
        </p>
      </section>
      <footer className="import-step__footer">
        <Link className="ui-btn ui-btn--primary" href={`/specs/import/${sessionId}?step=commit`}>
          Continue to commit
        </Link>
      </footer>
    </div>
  );
}

/** Step 5 — the diff-first confirm (spec §6.4) + commit as a named release. */
function CommitStep({
  sessionId,
  plan,
  filename,
}: {
  sessionId: string;
  plan: ImportPlan;
  filename: string;
}) {
  const { summary } = plan;
  const missing = plan.mutations.filter((m) => m.kind === 'missing_from_sheet');
  return (
    <div className="import-step">
      <section className="specs-section">
        <h2 className="specs-section__title">Ready to commit</h2>
        <ul className="import-summary">
          <li>✓ {summary.unchanged} fields unchanged</li>
          <li>~ {summary.changed} fields changed</li>
          <li>+ {summary.added} fields added</li>
          <li>
            − {summary.missing} no longer in sheet (flagged for review — <strong>not deleted</strong>)
          </li>
          {summary.newComponents > 0 ? <li>{summary.newComponents} new components</li> : null}
          {summary.matchedComponents > 0 ? (
            <li>{summary.matchedComponents} existing components attached</li>
          ) : null}
          {summary.typeConflicts > 0 ? (
            <li>{summary.typeConflicts} type conflicts skipped (see Validation)</li>
          ) : null}
        </ul>
        {missing.length > 0 ? (
          <details className="specs-grid__meta">
            <summary>Fields flagged as missing from the sheet</summary>
            <ul>
              {missing.map((m) => (
                <li key={m.key}>
                  {m.ownerLabel} › {m.kind === 'missing_from_sheet' ? m.name : ''}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <p className="specs-grid__meta">
          Committing applies everything atomically and creates the release “Imported from{' '}
          {filename}” — the audit anchor for this import.
        </p>
      </section>
      <CommitForm
        sessionId={sessionId}
        summary={`+${summary.added} ~${summary.changed} ✓${summary.unchanged}`}
      />
    </div>
  );
}
