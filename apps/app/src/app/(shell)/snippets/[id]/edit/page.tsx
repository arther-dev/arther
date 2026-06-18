import Link from 'next/link';
import { getActiveWorkspace, getLibraryItem } from '@arther/db';
import { libraryItemIdSchema } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { LibraryItemEditor } from './LibraryItemEditor';

/**
 * R.2c — edit a library item's block content in place. Editor-gated (members
 * write, viewers excluded). Authoring reuses the document editor's rich-text +
 * block primitives; saving records a version and propagates to live embeds.
 */
export default async function SnippetEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idParsed = libraryItemIdSchema.safeParse(id);

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Edit content"
          description="The block library is available once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const workspace = idParsed.success ? await getActiveWorkspace(supabase) : null;
  const item = workspace && idParsed.success ? await getLibraryItem(supabase, idParsed.data) : null;
  if (!workspace || !item) {
    return (
      <AppShell>
        <EmptyState
          title="Edit content"
          description="This library item doesn’t exist, or you don’t have access to it."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/snippets">
              Back to the library
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
          title="Edit content"
          description="Viewers can read the library but can’t edit its content."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <LibraryItemEditor id={item.id} initialBlocks={item.blocks} />
    </AppShell>
  );
}
