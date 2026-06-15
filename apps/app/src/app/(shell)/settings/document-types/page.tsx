import Link from 'next/link';
import {
  getActiveWorkspace,
  listArchivedDocumentTypes,
  listDocumentTypes,
  type DocumentTypeRow,
} from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import {
  ArchiveButton,
  CreateDocumentTypeForm,
  ForkButton,
} from './DocumentTypeForms';

/**
 * Document Types (G0.1) — the generation schemas an author picks at generation
 * time. A Settings/admin surface: members read, owners/admins fork/create/edit
 * (0004 RLS + canDo 'doctype.manage'). Built-ins are global and
 * forkable-not-editable; forking yields an editable workspace copy (0017 RPC).
 * Section-schema editing (categories→sections, brief_required, reorder) lands
 * with G0.2; this surface owns the type list, fork, create, rename, archive.
 */
export default async function DocumentTypesPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Document types"
          description="The generation schemas — datasheets, manuals, guides — live here once the environment is provisioned."
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
          <Link className="specs-field-link" href="/settings">
            ← Workspace settings
          </Link>
        </p>
        <h1 className="specs-title">Document types</h1>
        <p className="specs-grid__meta">
          A document type is a generation schema — what a good datasheet, manual, or guide
          contains and which spec data feeds each section. Fork a built-in to customise it, or
          create your own.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Your types</h2>
          {workspaceTypes.length > 0 ? (
            <ul className="specs-form" aria-label="Workspace document types">
              {workspaceTypes.map((t) => (
                <DocumentTypeItem key={t.id} type={t} canManage={canManage} />
              ))}
            </ul>
          ) : (
            <p className="specs-grid__meta">
              No custom types yet — fork a built-in below or create one from scratch.
            </p>
          )}
          {canManage ? <CreateDocumentTypeForm /> : null}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Built-in types</h2>
          <p className="specs-grid__meta">
            Maintained by Arther and improved over time. Built-ins can’t be edited directly —
            fork one to make an editable copy.
          </p>
          <ul className="specs-form" aria-label="Built-in document types">
            {builtIns.map((t) => (
              <li key={t.id} className="specs-release">
                <span>
                  <Link className="specs-field-link" href={`/settings/document-types/${t.id}`}>
                    {t.name}
                  </Link>
                  <span className="specs-release__tag">{t.section_count} sections</span>
                  {t.description ? (
                    <span className="specs-grid__meta"> — {t.description}</span>
                  ) : null}
                </span>
                {canManage ? <ForkButton sourceId={t.id} /> : null}
              </li>
            ))}
          </ul>
        </section>

        {canManage && archived.length > 0 ? (
          <details className="specs-section">
            <summary className="specs-section__title">Archived ({archived.length})</summary>
            <ul className="specs-form" aria-label="Archived document types">
              {archived.map((t) => (
                <li key={t.id} className="specs-release">
                  <span>
                    {t.name}
                    <span className="specs-release__tag">archived</span>
                  </span>
                  <ArchiveButton id={t.id} archived />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </AppShell>
  );
}

function DocumentTypeItem({
  type,
  canManage,
}: {
  type: DocumentTypeRow;
  canManage: boolean;
}) {
  return (
    <li className="specs-release">
      <span>
        <Link className="specs-field-link" href={`/settings/document-types/${type.id}`}>
          {type.name}
        </Link>
        <span className="specs-release__tag">{type.section_count} sections</span>
        {type.forked_from ? (
          <span className="specs-grid__meta"> · forked from a built-in</span>
        ) : null}
        {type.description ? <span className="specs-grid__meta"> — {type.description}</span> : null}
      </span>
      {canManage ? <ArchiveButton id={type.id} archived={false} /> : null}
    </li>
  );
}
