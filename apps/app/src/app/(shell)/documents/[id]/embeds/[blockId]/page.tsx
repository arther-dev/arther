import Link from 'next/link';
import { getActiveWorkspace, getDocument, getSnippetEmbedContent } from '@arther/db';
import { canManageDocumentLifecycle, type DocumentId } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../../lib/supabase/server';
import { LibraryItemEditor } from '../../../../snippets/[id]/edit/LibraryItemEditor';
import { overrideSnippetEmbedAction } from '../actions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * R.3 — override a snippet embed for this document (§5.4). The current effective
 * content (the live source, or the existing override) is loaded into the shared
 * block editor; saving writes `override_blocks` and detaches the embed from the
 * live source until the owner accepts the source again. Document-owner only.
 */
export default async function OverrideEmbedPage({
  params,
}: {
  params: Promise<{ id: string; blockId: string }>;
}) {
  const { id, blockId } = await params;
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Override snippet"
          description="Snippet overrides are available once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  const document = workspace && UUID_RE.test(id) ? await getDocument(supabase, id as DocumentId) : null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canManage =
    !!document &&
    !!user &&
    !!workspace &&
    canManageDocumentLifecycle({
      documentOwnerId: document.owner_id,
      userId: user.id,
      role: workspace.role,
    });
  const embed = canManage && UUID_RE.test(blockId) ? await getSnippetEmbedContent(supabase, blockId) : null;

  if (!document || !canManage || !embed) {
    return (
      <AppShell>
        <EmptyState
          title="Override snippet"
          description="This snippet embed doesn’t exist, or only the document owner can override it."
          primaryAction={
            document ? (
              <Link className="ui-btn ui-btn--primary" href={`/documents/${document.id}`}>
                Back to the document
              </Link>
            ) : undefined
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <LibraryItemEditor
        id={blockId}
        initialBlocks={embed.blocks}
        onSave={overrideSnippetEmbedAction}
        heading="Override snippet"
        intro="These edits apply only to this document — the source snippet is unchanged. Accept the source any time to drop the override and follow the live snippet again."
        backHref={`/documents/${document.id}`}
        backLabel="Back to the document"
      />
    </AppShell>
  );
}
