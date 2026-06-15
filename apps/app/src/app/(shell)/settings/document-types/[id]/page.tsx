import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveWorkspace, getDocumentTypeDetail } from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { EditDocumentTypeForm } from '../DocumentTypeForms';

/**
 * Document Type detail (G0.1) — name/description edit for workspace types
 * (built-ins are read-only, §3.4) and the ordered section schema + approval
 * roles. Section editing (G0.2) and role assignment (G0.3) build on this view.
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
          description="Document type schemas appear here once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  const type = await getDocumentTypeDetail(supabase, id);
  if (!type) notFound();

  const canManage =
    !type.built_in &&
    (workspace?.role === 'owner' || workspace?.role === 'admin') &&
    type.workspace_id === workspace?.id;

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/settings/document-types" className="specs-field-link">
            ← Document types
          </Link>
        </p>
        <h1 className="specs-title">{type.name}</h1>
        <p className="specs-grid__meta">
          {type.built_in
            ? 'Built-in — fork it to make an editable copy.'
            : type.forked_from
              ? 'Forked from a built-in.'
              : 'Custom document type.'}
        </p>

        {canManage ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Details</h2>
            <EditDocumentTypeForm id={type.id} name={type.name} description={type.description} />
          </section>
        ) : type.description ? (
          <section className="specs-section">
            <p>{type.description}</p>
          </section>
        ) : null}

        <section className="specs-section">
          <h2 className="specs-section__title">Sections</h2>
          {type.sections.length > 0 ? (
            <table className="specs-grid">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Section</th>
                  <th scope="col">Spec categories</th>
                  <th scope="col">Brief fragments</th>
                  <th scope="col">Brief required</th>
                </tr>
              </thead>
              <tbody>
                {type.sections.map((s, i) => (
                  <tr key={s.id}>
                    <td className="specs-grid__meta">{i + 1}</td>
                    <td>{s.name}</td>
                    <td className="specs-grid__meta">
                      {s.spec_field_categories.length > 0 ? s.spec_field_categories.join(', ') : '—'}
                    </td>
                    <td className="specs-grid__meta">
                      {s.brief_fragment_keys.length > 0 ? s.brief_fragment_keys.join(', ') : '—'}
                    </td>
                    <td className="specs-grid__meta">{s.brief_required ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="specs-grid__meta">No sections defined yet.</p>
          )}
          <p className="specs-grid__meta">Editing the section schema arrives with G0.2.</p>
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
