import Link from 'next/link';
import {
  getActiveWorkspace,
  getDocumentTypeDetail,
  listDocumentTypes,
  type DocumentTypeRow,
} from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import type { DocumentTypeId } from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import {
  ArchiveDocumentTypeButton,
  CreateDocumentTypeForm,
  ForkButton,
  RenameDocumentTypeForm,
} from './DocumentTypeForms';

/**
 * Document Types — the generation schema (G0.1, generator spec §3.4). Arther's
 * built-ins are forkable but never editable; a workspace owns its own types and
 * forks. Admin-managed Settings surface (0004 policy): members read, owner/admin
 * write. Section editing (categories → sections, brief keys, block types) is the
 * read-only detail panel here and becomes editable in G0.2.
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
        <EmptyState
          title="Document types"
          description="The generation schemas your workspace uses live here once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) {
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
  const own = types.filter((t) => !t.built_in && !t.archived_at);
  const archived = types.filter((t) => !t.built_in && t.archived_at);

  const { type: selectedId } = await searchParams;
  const detail = selectedId
    ? await getDocumentTypeDetail(supabase, selectedId as DocumentTypeId)
    : null;

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/settings">← Workspace settings</Link>
        </p>
        <h1 className="specs-title">Document types</h1>
        <p className="specs-grid__meta">
          A document type is a generation schema — it defines what a kind of document contains and
          how it is produced. Fork a built-in to make an editable copy, or create your own.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Built-in</h2>
          <p className="specs-grid__meta">
            Maintained by Arther and improved over time — fork one to customise it.
          </p>
          <ul className="specs-form" aria-label="Built-in document types">
            {builtIns.map((t) => (
              <DocumentTypeListItem key={t.id} type={t} canManage={canManage} selectedId={selectedId} />
            ))}
          </ul>
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Your document types</h2>
          {own.length > 0 ? (
            <ul className="specs-form" aria-label="Workspace document types">
              {own.map((t) => (
                <DocumentTypeListItem
                  key={t.id}
                  type={t}
                  canManage={canManage}
                  selectedId={selectedId}
                />
              ))}
            </ul>
          ) : (
            <p className="specs-grid__meta">No custom document types yet.</p>
          )}
          {canManage ? <CreateDocumentTypeForm /> : null}
        </section>

        {archived.length > 0 ? (
          <details className="specs-grid__meta">
            <summary>Archived ({archived.length})</summary>
            <ul className="specs-form" aria-label="Archived document types">
              {archived.map((t) => (
                <DocumentTypeListItem
                  key={t.id}
                  type={t}
                  canManage={canManage}
                  selectedId={selectedId}
                />
              ))}
            </ul>
          </details>
        ) : null}

        {detail ? (
          <section className="specs-section">
            <h2 className="specs-section__title">{detail.name} — sections</h2>
            {detail.sections.length > 0 ? (
              <table className="specs-grid">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Section</th>
                    <th scope="col">Spec categories</th>
                    <th scope="col">Brief fragments</th>
                    <th scope="col">Brief</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.sections.map((s) => (
                    <tr key={s.id}>
                      <td className="specs-grid__meta">{s.display_order}</td>
                      <td>{s.name}</td>
                      <td className="specs-grid__meta">
                        {s.spec_field_categories.join(', ') || '—'}
                      </td>
                      <td className="specs-grid__meta">
                        {s.brief_fragment_keys.join(', ') || '—'}
                      </td>
                      <td className="specs-grid__meta">{s.brief_required ? 'required' : 'optional'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="specs-grid__meta">This type has no sections yet.</p>
            )}
            <p className="specs-grid__meta">Section editing arrives with the generator (G0.2).</p>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function DocumentTypeListItem({
  type,
  canManage,
  selectedId,
}: {
  type: DocumentTypeRow;
  canManage: boolean;
  selectedId?: string;
}) {
  const isSelected = selectedId === type.id;
  return (
    <li className="specs-release">
      <Link
        href={`/settings/document-types?type=${type.id}`}
        aria-current={isSelected ? 'true' : undefined}
      >
        {type.name}
      </Link>
      {type.built_in ? <span className="specs-release__tag">built-in</span> : null}
      {type.forked_from ? <span className="specs-release__tag">forked</span> : null}
      {type.archived_at ? <span className="specs-release__tag">archived</span> : null}
      <span className="specs-grid__meta">
        {type.section_count} section{type.section_count === 1 ? '' : 's'}
      </span>
      {type.description ? <span className="specs-grid__meta">— {type.description}</span> : null}
      {canManage && type.built_in ? <ForkButton documentTypeId={type.id} name={type.name} /> : null}
      {canManage && !type.built_in ? (
        <>
          <ArchiveDocumentTypeButton
            documentTypeId={type.id}
            name={type.name}
            archived={Boolean(type.archived_at)}
          />
          {!type.archived_at ? (
            <RenameDocumentTypeForm
              documentTypeId={type.id}
              name={type.name}
              description={type.description}
            />
          ) : null}
        </>
      ) : null}
    </li>
  );
}
