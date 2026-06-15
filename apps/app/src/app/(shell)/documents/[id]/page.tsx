import Link from 'next/link';
import { BlockRenderer } from '@arther/block-renderer';
import { getActiveWorkspace, loadDocumentTree } from '@arther/db';
import { type DocumentId } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * G4.4 — read-only document view: load the working revision's block tree (G3)
 * and render it through the one shared `block-renderer`. The three-panel editor
 * (G4.1) builds on this; for now generated Drafts are viewable end-to-end.
 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Document preview"
          description="Generated documents render here once the workspace is provisioned (PROVISIONING.md)."
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
          description="Documents live inside a workspace."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  // F8.5: a malformed id degrades to "not found", never a 500.
  const tree = UUID_RE.test(id) ? await loadDocumentTree(supabase, id as DocumentId) : null;
  if (!tree) {
    return (
      <AppShell>
        <EmptyState
          title="Document not found"
          description="It may have been deleted, or you don’t have access to it."
          secondaryAction={
            <Link className="ui-btn ui-btn--ghost" href="/specs">
              Back to Specs
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <article className="br-document specs-content">
        <header className="specs-form--row">
          <h1 className="specs-title">{tree.document.title}</h1>
          <span className={`import-status import-status--${tree.revision.state}`}>
            {tree.revision.state}
          </span>
          <span style={{ flex: 1 }} />
          <Link className="ui-btn ui-btn--primary" href={`/documents/${tree.document.id}/edit`}>
            Edit
          </Link>
        </header>
        {tree.blocks.length > 0 ? (
          <BlockRenderer blocks={tree.blocks.map((b) => b.content)} />
        ) : (
          <p className="specs-grid__meta">This document has no content yet.</p>
        )}
        <p className="specs-grid__meta">
          <Link href="/specs">← Back to Specs</Link>
        </p>
      </article>
    </AppShell>
  );
}
