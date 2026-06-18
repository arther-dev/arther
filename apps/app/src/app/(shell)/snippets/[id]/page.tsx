import Link from 'next/link';
import {
  getActiveWorkspace,
  getLibraryItem,
  listSnippetReviewItems,
  listUsersByIds,
} from '@arther/db';
import { blockPlainText, libraryItemIdSchema, libraryItemTypeLabel } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { ArchiveSnippetButton, RenameSnippetForm } from '../SnippetForms';
import { RestoreVersionButton } from './RestoreVersionButton';

function NotFound() {
  return (
    <AppShell>
      <EmptyState
        title="Library item"
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

/**
 * R.1 — a single library item: its metadata, a read-only content preview, the
 * version history, and the rename/archive controls. Authoring the block content
 * in place (the shared document editor surface) and the promotion/insert flows
 * are R.2.
 */
export default async function SnippetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idParsed = libraryItemIdSchema.safeParse(id);
  if (!idParsed.success) return <NotFound />;

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Library item"
          description="The block library is available once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return <NotFound />;

  const item = await getLibraryItem(supabase, idParsed.data);
  if (!item) return <NotFound />;

  const owners = item.ownerId ? await listUsersByIds(supabase, [item.ownerId]) : null;
  const ownerLabel = item.ownerId
    ? (owners?.get(item.ownerId)?.name ?? owners?.get(item.ownerId)?.email ?? 'Unknown')
    : 'Unassigned';
  const canEdit = workspace.role !== 'viewer';

  // R.9 — a spec change may have flagged this snippet's prose as stale; editing it
  // resolves the flag everywhere. Surface the prompt to the owner/editors.
  const staleReview =
    item.type === 'snippet'
      ? (await listSnippetReviewItems(supabase, workspace.id)).find((r) => r.snippetId === item.id)
      : undefined;

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/snippets">← Block library</Link>
        </p>
        <h1 className="specs-title">{item.name}</h1>
        <p className="specs-grid__meta">
          {libraryItemTypeLabel(item.type)} · owned by {ownerLabel}
          {item.type === 'snippet'
            ? ` · ${item.embedCount} embed${item.embedCount === 1 ? '' : 's'}`
            : ''}
        </p>
        {item.archivedAt ? (
          <p className="ui-field__hint">
            Archived. It can’t be embedded into new documents until it’s restored.
          </p>
        ) : null}
        {staleReview ? (
          <p className="ui-field__error" role="status">
            A spec change may have made this snippet’s prose stale
            {staleReview.embeddingDocumentCount > 0
              ? ` (used in ${staleReview.embeddingDocumentCount} document${
                  staleReview.embeddingDocumentCount === 1 ? '' : 's'
                })`
              : ''}
            . {canEdit ? 'Edit the content to review it — that clears the flag everywhere.' : ''}
          </p>
        ) : null}

        <section className="specs-section">
          <h2 className="specs-section__title">Content</h2>
          {item.blocks.length === 0 ? (
            <p className="specs-grid__meta">This item has no blocks yet.</p>
          ) : (
            <ol className="specs-form" aria-label="Block sequence">
              {item.blocks.map((block, i) => {
                const text = blockPlainText(block).trim();
                return (
                  <li key={i} className="specs-release">
                    <span className="specs-release__tag">{block.type}</span>
                    <span className="specs-grid__meta">{text || '(empty)'}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {canEdit ? (
            <p className="specs-grid__meta" style={{ marginTop: 8 }}>
              <Link className="ui-btn ui-btn--secondary ui-btn--sm" href={`/snippets/${item.id}/edit`}>
                Edit content
              </Link>
            </p>
          ) : (
            <p className="ui-field__hint">Read-only preview.</p>
          )}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Version history</h2>
          <ul className="specs-form" aria-label="Version history">
            {item.versions.map((v, i) => (
              <li key={v.versionId} className="specs-release" style={{ display: 'flex', gap: 8 }}>
                <span>{v.changeNote ?? 'Edited'}</span>
                <span className="specs-grid__meta">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
                <span style={{ flex: 1 }} />
                {/* The newest version (i === 0) is the current content — nothing to restore. */}
                {canEdit && i > 0 ? (
                  <RestoreVersionButton
                    id={item.id}
                    versionId={v.versionId}
                    label={new Date(v.createdAt).toLocaleDateString()}
                  />
                ) : i === 0 ? (
                  <span className="specs-grid__meta">Current</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {canEdit ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Manage</h2>
            <RenameSnippetForm id={item.id} name={item.name} />
            <div className="specs-form--row">
              <ArchiveSnippetButton
                id={item.id}
                name={item.name}
                archived={Boolean(item.archivedAt)}
              />
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
