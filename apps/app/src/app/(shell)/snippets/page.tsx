import Link from 'next/link';
import { getActiveWorkspace, listLibraryItems } from '@arther/db';
import { libraryItemTypeLabel } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../lib/supabase/server';
import { CreateSnippetForm } from './SnippetForms';

/**
 * R.1 — the block library (Content Reuse). The workspace's reusable block
 * sequences: snippets (live transclusion) and templates (copy-on-insert). This
 * surface lists and creates them; authoring the block content, embedding into
 * documents, and the override model arrive with R.2. Editor-gated (members write,
 * viewers excluded) — the 0009 write RLS, surfaced here as a role check too.
 */
export default async function SnippetsPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Block library"
          description="Reusable snippets and templates live here once the environment is provisioned."
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
          description="The block library lives inside a workspace — set yours up and come back."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  if (workspace.role === 'viewer') {
    return (
      <AppShell>
        <EmptyState
          title="Block library"
          description="Viewers can read documents but can't manage the reusable block library."
        />
      </AppShell>
    );
  }

  const items = await listLibraryItems(supabase, workspace.id);

  return (
    <AppShell>
      <div className="specs-content">
        <h1 className="specs-title">Block library</h1>
        <p className="specs-grid__meta">
          Reusable block sequences. A <strong>snippet</strong> stays live — editing the source
          updates every document that embeds it; a <strong>template</strong> is a copy-on-insert
          starter with no live link.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Items</h2>
          {items.length === 0 ? (
            <p className="specs-grid__meta">No library items yet — create your first below.</p>
          ) : (
            <ul className="specs-form" aria-label="Library items">
              {items.map((item) => (
                <li key={item.id} className="specs-release">
                  <Link href={`/snippets/${item.id}`}>{item.name}</Link>
                  <span className="specs-release__tag">{libraryItemTypeLabel(item.type)}</span>
                  {item.type === 'snippet' ? (
                    <span className="specs-grid__meta">
                      {item.embedCount > 0
                        ? `${item.embedCount} embed${item.embedCount === 1 ? '' : 's'}`
                        : 'no embeds'}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">New library item</h2>
          <CreateSnippetForm />
        </section>
      </div>
    </AppShell>
  );
}
