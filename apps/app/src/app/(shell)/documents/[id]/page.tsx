import Link from 'next/link';
import { BlockRenderer } from '@arther/block-renderer';
import {
  getActiveWorkspace,
  listStaleBriefReferencesForDocument,
  listStaleReferencesForDocument,
  loadDocumentTree,
  resolveSpecFields,
} from '@arther/db';
import {
  canManageDocumentLifecycle,
  summarizeBriefStaleness,
  summarizeStaleness,
  type DocumentId,
} from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { DocumentLifecycle } from './DocumentLifecycle';

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // C0 — the document owner (or a workspace admin) drives the lifecycle.
  const canManage =
    user != null &&
    canManageDocumentLifecycle({
      documentOwnerId: tree.document.owner_id,
      userId: user.id,
      role: workspace.role,
    });
  const isDraft = tree.revision.state === 'draft';

  const stale = summarizeStaleness(await listStaleReferencesForDocument(supabase, tree.document.id));
  const briefStale = summarizeBriefStaleness(
    await listStaleBriefReferencesForDocument(supabase, tree.document.id),
  );

  // G4 live data blocks — resolve current field values for spec_table + chart.
  const resolved = tree.blocks.some(
    (b) => b.content.type === 'spec_table' || b.content.type === 'chart',
  )
    ? await resolveSpecFields(supabase, tree.document.product_id, workspace.id)
    : undefined;

  return (
    <AppShell>
      <article className="br-document specs-content">
        <header className="specs-form--row">
          <h1 className="specs-title">{tree.document.title}</h1>
          <span className={`import-status import-status--${tree.revision.state}`}>
            {tree.revision.state}
          </span>
          <span style={{ flex: 1 }} />
          {isDraft ? (
            <Link className="ui-btn ui-btn--primary" href={`/documents/${tree.document.id}/edit`}>
              Edit
            </Link>
          ) : (
            <span className="specs-grid__meta" title="Editing is locked outside Draft.">
              Locked while in {tree.revision.state}
            </span>
          )}
        </header>
        {canManage ? (
          <DocumentLifecycle documentId={tree.document.id} state={tree.revision.state} />
        ) : null}
        {stale.fieldCount > 0 ? (
          <p className="ui-field__error" role="status">
            {stale.fieldCount} spec value{stale.fieldCount === 1 ? '' : 's'} changed since this draft
            was generated ({stale.fields.join(', ')}) — review in the editor.
          </p>
        ) : null}
        {briefStale.keyCount > 0 ? (
          <p className="specs-grid__meta" role="status">
            {briefStale.keyCount} brief fragment{briefStale.keyCount === 1 ? '' : 's'} updated since
            this draft was generated ({briefStale.keys.join(', ')}) — the prose may want a refresh.
          </p>
        ) : null}
        {tree.blocks.length > 0 ? (
          <BlockRenderer blocks={tree.blocks.map((b) => b.content)} resolved={resolved} />
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
