'use client';

import { useState } from 'react';
import { libraryItemTypeLabel } from '@arther/types';
import { Button } from '@arther/ui';
import { listLibraryItemsForInsertAction, type LibraryInsertListing } from './actions';

/**
 * R.6 — the editor's "Insert from Library" picker. Lazily loads the workspace's
 * library items; a **template** inserts as an independent copy (copy-on-insert),
 * while **snippets** are shown but not yet insertable — the live `snippet_embeds`
 * link is the next slice. The actual insert + block-list merge happens in the
 * editor via `onInsertTemplate` (it mirrors paste).
 */
export function LibraryInsert({
  onInsertTemplate,
  disabled,
}: {
  onInsertTemplate: (libraryItemId: string) => Promise<void> | void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LibraryInsertListing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (items === null) {
      setLoading(true);
      setError(null);
      const res = await listLibraryItemsForInsertAction();
      setLoading(false);
      if (!res.ok) {
        setError(res.error ?? 'Could not load the block library.');
        return;
      }
      setItems(res.items ?? []);
    }
  }

  async function pick(id: string) {
    setBusyId(id);
    await onInsertTemplate(id);
    setBusyId(null);
    setOpen(false);
  }

  return (
    <>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={toggle} aria-expanded={open}>
        Insert from Library
      </Button>
      {open ? (
        <div className="specs-form" style={{ marginTop: 8 }}>
          {loading ? <p className="specs-grid__meta">Loading…</p> : null}
          {error ? <p className="ui-field__error">{error}</p> : null}
          {items && items.length === 0 ? (
            <p className="specs-grid__meta">
              No library items yet. Select blocks and use “Save to Library” to create one.
            </p>
          ) : null}
          {items && items.length > 0 ? (
            <ul className="specs-form" aria-label="Block library">
              {items.map((it) => (
                <li key={it.id} className="specs-release">
                  <span>{it.name}</span>
                  <span className="specs-release__tag">{libraryItemTypeLabel(it.type)}</span>
                  {it.type === 'template' ? (
                    <button
                      type="button"
                      className="specs-value-button"
                      disabled={busyId !== null}
                      onClick={() => pick(it.id)}
                    >
                      {busyId === it.id ? 'Inserting…' : 'Insert'}
                    </button>
                  ) : (
                    <span className="specs-grid__meta">Live embed — coming soon</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
