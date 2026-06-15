import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveWorkspace, getDocumentType } from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import type { DocumentTypeId } from '@arther/types';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { ForkButton, RenameDocumentTypeForm } from '../DocumentTypeForms';

/**
 * Document Type detail (G0.1) — the section schema (each section's data
 * contract: which spec-field categories and brief fragments feed it) and the
 * approval roles, shown read-only. Workspace types get a rename form; built-ins
 * are forkable-not-editable, so they offer a Fork action instead. Editing the
 * section data contracts (reorder, map categories, toggle brief_required) is
 * G0.2 — this surface establishes the type and shows its shape.
 */
export default async function DocumentTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Document type"
          description="Available once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace || !user) notFound();

  const type = await getDocumentType(supabase, id as DocumentTypeId);
  if (!type) notFound();

  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const isWorkspaceType = type.workspace_id !== null && !type.built_in;

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link className="specs-field-link" href="/settings/document-types">
            ← Document types
          </Link>
        </p>
        <h1 className="specs-title">{type.name}</h1>
        <p className="specs-grid__meta">
          {type.built_in ? 'Built-in type' : 'Workspace type'}
          {type.forked_from ? ' · forked from a built-in' : ''}
          {type.description ? ` — ${type.description}` : ''}
        </p>

        {canManage && type.built_in ? (
          <section className="specs-section">
            <p className="specs-grid__meta">
              Built-in types can’t be edited. Fork this to make an editable workspace copy.
            </p>
            <ForkButton sourceId={type.id} label="Fork to customise" />
          </section>
        ) : null}

        {canManage && isWorkspaceType ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Details</h2>
            <RenameDocumentTypeForm
              id={type.id}
              currentName={type.name}
              currentDescription={type.description}
            />
          </section>
        ) : null}

        <section className="specs-section">
          <h2 className="specs-section__title">Sections ({type.sections.length})</h2>
          {type.sections.length > 0 ? (
            <table className="specs-grid">
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Spec categories</th>
                  <th scope="col">Brief fragments</th>
                  <th scope="col">Brief</th>
                </tr>
              </thead>
              <tbody>
                {type.sections.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="specs-grid__meta">{s.spec_field_categories.join(', ') || '—'}</td>
                    <td className="specs-grid__meta">{s.brief_fragment_keys.join(', ') || '—'}</td>
                    <td className="specs-grid__meta">{s.brief_required ? 'required' : 'optional'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="specs-grid__meta">No sections defined yet.</p>
          )}
        </section>

        {type.approval_roles.length > 0 ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Approval roles</h2>
            <ul className="specs-form" aria-label="Approval roles">
              {type.approval_roles.map((r) => (
                <li key={r.id} className="specs-release">
                  {r.role_label}
                  <span className="specs-release__tag">{r.required ? 'required' : 'optional'}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
