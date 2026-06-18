'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BlockRenderer } from '@arther/block-renderer';
import {
  defaultBlockContent,
  INSERTABLE_BLOCK_TYPES,
  insertableBlockLabel,
  type BlockContent,
  type InsertableBlockType,
} from '@arther/types';
import { Button } from '@arther/ui';
import { RichTextEditor } from '../../../documents/[id]/edit/RichTextEditor';

interface Row {
  key: string;
  block: BlockContent;
}

export interface BlocksSaveResult {
  ok: boolean;
  error?: string;
}

/**
 * R.2c — the in-place editor for a block sequence (a library item's content, or a
 * snippet embed's override in R.3), reusing the document editor's rich-text +
 * block primitives. Prose blocks edit inline via TipTap; section headers via a
 * title field; other block types render read-only and can be reordered or
 * removed. Persists the whole array via the injected `onSave(id, blocks)`.
 */
export function LibraryItemEditor({
  id,
  initialBlocks,
  onSave,
  heading,
  intro,
  backHref,
  backLabel,
}: {
  id: string;
  initialBlocks: BlockContent[];
  onSave: (id: string, blocks: BlockContent[]) => Promise<BlocksSaveResult>;
  heading: string;
  intro: string;
  backHref: string;
  backLabel: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialBlocks.map((block) => ({ key: crypto.randomUUID(), block })),
  );
  const [insertType, setInsertType] = useState<InsertableBlockType>('paragraph');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const touch = () => setSaved(false);
  const updateAt = (i: number, block: BlockContent) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, block } : r)));
    touch();
  };
  const removeAt = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    touch();
  };
  const moveAt = (i: number, dir: -1 | 1) => {
    setRows((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
    touch();
  };
  const addBlock = () => {
    setRows((prev) => [...prev, { key: crypto.randomUUID(), block: defaultBlockContent(insertType) }]);
    touch();
  };

  async function save() {
    setPending(true);
    setError(null);
    const res = await onSave(
      id,
      rows.map((r) => r.block),
    );
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not save the library item.');
      return;
    }
    setSaved(true);
  }

  function editor(block: BlockContent, i: number) {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
      case 'callout':
        return (
          <RichTextEditor
            value={block.content}
            onSave={(content) => updateAt(i, { ...block, content })}
          />
        );
      case 'section_header':
        return (
          <input
            className="ui-field__input"
            aria-label="Section title"
            placeholder="Section title"
            value={block.title}
            onChange={(e) => updateAt(i, { ...block, title: e.target.value })}
          />
        );
      case 'divider':
        return <hr />;
      default:
        return <BlockRenderer blocks={[block]} resolved={{}} />;
    }
  }

  return (
    <div className="specs-content">
      <p className="specs-grid__meta">
        <Link href={backHref}>← {backLabel}</Link>
      </p>
      <h1 className="specs-title">{heading}</h1>
      <p className="specs-grid__meta">{intro}</p>

      <div className="specs-form--row" style={{ gap: 6, margin: '12px 0' }}>
        <select
          aria-label="Block type to add"
          className="ui-field__input"
          value={insertType}
          onChange={(e) => setInsertType(e.target.value as InsertableBlockType)}
        >
          {INSERTABLE_BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {insertableBlockLabel(t)}
            </option>
          ))}
        </select>
        <Button size="sm" variant="secondary" onClick={addBlock}>
          + Add block
        </Button>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="primary" onClick={save} disabled={pending || rows.length === 0}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {saved ? <span className="specs-grid__meta">Saved.</span> : null}
      </div>
      {error ? <p className="ui-field__error">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="specs-grid__meta">No blocks. Add one above.</p>
      ) : (
        <ol className="specs-form" aria-label="Library item content">
          {rows.map((r, i) => (
            <li key={r.key} className="specs-release" style={{ display: 'block' }}>
              <div className="specs-form--row" style={{ gap: 4, marginBottom: 4 }}>
                <span className="specs-release__tag">{r.block.type}</span>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="specs-value-button"
                  aria-label="Move up"
                  onClick={() => moveAt(i, -1)}
                  disabled={i === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="specs-value-button"
                  aria-label="Move down"
                  onClick={() => moveAt(i, 1)}
                  disabled={i === rows.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="specs-value-button"
                  aria-label="Delete block"
                  onClick={() => removeAt(i)}
                >
                  Delete
                </button>
              </div>
              {editor(r.block, i)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
