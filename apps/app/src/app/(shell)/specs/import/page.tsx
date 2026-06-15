import Link from 'next/link';
import { getActiveWorkspace, listImportSessions, listProducts } from '@arther/db';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { UploadForm } from './ImportForms';
import { ImportStepper } from './stepper';

/** Claude interpretation runs inside the upload action — give it room. */
export const maxDuration = 300;

/**
 * F7 — Import / Re-import (Handoff 04 §B): full-canvas stepper in Specs mode —
 * top bar stays, rail/navigator/inspector hidden. Step 1: upload, no
 * pre-configuration; one product per session.
 */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const supabase = await getSupabaseServer();
  const { product } = await searchParams;

  if (!supabase) {
    return (
      <main className="import-canvas">
        <ImportStepper current="upload" />
        <h1 className="specs-title">Import a spec sheet</h1>
        <p className="specs-grid__meta">
          Drop an Excel workbook or CSV and Arther structures it into products, components, and
          typed fields — reviewed by you before anything is saved.
        </p>
        <p className="ui-field__error">
          Not configured in this environment yet — imports need the Supabase project
          (PROVISIONING.md).
        </p>
        <input type="file" className="import-dropzone" aria-label="Spec sheet (.xlsx or .csv)" disabled />
      </main>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) {
    return (
      <main className="import-canvas">
        <h1 className="specs-title">Import a spec sheet</h1>
        <p className="specs-grid__meta">
          Create your <Link href="/welcome">workspace</Link> first — imports land inside it.
        </p>
      </main>
    );
  }

  const [products, sessions] = await Promise.all([
    listProducts(supabase, workspace.id),
    listImportSessions(supabase, workspace.id),
  ]);

  return (
    <main className="import-canvas">
      <ImportStepper current="upload" />
      <h1 className="specs-title">Import a spec sheet</h1>
      <p className="specs-grid__meta">
        Drop an Excel workbook or CSV — no column mapping. Claude proposes the structure
        (components, field types, units, categories); you review and correct everything on the
        next screens; committing creates a named release. Re-imports are diff-first and never
        delete anything.
      </p>
      <UploadForm products={products} preselectedProductId={products.find((p) => p.id === product)?.id} />

      {sessions.length > 0 ? (
        <section className="specs-section">
          <h2 className="specs-section__title">Recent imports</h2>
          <ul className="specs-form" aria-label="Recent imports">
            {sessions.map((s) => (
              <li key={s.id} className="specs-form--row">
                <Link href={`/specs/import/${s.id}`} className="specs-field-link">
                  {s.source_filename ?? 'spreadsheet'}
                </Link>
                <span className={`import-status import-status--${s.status}`}>{s.status}</span>
                <span className="specs-grid__meta">
                  {new Date(s.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="specs-grid__meta">
        <Link href="/specs">← Back to Specs</Link>
      </p>
    </main>
  );
}
