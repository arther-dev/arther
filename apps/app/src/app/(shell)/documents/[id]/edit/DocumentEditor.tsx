'use client';

import { useEffect, useState, type CSSProperties, type DragEvent } from 'react';
import Link from 'next/link';
import { BlockRenderer, buildOutline } from '@arther/block-renderer';
import {
  countMatchesInBlock,
  INSERTABLE_BLOCK_TYPES,
  insertableBlockLabel,
  rangeSelection,
  replaceInBlock,
  toggleSelection,
  type BlockContent,
  type InsertableBlockType,
  type SpecFieldResolution,
} from '@arther/types';
import { AppShell, Button } from '@arther/ui';
import {
  addBlockAfterAction,
  deleteBlockAction,
  pasteBlocksAction,
  regenerateBlockAction,
  reorderBlocksAction,
  updateBlockContentAction,
} from './actions';
import { readBlockClipboard, writeBlockClipboard } from './clipboard';
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
  staleBriefKeys = [],
  staleBriefBlockIds = [],
  resolved,
  blocks: initialBlocks,
}: {
  documentId: string;
  revisionId: string;
  title: string;
  state: string;
  staleFields: string[];
  staleBlockIds: string[];
  staleBriefKeys?: string[];
  staleBriefBlockIds?: string[];
  resolved?: SpecFieldResolution;
  blocks: EditorBlock[];
}) {
  const staleSet = new Set(staleBlockIds);
  const briefStaleSet = new Set(staleBriefBlockIds);
  const [blocks, setBlocks] = useState(initialBlocks);
  // G4.6 — multi-select: a set of block ids plus the range anchor. Most editor
  // paths act on one block, so `selected` derives the lone id (else null) and
  // `selectOnly` is the single-block setter those flows keep using unchanged.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(true);
  const [showProps, setShowProps] = useState(true);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [insertType, setInsertType] = useState<InsertableBlockType>('paragraph');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  // G4.6 — block clipboard (localStorage, so copy/paste spans documents). The
  // count drives the Paste button's enabled/label state; read once on mount.
  const [clipboardCount, setClipboardCount] = useState(0);
  // G4.7 find & replace
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [replaceVersion, setReplaceVersion] = useState(0);
  const [replaceStatus, setReplaceStatus] = useState<string | null>(null);
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
  const selected = selectedIds.size === 1 ? [...selectedIds][0]! : null;
  const selectedBlock = blocks.find((b) => b.id === selected) ?? null;

  const selectOnly = (id: string) => {
    setSelectedIds(new Set([id]));
    setAnchor(id);
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
    setAnchor(null);
  };

  // G4.6 — click selection with modifiers: ⌘/Ctrl toggles a block in/out of the
  // set, Shift extends a contiguous range from the anchor, a plain click selects
  // just that block.
  function clickSelect(id: string, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) {
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => toggleSelection(prev, id));
      setAnchor(id);
      return;
    }
    if (e.shiftKey && anchor) {
      const range = rangeSelection(blocks.map((b) => b.id), anchor, id);
      if (range.size > 0) {
        setSelectedIds(range);
        return;
      }
    }
    selectOnly(id);
  }

  // G4.7 — blocks whose editable text contains the query, in document order.
  const matches = query
    ? blocks
        .map((b) => ({ id: b.id, n: countMatchesInBlock(b.content, query) }))
        .filter((m) => m.n > 0)
    : [];
  const matchingIds = matches.map((m) => m.id);
  const matchingIdSet = new Set(matchingIds);
  const totalMatches = matches.reduce((sum, m) => sum + m.n, 0);

  function gotoMatch(dir: 1 | -1) {
    if (matchingIds.length === 0) return;
    const next = (matchIndex + dir + matchingIds.length) % matchingIds.length;
    setMatchIndex(next);
    const id = matchingIds[next]!;
    selectOnly(id);
    document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function replaceAll() {
    if (!query) return;
    let total = 0;
    const changed: { id: string; content: BlockContent }[] = [];
    const next = blocks.map((b) => {
      const { content, replaced } = replaceInBlock(b.content, query, replacement);
      if (replaced > 0) {
        total += replaced;
        changed.push({ id: b.id, content });
        return { ...b, content };
      }
      return b;
    });
    if (total === 0) {
      setReplaceStatus('No matches to replace.');
      return;
    }
    setBlocks(next);
    changed.forEach((c) => enqueue(c.id, c.content));
    setReplaceVersion((v) => v + 1); // remount the inline editors so they show the new text
    setReplaceStatus(`Replaced ${total} occurrence${total === 1 ? '' : 's'} in ${changed.length} block${changed.length === 1 ? '' : 's'}.`);
  }

  // Seed the clipboard count from localStorage (a copy may predate this mount,
  // e.g. copied in another document before navigating here).
  useEffect(() => {
    setClipboardCount(readBlockClipboard().length);
  }, []);

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
  async function insertBlock(type: InsertableBlockType) {
    if (offline) return;
    const res = await addBlockAfterAction({ revisionId, documentId, afterBlockId: selected, type });
    if (!res.ok || !res.block || !res.orderedIds) return;
    const block = res.block;
    const order = res.orderedIds;
    setBlocks((prev) => {
      const byId = new Map<string, EditorBlock>([...prev, block].map((b) => [b.id, b]));
      return order.map((id) => byId.get(id)).filter((b): b is EditorBlock => Boolean(b));
    });
    selectOnly(block.id);
  }

  async function removeSelected() {
    if (!selected || offline) return;
    const id = selected;
    const res = await deleteBlockAction(id);
    if (!res.ok) return;
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    clearSelection();
  }

  // G4.6 — bulk delete every block in the selection (structural, blocked offline).
  async function deleteSelectedBlocks() {
    if (selectedIds.size === 0 || offline) return;
    const ids = [...selectedIds];
    const results = await Promise.all(ids.map((id) => deleteBlockAction(id)));
    const removed = new Set(ids.filter((_, i) => results[i]?.ok));
    if (removed.size === 0) return;
    setBlocks((prev) => prev.filter((b) => !removed.has(b.id)));
    clearSelection();
  }

  // G4.6 — copy the selected blocks' content to the cross-document clipboard, in
  // document order. Available offline (it never touches the server).
  function copySelected() {
    const ordered = blocks.filter((b) => selectedIds.has(b.id)).map((b) => b.content);
    if (ordered.length > 0 && writeBlockClipboard(ordered)) setClipboardCount(ordered.length);
  }

  // G4.6 — paste the clipboard blocks after the selection (or at the end), as new
  // manual blocks. Structural, so blocked offline; selects what landed.
  async function pasteBlocks() {
    if (offline) return;
    const payload = readBlockClipboard();
    if (payload.length === 0) return;
    const res = await pasteBlocksAction({ revisionId, documentId, afterBlockId: selected, blocks: payload });
    if (!res.ok || !res.blocks || !res.orderedIds) return;
    const added: EditorBlock[] = res.blocks.map((b) => ({
      id: b.id,
      content: b.content,
      type: b.type,
      source: b.source,
    }));
    const order = res.orderedIds;
    setBlocks((prev) => {
      const byId = new Map<string, EditorBlock>([...prev, ...added].map((b) => [b.id, b]));
      return order.map((id) => byId.get(id)).filter((b): b is EditorBlock => Boolean(b));
    });
    setSelectedIds(new Set(added.map((b) => b.id)));
    setAnchor(added[added.length - 1]?.id ?? null);
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

  // G4.6 — drag a block (by its handle) and drop it before another to reorder.
  async function moveBlock(toId: string) {
    const fromId = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!fromId || fromId === toId || offline) return;
    const moved = blocks.find((b) => b.id === fromId);
    const rest = blocks.filter((b) => b.id !== fromId);
    const at = rest.findIndex((b) => b.id === toId);
    if (!moved || at < 0) return;
    const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
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
    outline: selectedIds.has(id) ? '2px solid var(--accent, #7aa2f7)' : '2px solid transparent',
    // Spec value change = urgent (warn bar); brief edit = light (info bar, G7.3).
    boxShadow: staleSet.has(id)
      ? 'inset 3px 0 0 0 var(--warn, #e0af68)'
      : briefStaleSet.has(id)
        ? 'inset 2px 0 0 0 var(--info, #7dcfff)'
        : undefined,
    background: matchingIdSet.has(id) ? 'var(--accent-subtle, rgba(122, 162, 247, 0.12))' : undefined,
  });

  // G4.6 — drag-to-reorder: a flex wrapper with a grip handle, the block body as
  // the drop target (a dragged block lands before the one it's dropped on).
  const wrapperStyle = (id: string): CSSProperties => ({
    ...blockStyle(id),
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    borderTop:
      dragOverId === id && dragId && dragId !== id
        ? '2px solid var(--accent, #7aa2f7)'
        : '2px solid transparent',
  });
  const dropProps = (id: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (dragId && dragOverId !== id) setDragOverId(id);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      void moveBlock(id);
    },
  });
  const handle = (id: string) => (
    <span
      role="button"
      aria-label="Drag to reorder"
      className="editor-drag-handle"
      draggable={!offline}
      onDragStart={() => setDragId(id)}
      onDragEnd={() => {
        setDragId(null);
        setDragOverId(null);
      }}
      style={{ cursor: offline ? 'default' : 'grab', userSelect: 'none', color: 'var(--text-tertiary, #888)', lineHeight: 1.4 }}
    >
      ⠿
    </span>
  );

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
                      aria-current={selectedIds.has(item.id) ? 'true' : undefined}
                      onClick={() => {
                        selectOnly(item.id);
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
            {selectedIds.size > 1 ? (
              <div className="specs-form">
                <p className="specs-grid__meta">{selectedIds.size} blocks selected.</p>
                <div className="specs-form--row" style={{ marginTop: 8, gap: 4 }}>
                  <Button size="sm" variant="secondary" onClick={copySelected}>
                    Copy
                  </Button>
                  <Button size="sm" variant="danger" disabled={offline} onClick={deleteSelectedBlocks}>
                    Delete selected
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
                <p className="specs-grid__meta">⌘/Ctrl-click to toggle · Shift-click to range-select.</p>
              </div>
            ) : selectedBlock ? (
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
                  <Button size="sm" variant="ghost" onClick={copySelected}>
                    Copy
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
              <select
                aria-label="Block type to insert"
                className="ui-field__input"
                value={insertType}
                disabled={offline}
                onChange={(e) => setInsertType(e.target.value as InsertableBlockType)}
              >
                {INSERTABLE_BLOCK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {insertableBlockLabel(t)}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="primary" disabled={offline} onClick={() => insertBlock(insertType)}>
                + Insert
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={offline || clipboardCount === 0}
                onClick={pasteBlocks}
                title={clipboardCount === 0 ? 'Copy blocks first' : `Paste ${clipboardCount} copied block${clipboardCount === 1 ? '' : 's'}`}
              >
                Paste{clipboardCount > 0 ? ` (${clipboardCount})` : ''}
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
              <Button
                size="sm"
                variant={findOpen ? 'secondary' : 'ghost'}
                aria-pressed={findOpen}
                onClick={() => setFindOpen((v) => !v)}
              >
                Find
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

        {staleBriefKeys.length > 0 ? (
          <p className="specs-grid__meta" role="status" style={{ marginBottom: 8 }}>
            {staleBriefKeys.length} brief fragment{staleBriefKeys.length === 1 ? '' : 's'} updated
            since generation ({staleBriefKeys.join(', ')}) — the prose may want a refresh.
          </p>
        ) : null}

        {mode === 'edit' && findOpen ? (
          <div className="editor-find specs-form--row" role="search" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <input
              className="ui-field__input"
              aria-label="Find"
              placeholder="Find"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMatchIndex(0);
                setReplaceStatus(null);
              }}
            />
            <span className="specs-grid__meta" aria-live="polite">
              {query ? `${totalMatches} match${totalMatches === 1 ? '' : 'es'}` : ''}
            </span>
            <Button size="sm" variant="ghost" disabled={matchingIds.length === 0} onClick={() => gotoMatch(-1)}>
              Prev
            </Button>
            <Button size="sm" variant="ghost" disabled={matchingIds.length === 0} onClick={() => gotoMatch(1)}>
              Next
            </Button>
            <input
              className="ui-field__input"
              aria-label="Replace with"
              placeholder="Replace with"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            />
            <Button size="sm" variant="secondary" disabled={!query || totalMatches === 0} onClick={replaceAll}>
              Replace all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFindOpen(false)}>
              Close
            </Button>
            {replaceStatus ? (
              <span className="specs-grid__meta" role="status">
                {replaceStatus}
              </span>
            ) : null}
          </div>
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
                    onClick={(e) => clickSelect(b.id, e)}
                    style={wrapperStyle(b.id)}
                    {...dropProps(b.id)}
                  >
                    {handle(b.id)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <RichTextEditor
                        key={`${b.id}:${replaceVersion}`}
                        value={c.content}
                        onSave={(rt) => persist(b.id, { ...c, content: rt })}
                      />
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={b.id}
                  id={`block-${b.id}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedIds.has(b.id)}
                  onClick={(e) => clickSelect(b.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectOnly(b.id);
                    }
                  }}
                  style={wrapperStyle(b.id)}
                  {...dropProps(b.id)}
                >
                  {handle(b.id)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <BlockRenderer blocks={[c]} resolved={resolved} />
                  </div>
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
