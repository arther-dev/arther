import Link from 'next/link';
import { getActiveWorkspace, listDocumentTypes } from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import {
  CreateDocumentTypeForm,
  ForkButton,
  WorkspaceDocumentType,
} from './DocumentTypeForms';

/**
 * Document Types (G0.1 / G0.2) — the generation schema. Admins fork a built-in
 * (or create from scratch) into an editable workspace copy, then shape its
 * ordered section data contract: each section maps spec field categories and
 * toggles whether a brief is required (plan §7 Q2 — bounded structural editing).
 * An admin Settings surface; rail-less like the rest of Settings (Handoff 02).
 */
export default async function DocumentTypesPage() {
  const supabase = await getSupabaseServer();

  if (!supabase) {
    return (
      <AppShell>
        <div className="specs-content">
          <SettingsBreadcrumb />
          <h1 className="specs-title">Document Types</h1>
          <EmptyState
            title="Document Types"
            description="The generation schemas — built-in and workspace types — appear here once the environment is provisioned."
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
          description="Document Types live inside a workspace — set yours up and come back."
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
  const workspaceTypes = types.filter((t) => !t.built_in);

  return (
    <AppShell>
      <div className="specs-content">
        <SettingsBreadcrumb />
        <h1 className="specs-title">Document Types</h1>
        <p className="specs-grid__meta">
          A Document Type is the generation schema — what a document of this kind contains and which
          spec data feeds each section. Built-ins are forkable, not directly editable.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Your Document Types</h2>
          {workspaceTypes.length === 0 ? (
            <p className="specs-grid__meta">
              None yet — fork a built-in below or create one from scratch.
            </p>
          ) : (
            workspaceTypes.map((type) => (
              <WorkspaceDocumentType key={type.id} type={type} canManage={canManage} />
            ))
          )}
          {canManage ? <CreateDocumentTypeForm /> : null}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Built-in Document Types</h2>
          <p className="specs-grid__meta">
            Maintained by Arther and improved over time. Fork one to get an editable copy.
          </p>
          {builtIns.map((type) => (
            <article key={type.id} className="specs-release">
              <div>
                <strong>{type.name}</strong>
                {type.description ? (
                  <span className="specs-grid__meta"> — {type.description}</span>
                ) : null}
                <div className="specs-grid__meta">
                  {type.sections.length} section{type.sections.length === 1 ? '' : 's'}:{' '}
                  {type.sections.map((s) => s.name).join(' · ')}
                </div>
              </div>
              {canManage ? <ForkButton sourceId={type.id} /> : null}
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function SettingsBreadcrumb() {
  return (
    <p className="specs-grid__meta">
      <Link href="/settings">← Workspace settings</Link>
    </p>
  );
}
