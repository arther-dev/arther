'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  LIBRARY_ITEM_TYPES,
  libraryItemTypeLabel,
  type BlockContent,
  type LibraryItemType,
} from '@arther/types';
import { Button } from '@arther/ui';
import { saveSelectionToLibraryAction } from './actions';

/**
 * R.2 — "Save to Library": promote the selected blocks into a reusable snippet or
 * template (the §5.1 flow). Lives in the editor's selection toolbar; the content
 * is sent to the server action, which validates and creates the library item.
 * On success the author gets a direct link to the new item in the block library.
 */
export function SaveToLibrary({ blocks }: { blocks: BlockContent[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<LibraryItemType>('snippet');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  if (savedId) {
    return (
      <p className="specs-grid__meta">
        Saved to library. <Link href={`/snippets/${savedId}`}>Open it →</Link>
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
        disabled={blocks.length === 0}
      >
        Save to Library
      </Button>
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    const res = await saveSelectionToLibraryAction({ name, type, blocks });
    setPending(false);
    if (!res.ok || !res.id) {
      setError(res.error ?? 'Could not save to the library.');
      return;
    }
    setSavedId(res.id);
  }

  return (
    <div className="specs-form" style={{ marginTop: 8, gap: 6 }}>
      <input
        className="ui-field__input"
        placeholder="Library item name"
        aria-label="Library item name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select
        className="ui-field__input"
        aria-label="Library item type"
        value={type}
        onChange={(e) => setType(e.target.value as LibraryItemType)}
      >
        {LIBRARY_ITEM_TYPES.map((t) => (
          <option key={t} value={t}>
            {libraryItemTypeLabel(t)}
          </option>
        ))}
      </select>
      {error ? <p className="ui-field__error">{error}</p> : null}
      <div className="specs-form--row" style={{ gap: 4 }}>
        <Button size="sm" variant="secondary" onClick={submit} disabled={pending || name.trim() === ''}>
          {pending ? 'Saving…' : `Save ${blocks.length} block${blocks.length === 1 ? '' : 's'}`}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
