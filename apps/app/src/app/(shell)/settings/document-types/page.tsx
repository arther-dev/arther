import Link from 'next/link';
import {
  getActiveWorkspace,
  getDocumentType,
  listDocumentTypes,
  type DocumentTypeDetail,
  type DocumentTypeRow,
} from '@arther/db';
import type { DocumentTypeId } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import {
  ArchiveButton,
  CreateDocumentTypeForm,
  ForkButton,
  RenameDocumentTypeForm,
} from './DocumentTypeForms';

/**
 * Document Types settings (G0.1) — the generation schema admins manage before
 * anything generates (generator spec §3.4). Built-ins are global, forkable, and
 * not editable; workspace types (incl. forks) can be renamed and archived.
 * `?type=` opens a read-only section breakdown (per-section data contract);
 * section *editing* lands with G0.2. Settings is a rail-less mode.
 */
export default async function DocumentTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const supabase = await getSupabaseServer();

  if (!supabase) {
    return (
      <AppShell>
        <div className="specs-content">
          <h1 className="specs-title">Document types</h1>
          <EmptyState
            title="Document types"
            description="The generation schemas your documents are produced from — built-in types to fork and your own — live here once the environment is provisioned."
          />
        </div>
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
  const types = await listDocumentTypes(supabase, workspace.id);
  const builtIns = types.filter((t) => t.built_in);
  const workspaceTypes = types.filter((t) => !t.built_in && !t.archived_at);
  const archived = types.filter((t) => !t.built_in && t.archived_at);

  const { type: selectedId } = await searchParams;
  const detail = selectedId
    ? await getDocumentType(supabase, selectedId as DocumentTypeId)
    : null;

  return (
    <AppShell>
      <div className="specs-content">
        <h1 className="specs-title">Document types</h1>
        <p className="specs-grid__meta">
          A document type is a generation schema — it defines what kind of document this is and
          how to produce it. Fork a built-in to get an editable copy, or create your own.
        </p>

        {detail ? <DocumentTypePanel detail={detail} canManage={canManage} /> : null}

        <section className="specs-section">
          <h2 className="specs-section__title">Your document types</h2>
          {workspaceTypes.length > 0 ? (
            <ul className="specs-form" aria-label="Workspace document types">
              {workspaceTypes.map((t) => (
                <DocumentTypeListItem key={t.id} type={t} canManage={canManage} editable />
              ))}
            </ul>
          ) : (
            <p className="specs-grid__meta">
              No custom document types yet — fork a built-in below or create one.
            </p>
          )}
          {canManage ? <CreateDocumentTypeForm /> : null}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Built-in document types</h2>
          <p className="specs-grid__meta">
            Maintained by Arther and improved over time. Fork one to customise its sections.
          </p>
          <ul className="specs-form" aria-label="Built-in document types">
            {builtIns.map((t) => (
              <DocumentTypeListItem key={t.id} type={t} canManage={canManage} editable={false} />
            ))}
          </ul>
        </section>

        {archived.length > 0 ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Archived</h2>
            <p className="specs-grid__meta">
              Archived types can't start new documents; documents already generated from them are
              untouched.
            </p>
            <ul className="specs-form" aria-label="Archived document types">
              {archived.map((t) => (
                <li key={t.id} className="specs-release">
                  <span>{t.name}</span>
                  <span className="specs-release__tag">archived</span>
                  {canManage ? <ArchiveButton typeId={t.id} archived /> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="specs-grid__meta">
          <Link href="/settings">← Back to workspace settings</Link>
        </p>
      </div>
    </AppShell>
  );
}

function DocumentTypeListItem({
  type,
  canManage,
  editable,
}: {
  type: DocumentTypeRow;
  canManage: boolean;
  editable: boolean;
}) {
  return (
    <li className="specs-release">
      <Link href={`/settings/document-types?type=${type.id}`} className="specs-release__name">
        {type.name}
      </Link>
      <span className="specs-release__tag">{type.built_in ? 'built-in' : 'workspace'}</span>
      {type.forked_from ? <span className="specs-grid__meta">forked</span> : null}
      <span className="specs-grid__meta">
        {type.section_count} section{type.section_count === 1 ? '' : 's'}
      </span>
      {type.description ? <span className="specs-grid__meta">{type.description}</span> : null}
      {canManage && type.built_in ? <ForkButton typeId={type.id} /> : null}
      {canManage && editable ? (
        <>
          <RenameDocumentTypeForm
            typeId={type.id}
            currentName={type.name}
            currentDescription={type.description}
          />
          <ArchiveButton typeId={type.id} archived={false} />
        </>
      ) : null}
    </li>
  );
}

/** Read-only section breakdown — the per-section data contract (generator §3.4). */
function DocumentTypePanel({
  detail,
  canManage,
}: {
  detail: DocumentTypeDetail;
  canManage: boolean;
}) {
  return (
    <section className="specs-section" aria-label={`${detail.name} sections`}>
      <h2 className="specs-section__title">{detail.name}</h2>
      {detail.description ? <p className="specs-grid__meta">{detail.description}</p> : null}
      {detail.built_in ? (
        <p className="specs-grid__meta">
          Built-in (canonical). {canManage ? 'Fork it to edit its sections.' : ''}
        </p>
      ) : null}
      {detail.sections.length > 0 ? (
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
            {detail.sections.map((s) => (
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
  );
}
