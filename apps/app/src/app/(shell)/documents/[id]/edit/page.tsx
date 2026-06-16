import Link from 'next/link';
import {
  getActiveWorkspace,
  listStaleBriefReferencesForDocument,
  listStaleReferencesForDocument,
  loadDocumentTree,
  resolveSpecFields,
} from '@arther/db';
import { summarizeBriefStaleness, summarizeStaleness, type DocumentId } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { DocumentEditor } from './DocumentEditor';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * G4.1 — the block editor surface. Loads the working revision's block tree (G3)
 * and hands it to the three-panel editor shell. Read-only canvas for now; the
 * editing model (G4.3) and property editors (G4.2) build on this.
 */
export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Document editor"
          description="The block editor opens here once the workspace is provisioned (PROVISIONING.md)."
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
    <DocumentEditor
      documentId={tree.document.id}
      revisionId={tree.revision.id}
      title={tree.document.title}
      state={tree.revision.state}
      staleFields={stale.fields}
      staleBlockIds={stale.blockIds}
      staleBriefKeys={briefStale.keys}
      staleBriefBlockIds={briefStale.blockIds}
      resolved={resolved}
      blocks={tree.blocks.map((b) => ({
        id: b.id,
        content: b.content,
        type: b.type,
        source: b.source,
        lastEditedAt: b.last_edited_at,
      }))}
    />
  );
}
