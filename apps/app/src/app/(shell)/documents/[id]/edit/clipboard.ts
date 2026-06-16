'use client';

import { blockContentSchema, type BlockContent } from '@arther/types';

/**
 * G4.6 — the editor's block clipboard. Copy/paste has to survive navigation
 * between documents, so the payload lives in localStorage (same-origin, app-wide)
 * rather than React state. It is stored as validated `BlockContent[]`; paste
 * re-checks the shape on read, so a stale or hand-edited entry can never reach a
 * server action. Pasted blocks are inserted as fresh `manual` blocks — copying
 * carries the content, not the source document's spec/brief references.
 */
const CLIPBOARD_KEY = 'arther:block-clipboard';
const MAX_BLOCKS = 100;
const clipboardSchema = blockContentSchema.array().min(1).max(MAX_BLOCKS);

export function writeBlockClipboard(blocks: BlockContent[]): boolean {
  if (blocks.length === 0) return false;
  try {
    window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(blocks.slice(0, MAX_BLOCKS)));
    return true;
  } catch {
    return false;
  }
}

export function readBlockClipboard(): BlockContent[] {
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return [];
    const parsed = clipboardSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
