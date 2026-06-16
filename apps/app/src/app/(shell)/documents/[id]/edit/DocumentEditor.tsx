'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { BlockRenderer, buildOutline } from '@arther/block-renderer';
import { type BlockContent, type SpecFieldResolution } from '@arther/types';
import { AppShell, Button } from '@arther/ui';
import {
  addBlockAfterAction,
  deleteBlockAction,
  regenerateBlockAction,
  reorderBlocksAction,
  updateBlockContentAction,
} from './actions';
import { BlockProperties } from './BlockProperties';
import { RichTextEditor } from './RichTextEditor';
import { useSaveQueue } from './useSaveQueue';

/**
 * G4.1/G4.3 — the three-panel block editor: Outline (navigator) · canvas
 * (content) · Properties (inspector), on the app shell's regions. Prose blocks
 * (paragraph/heading/callout) are edited in place via TipTap (G4.3, spec tokens
 * as atoms); other block types render read-only through the shared renderer
 * until their property editors land (G4.2). Edits persist on blur (G5 layers
 * debounced auto-save + offline queue on top).
 */
export interface EditorBlock {
  id: string;
  content: BlockContent;
  type: string;
  source: string;
}

export function DocumentEditor({
  documentId,
  revisionId,
  title,
  state,
  staleFields,
  staleBlockIds,
  resolved,
  blocks: initialBlocks,
}: {
  documentId: string;
  revisionId: string;
  title: string;
  state: string;
  staleFields: string[];
  staleBlockIds: string[];
  resolved?: SpecFieldResolution;
  blocks: EditorBlock[];
}) {
  const staleSet = new Set(staleBlockIds);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [selected, setSelected] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(true);
  const [showProps, setShowProps] = useState(true);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const { enqueue, status: saveStatus, offline } = useSaveQueue<BlockContent>((id, content) =>
    updateBlockContentAction(id, content).then((r) => r.ok),
  );

  const saveLabel =
    saveStatus === 'offline'
      ? 'Offline — edits queued'
      : saveStatus === 'saving' || saveStatus === 'pending'
        ? 'Saving…'
        : saveStatus === 'error'
          ? 'Save failed — will retry'
          : 'All changes saved';

  const outline = buildOutline(blocks);
  const selectedBlock = blocks.find((b) => b.id === selected) ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '\\') return;
      if (e.altKey && e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) setShowProps((v) => !v);
        else setShowOutline((v) => !v);
      } else if (e.metaKey) {
        e.preventDefault();
        const focus = showOutline || showProps;
        setShowOutline(!focus);
        setShowProps(!focus);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showOutline, showProps]);

  // Content edits debounce through the offline-safe queue (G5.1/G5.2).
  function persist(blockId: string, content: BlockContent) {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, content } : b)));
    enqueue(blockId, content);
  }

  // Structural ops are immediate, not queued — blocked offline (G5.5).
  async function addParagraph() {
    if (offline) return;
    const res = await addBlockAfterAction({ revisionId, documentId, afterBlockId: selected });
    if (!res.ok || !res.block || !res.orderedIds) return;
    const block = res.block;
    const order = res.orderedIds;
    setBlocks((prev) => {
      const byId = new Map<string, EditorBlock>([...prev, block].map((b) => [b.id, b]));
      return order.map((id) => byId.get(id)).filter((b): b is EditorBlock => Boolean(b));
    });
    setSelected(block.id);
  }

  async function removeSelected() {
    if (!selected || offline) return;
    const id = selected;
    const res = await deleteBlockAction(id);
    if (!res.ok) return;
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelected(null);
  }

  async function moveSelected(direction: -1 | 1) {
    if (!selected || offline) return;
    const idx = blocks.findIndex((b) => b.id === selected);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setBlocks(next);
    await reorderBlocksAction(next.map((b) => b.id));
  }

  // G7.1 — regenerate the selected prose block against the current spec graph.
  // The action writes through the DB, so on success we replace the local content
  // to match (no save enqueue). The resolution for a staleness-flagged block.
  async function regenerateSelected() {
    if (!selectedBlock || offline || regeneratingId) return;
    const id = selectedBlock.id;
    setRegenError(null);
    setRegeneratingId(id);
    const res = await regenerateBlockAction(id);
    setRegeneratingId(null);
    if (!res.ok || !res.content) {
      setRegenError(res.error ?? 'Could not regenerate this block.');
      return;
    }
    const content = res.content;
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, content } : b)));
  }

  const blockStyle = (id: string): CSSProperties => ({
    cursor: 'pointer',
    borderRadius: 6,
    padding: '2px 8px',
    outline: selected === id ? '2px solid var(--accent, #7aa2f7)' : '2px solid transparent',
    boxShadow: staleSet.has(id) ? 'inset 3px 0 0 0 var(--warn, #e0af68)' : undefined,
  });

  return (
    <AppShell
      navigator={
        mode === 'edit' && showOutline ? (
          <nav className="editor-outline" aria-label="Outline">
            {outline.length === 0 ? (
              <p className="specs-grid__meta">No sections yet.</p>
            ) : (
              <ul className="specs-form">
                {outline.map((item) => (
                  <li key={item.id} style={{ paddingLeft: item.level * 12 }}>
                    <button
                      type="button"
                      className="specs-value-button"
                      aria-current={selected === item.id ? 'true' : undefined}
                      onClick={() => {
                        setSelected(item.id);
                        document.getElementById(`block-${item.id}`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        ) : undefined
      }
      inspector={
        mode === 'edit' && showProps ? (
          <div className="editor-props">
            <h2 className="specs-section__title">Properties</h2>
            {selectedBlock ? (
              <>
                <dl className="specs-form">
                  <div className="specs-form--row">
                    <dt>Type</dt>
                    <dd>{selectedBlock.type}</dd>
                  </div>
                  <div className="specs-form--row">
                    <dt>Source</dt>
                    <dd>{selectedBlock.source}</dd>
                  </div>
                </dl>
                <BlockProperties
                  key={selectedBlock.id}
                  content={selectedBlock.content}
                  onCommit={(c) => persist(selectedBlock.id, c)}
                />
                <div className="specs-form--row" style={{ marginTop: 12, gap: 4 }}>
                  <Button size="sm" variant="ghost" disabled={offline} onClick={() => moveSelected(-1)}>
                    Move up
                  </Button>
                  <Button size="sm" variant="ghost" disabled={offline} onClick={() => moveSelected(1)}>
                    Move down
                  </Button>
                  <Button size="sm" variant="danger" disabled={offline} onClick={removeSelected}>
                    Delete
                  </Button>
                </div>
                {selectedBlock.type === 'paragraph' || selectedBlock.type === 'callout' ? (
                  <div style={{ marginTop: 8 }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={offline || regeneratingId === selectedBlock.id}
                      onClick={regenerateSelected}
                    >
                      {regeneratingId === selectedBlock.id
                        ? 'Regenerating…'
                        : staleSet.has(selectedBlock.id)
                          ? 'Regenerate (spec changed)'
                          : 'Regenerate'}
                    </Button>
                    {regenError ? <p className="ui-field__error">{regenError}</p> : null}
                    <p className="specs-grid__meta">Rewrites this block from the current spec values.</p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="specs-grid__meta">Select a block to see its properties.</p>
            )}
            <p className="specs-grid__meta">Prose text edits in the canvas; structure here.</p>
          </div>
        ) : undefined
      }
    >
      <div className="specs-content">
        <header className="specs-form--row">
          <h1 className="specs-title">{title}</h1>
          <span className={`import-status import-status--${state}`}>{state}</span>
          <span
            className="specs-grid__meta"
            aria-live="polite"
            data-save-status={saveStatus}
          >
            {offline ? '● ' : ''}
            {saveLabel}
          </span>
          <span style={{ flex: 1 }} />
          <Button
            size="sm"
            variant={mode === 'edit' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'edit'}
            onClick={() => setMode('edit')}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant={mode === 'preview' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'preview'}
            onClick={() => setMode('preview')}
          >
            Preview
          </Button>
          {mode === 'edit' ? (
            <>
              <Button size="sm" variant="primary" disabled={offline} onClick={addParagraph}>
                + Paragraph
              </Button>
              <Button
                size="sm"
                variant={showOutline ? 'secondary' : 'ghost'}
                aria-pressed={showOutline}
                onClick={() => setShowOutline((v) => !v)}
              >
                Outline
              </Button>
              <Button
                size="sm"
                variant={showProps ? 'secondary' : 'ghost'}
                aria-pressed={showProps}
                onClick={() => setShowProps((v) => !v)}
              >
                Properties
              </Button>
            </>
          ) : null}
          <Link className="ui-btn ui-btn--ghost" href={`/documents/${documentId}`}>
            Done
          </Link>
        </header>

        {staleFields.length > 0 ? (
          <p className="ui-field__error" role="status" style={{ marginBottom: 8 }}>
            {staleFields.length} spec value{staleFields.length === 1 ? '' : 's'} changed since
            generation ({staleFields.join(', ')}). Affected blocks are marked.
          </p>
        ) : null}

        {mode === 'preview' ? (
          <article className="br-document" aria-label="Document preview" style={{ maxWidth: 760 }}>
            {blocks.length === 0 ? (
              <p className="specs-grid__meta">This draft has no blocks yet.</p>
            ) : (
              <BlockRenderer blocks={blocks.map((b) => b.content)} resolved={resolved} />
            )}
          </article>
        ) : (
          <div className="editor-canvas" aria-label="Document canvas" style={{ maxWidth: 760 }}>
            {blocks.length === 0 ? (
              <p className="specs-grid__meta">This draft has no blocks yet.</p>
            ) : (
              blocks.map((b) => {
              const c = b.content;
              if (c.type === 'paragraph' || c.type === 'heading' || c.type === 'callout') {
                return (
                  <div
                    key={b.id}
                    id={`block-${b.id}`}
                    className={`editor-block editor-block--${c.type}`}
                    onClick={() => setSelected(b.id)}
                    style={blockStyle(b.id)}
                  >
                    <RichTextEditor
                      value={c.content}
                      onSave={(rt) => persist(b.id, { ...c, content: rt })}
                    />
                  </div>
                );
              }
              return (
                <div
                  key={b.id}
                  id={`block-${b.id}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === b.id}
                  onClick={() => setSelected(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(b.id);
                    }
                  }}
                  style={blockStyle(b.id)}
                >
                  <BlockRenderer blocks={[c]} resolved={resolved} />
                </div>
              );
            })
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
