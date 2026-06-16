import Link from 'next/link';
import {
  getActiveWorkspace,
  getDocumentType,
  getGenerationRun,
  listBrandProfiles,
  listDocumentTypes,
  listPreflightFields,
  listProducts,
} from '@arther/db';
import {
  computeGenerationReadiness,
  type DocumentTypeId,
  type GenerationRunId,
  type PreflightFieldRef,
  type ProductId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { GenerateConfirm } from './GenerateConfirm';
import { RunStatus } from './RunStatus';

/** Generation will run here once the durable pipeline lands (G2.2). */
export const maxDuration = 300;

const refLabel = (ref: PreflightFieldRef) =>
  ref.owner === 'component' && ref.componentName ? `${ref.componentName} · ${ref.name}` : ref.name;

/**
 * G2.1 — generation pre-flight (AI Document Generator spec §5.1): pick a
 * Document Type and see how complete this product's spec inputs are before
 * confirming. Full-canvas in Specs mode, like Import.
 */
export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; type?: string; run?: string }>;
}) {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <main className="import-canvas">
        <h1 className="specs-title">Generate a document</h1>
        <p className="specs-grid__meta">
          Pick a Document Type and Arther drafts it from this product’s live spec — every value
          traced to a field, nothing invented.
        </p>
        <p className="ui-field__error">
          Not configured in this environment yet — generation needs the Supabase project
          (PROVISIONING.md).
        </p>
      </main>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) {
    return (
      <main className="import-canvas">
        <h1 className="specs-title">Generate a document</h1>
        <p className="specs-grid__meta">
          Create your <Link href="/welcome">workspace</Link> first — documents live inside it.
        </p>
      </main>
    );
  }

  const { product, type, run } = await searchParams;
  const products = await listProducts(supabase, workspace.id);
  const selectedProductId = (product ?? products[0]?.id) as ProductId | undefined;
  const selected = products.find((p) => p.id === selectedProductId);
  if (!selected) {
    return (
      <main className="import-canvas">
        <h1 className="specs-title">Generate a document</h1>
        <p className="specs-grid__meta">
          No products yet — <Link href="/specs">add one</Link> to generate from.
        </p>
      </main>
    );
  }

  // After confirm: the run outcome.
  if (run) {
    const runData = await getGenerationRun(supabase, run as GenerationRunId);
    if (!runData) {
      return (
        <main className="import-canvas">
          <h1 className="specs-title">Generation</h1>
          <p className="specs-grid__meta">That run isn’t visible.</p>
          <p className="specs-grid__meta">
            <Link href={`/specs?product=${selected.id}`}>← Back to {selected.name}</Link>
          </p>
        </main>
      );
    }
    return (
      <RunStatus
        runId={run}
        productName={selected.name}
        productHref={`/specs?product=${selected.id}`}
        initial={{
          status: runData.run.status,
          error: runData.run.error ?? null,
          documentId: runData.run.document_id ?? null,
          sections: runData.sections.map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            error: s.error ?? null,
          })),
        }}
      />
    );
  }

  // Archived types block new documents (§3.8).
  const types = (await listDocumentTypes(supabase, workspace.id)).filter((t) => !t.archived_at);
  const selectedType = type ? types.find((t) => t.id === type) : undefined;

  let preflight = null;
  if (selectedType) {
    const [detail, fields, brands] = await Promise.all([
      getDocumentType(supabase, selectedType.id as DocumentTypeId),
      listPreflightFields(supabase, selected.id),
      listBrandProfiles(supabase, workspace.id),
    ]);
    const readiness = computeGenerationReadiness(
      detail?.sections.map((s) => ({ name: s.name, categories: s.spec_field_categories })) ?? [],
      fields,
    );
    preflight = (
      <section className="specs-section">
        <h2 className="specs-section__title">Spec completeness · {selectedType.name}</h2>
        <p className="specs-grid__meta">
          {readiness.totals.populated} of {readiness.totals.total} mapped field
          {readiness.totals.total === 1 ? '' : 's'} populated
          {readiness.totals.requiredEmpty > 0
            ? ` · ${readiness.totals.requiredEmpty} required field${readiness.totals.requiredEmpty === 1 ? '' : 's'} still empty`
            : ''}
          .
        </p>
        <ul className="specs-form" aria-label="Section readiness">
          {readiness.sections.map((s) => (
            <li key={s.name} className="specs-section">
              <strong>{s.name}</strong>{' '}
              <span className="specs-grid__meta">
                {s.populated} / {s.total} populated
              </span>
              {s.requiredEmpty.length > 0 ? (
                <p className="ui-field__error">
                  Required but empty: {s.requiredEmpty.map(refLabel).join(', ')} — these generate as
                  placeholders you must fill before publishing.
                </p>
              ) : null}
              {s.unmappedCategories.length > 0 ? (
                <p className="specs-grid__meta">No fields in: {s.unmappedCategories.join(', ')}</p>
              ) : null}
            </li>
          ))}
        </ul>
        {readiness.sections.length === 0 ? (
          <p className="specs-grid__meta">
            This Document Type has no sections yet — <Link href="/settings/document-types">add some</Link>.
          </p>
        ) : null}
        {readiness.uncategorizedFields.length > 0 ? (
          <p className="specs-grid__meta">
            {readiness.uncategorizedFields.length} field
            {readiness.uncategorizedFields.length === 1 ? '' : 's'} aren’t in any section’s
            categories — they won’t be injected.
          </p>
        ) : null}
        <GenerateConfirm
          productId={selected.id}
          documentTypeId={selectedType.id}
          brands={brands.map((b) => ({ id: b.id, name: b.name, isDefault: b.is_workspace_default }))}
        />
      </section>
    );
  }

  return (
    <main className="import-canvas">
      <h1 className="specs-title">Generate a document</h1>
      <p className="specs-grid__meta">
        Generating from <strong>{selected.name}</strong>. Pick a Document Type to see how complete
        its spec inputs are, then confirm.
      </p>
      {types.length > 0 ? (
        <nav className="specs-tabs" aria-label="Document types">
          {types.map((t) => (
            <Link
              key={t.id}
              className={`specs-tabs__tab${selectedType?.id === t.id ? ' specs-tabs__tab--active' : ''}`}
              href={`/specs/generate?product=${selected.id}&type=${t.id}`}
              aria-current={selectedType?.id === t.id ? 'page' : undefined}
            >
              {t.name}
            </Link>
          ))}
        </nav>
      ) : (
        <p className="specs-grid__meta">
          No Document Types yet — <Link href="/settings/document-types">set one up</Link> first.
        </p>
      )}
      {preflight ?? (selectedType ? null : <p className="specs-grid__meta">Choose a Document Type above.</p>)}
      <p className="specs-grid__meta">
        <Link href={`/specs?product=${selected.id}`}>← Back to {selected.name}</Link>
      </p>
    </main>
  );
}
