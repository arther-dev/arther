'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { BlockRenderer, buildOutline } from '@arther/block-renderer';
import { type BlockContent } from '@arther/types';
import { AppShell, Button } from '@arther/ui';
import { updateBlockContentAction } from './actions';
import { RichTextEditor } from './RichTextEditor';

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
  title,
  state,
  blocks: initialBlocks,
}: {
  documentId: string;
  title: string;
  state: string;
  blocks: EditorBlock[];
}) {
  const [blocks, setBlocks] = useState(initialBlocks);
  const [selected, setSelected] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(true);
  const [showProps, setShowProps] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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

  async function persist(blockId: string, content: BlockContent) {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, content } : b)));
    setSaveState('saving');
    const res = await updateBlockContentAction(blockId, content);
    setSaveState(res.ok ? 'saved' : 'error');
  }

  const blockStyle = (id: string): CSSProperties => ({
    cursor: 'pointer',
    borderRadius: 6,
    padding: '2px 8px',
    outline: selected === id ? '2px solid var(--accent, #7aa2f7)' : '2px solid transparent',
  });

  return (
    <AppShell
      navigator={
        showOutline ? (
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
        showProps ? (
          <div className="editor-props">
            <h2 className="specs-section__title">Properties</h2>
            {selectedBlock ? (
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
            ) : (
              <p className="specs-grid__meta">Select a block to see its properties.</p>
            )}
            <p className="specs-grid__meta">
              Prose edits save on blur. Per-type property editors land in G4.2.
            </p>
          </div>
        ) : undefined
      }
    >
      <div className="specs-content">
        <header className="specs-form--row">
          <h1 className="specs-title">{title}</h1>
          <span className={`import-status import-status--${state}`}>{state}</span>
          {saveState !== 'idle' ? (
            <span className="specs-grid__meta" aria-live="polite">
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save failed'}
            </span>
          ) : null}
          <span style={{ flex: 1 }} />
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
          <Link className="ui-btn ui-btn--ghost" href={`/documents/${documentId}`}>
            Done
          </Link>
        </header>

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
                  <BlockRenderer blocks={[c]} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
