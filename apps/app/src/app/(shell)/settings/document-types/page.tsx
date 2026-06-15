import Link from 'next/link';
import {
  getActiveWorkspace,
  listArchivedDocumentTypes,
  listDocumentTypes,
} from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import {
  ArchiveButton,
  CreateDocumentTypeForm,
  ForkButton,
  RenameDocumentTypeForm,
} from './DocumentTypeForms';

/**
 * Document Types settings (G0.1): the generation schema. Arther ships curated
 * built-in types (global, read-only) that a workspace forks to customise;
 * workspaces can also author types from scratch. Section-schema editing
 * (reorder, category maps, brief_required) lands in G0.2 — this surface owns
 * the lifecycle: list, create, fork, rename, archive/restore. Admin-managed
 * (canDo 'workspace.manage'); read-only members see the catalogue.
 */
export default async function DocumentTypesPage() {
  const supabase = await getSupabaseServer();

  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Document types"
          description="Built-in and workspace generation schemas live here once the environment is provisioned."
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
          <Link href="/settings">← Workspace settings</Link>
        </p>
        <h1 className="specs-title">Document types</h1>
        <p className="specs-grid__meta">
          A document type is a generation schema — it defines what kind of document this is and how
          to produce it. Fork a built-in to customise it, or create your own.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Built-in</h2>
          <p className="specs-grid__meta">
            Maintained by Arther and improved over time. Fork one to get an editable workspace copy.
          </p>
          <ul className="specs-form" aria-label="Built-in document types">
            {builtIns.map((t) => (
              <li key={t.id} className="specs-release">
                <strong>{t.name}</strong>
                {t.description ? <span className="specs-grid__meta"> — {t.description}</span> : null}
                <span className="specs-grid__meta"> · {t.section_count} sections</span>
                {canManage ? <ForkButton type={t} /> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Your document types</h2>
          {workspaceTypes.length === 0 ? (
            <p className="specs-grid__meta">
              None yet — fork a built-in above or create one below.
            </p>
          ) : (
            <ul className="specs-form" aria-label="Workspace document types">
              {workspaceTypes.map((t) => (
                <li key={t.id} className="specs-release">
                  <strong>{t.name}</strong>
                  <span className="specs-grid__meta"> · {t.section_count} sections</span>
                  {t.forked_from ? (
                    <span className="specs-release__tag">forked</span>
                  ) : null}
                  {canManage ? (
                    <>
                      <RenameDocumentTypeForm type={t} />
                      <ArchiveButton type={t} archived={false} />
                    </>
                  ) : t.description ? (
                    <span className="specs-grid__meta"> — {t.description}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canManage ? <CreateDocumentTypeForm /> : null}
        </section>

        {canManage && archived.length > 0 ? (
          <details className="specs-section">
            <summary className="specs-section__title">Archived ({archived.length})</summary>
            <p className="specs-grid__meta">
              Archived types can’t produce new documents; existing documents are untouched.
            </p>
            <ul className="specs-form" aria-label="Archived document types">
              {archived.map((t) => (
                <li key={t.id} className="specs-release">
                  <strong>{t.name}</strong>
                  <ArchiveButton type={t} archived={true} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </AppShell>
  );
}
