import { describe, expect, it } from 'vitest';
import { computePublishPreflight } from './publish-preflight';
import type { BlockContent } from './block-content';

const para = (): BlockContent => ({
  type: 'paragraph',
  content: { alignment: 'left', nodes: [] },
});
const image = (alt: string): BlockContent => ({
  type: 'image',
  url: 'https://x/y.png',
  storage_key: 'k',
  alt_text: alt,
  width: 'full',
});

describe('computePublishPreflight (C4.1)', () => {
  it('passes a clean document', () => {
    const r = computePublishPreflight({ blocks: [{ source: 'manual', content: para() }] });
    expect(r.canPublish).toBe(true);
    expect(r.blocking).toHaveLength(0);
    expect(r.advisory).toHaveLength(0);
  });

  it('blocks publishing while a placeholder block remains', () => {
    const r = computePublishPreflight({
      blocks: [
        { source: 'brief', content: para() },
        { source: 'placeholder', content: para() },
      ],
    });
    expect(r.canPublish).toBe(false);
    expect(r.blocking[0]).toMatch(/placeholder/i);
  });

  it('flags missing alt text and staleness as advisory (non-blocking)', () => {
    const r = computePublishPreflight({
      blocks: [
        { source: 'manual', content: image('') },
        { source: 'manual', content: image('a logo') },
      ],
      staleBlockCount: 2,
    });
    expect(r.canPublish).toBe(true);
    expect(r.advisory.some((m) => /alt text/i.test(m))).toBe(true);
    expect(r.advisory.some((m) => /changed since generation/i.test(m))).toBe(true);
  });
});
