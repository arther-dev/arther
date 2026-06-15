import Link from 'next/link';
import {
  getActiveWorkspace,
  listArchivedDocumentTypes,
  listDocumentTypes,
  type DocumentTypeRow,
} from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { ArchiveButton, ForkButton, NewDocumentTypeForm } from './DocumentTypeForms';

/**
 * Document Types (G0.1) — the generation schemas (generator spec §3.4). Built-ins
 * are global and forkable, not editable; workspace types are admin-managed.
 * A Settings sub-surface (rail-less, like the rest of Settings). Section-schema
 * editing (G0.2) and approval-role config (G0.3) land on the detail page next.
 */
export default async function DocumentTypesPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Document types"
          description="The document generation schemas live here once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace || !user) {
    return (
      <AppShell>
        <EmptyState
          title="Create your workspace first"
          description="Document types live inside a workspace — set yours up and come back."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const [types, archived] = await Promise.all([
    listDocumentTypes(supabase, workspace.id),
    canManage ? listArchivedDocumentTypes(supabase, workspace.id) : Promise.resolve([]),
  ]);
  const builtIns = types.filter((t) => t.built_in);
  const workspaceTypes = types.filter((t) => !t.built_in);

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/settings" className="specs-field-link">
            ← Settings
          </Link>
        </p>
        <h1 className="specs-title">Document types</h1>
        <p className="specs-grid__meta">
          A document type is a generation schema — the section structure and data contract Arther
          uses to produce a kind of document. Fork a built-in to customise it, or create your own.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Your document types</h2>
          {workspaceTypes.length > 0 ? (
            <table className="specs-grid">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Sections</th>
                  <th scope="col">Origin</th>
                  {canManage ? <th scope="col"></th> : null}
                </tr>
              </thead>
              <tbody>
                {workspaceTypes.map((t) => (
                  <DocumentTypeRowView key={t.id} type={t} canManage={canManage} />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="specs-grid__meta">
              No workspace document types yet — fork a built-in below or create one.
            </p>
          )}
          {canManage ? <NewDocumentTypeForm /> : null}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Built-in</h2>
          <p className="specs-grid__meta">
            Maintained by Arther and improving over time. Fork one to get an editable workspace copy.
          </p>
          <table className="specs-grid">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Sections</th>
                <th scope="col">Description</th>
                {canManage ? <th scope="col"></th> : null}
              </tr>
            </thead>
            <tbody>
              {builtIns.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/settings/document-types/${t.id}`} className="specs-field-link">
                      {t.name}
                    </Link>
                  </td>
                  <td className="specs-grid__meta">{t.section_count}</td>
                  <td className="specs-grid__meta">{t.description}</td>
                  {canManage ? (
                    <td>
                      <ForkButton sourceId={t.id} name={t.name} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {canManage && archived.length > 0 ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Archived</h2>
            <ul className="specs-form" aria-label="Archived document types">
              {archived.map((t) => (
                <li key={t.id} className="specs-release">
                  {t.name}
                  <span className="specs-grid__meta">
                    archived {new Date(t.archived_at!).toLocaleDateString()}
                  </span>
                  <ArchiveButton id={t.id} name={t.name} archived />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function DocumentTypeRowView({
  type,
  canManage,
}: {
  type: DocumentTypeRow;
  canManage: boolean;
}) {
  return (
    <tr>
      <td>
        <Link href={`/settings/document-types/${type.id}`} className="specs-field-link">
          {type.name}
        </Link>
      </td>
      <td className="specs-grid__meta">{type.section_count}</td>
      <td className="specs-grid__meta">{type.forked_from ? 'Forked from built-in' : 'Custom'}</td>
      {canManage ? (
        <td>
          <ArchiveButton id={type.id} name={type.name} archived={false} />
        </td>
      ) : null}
    </tr>
  );
}
