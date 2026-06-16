import { describe, expect, it } from 'vitest';
import { countMatchesInBlock, replaceInBlock } from './text-search';
import type { BlockContent } from './block-content';

const para = (...nodes: { type: string; [k: string]: unknown }[]): BlockContent =>
  ({ type: 'paragraph', content: { alignment: 'left', nodes } }) as BlockContent;
const text = (t: string) => ({ type: 'text', text: t, marks: [] as never[] });
const token = () => ({
  type: 'spec_token',
  field_id: 'f1',
  field_version_id: 'v1',
  display_value: '36 V',
  unit_id: 'u1',
  product_id: 'p1',
  component_id: 'c1',
});

describe('countMatchesInBlock (G4.7)', () => {
  it('counts literal occurrences across text nodes', () => {
    const block = para(text('the cat sat on the mat'), text(' — the end'));
    expect(countMatchesInBlock(block, 'the')).toBe(3);
  });

  it('returns 0 for an empty query', () => {
    expect(countMatchesInBlock(para(text('anything')), '')).toBe(0);
  });

  it('counts inside a callout title and a section header', () => {
    const callout: BlockContent = {
      type: 'callout',
      variant: 'info',
      title: 'Voltage note',
      content: { alignment: 'left', nodes: [text('the voltage is set')] },
    } as BlockContent;
    expect(countMatchesInBlock(callout, 'voltage')).toBe(1); // case-sensitive: title 'Voltage' excluded
    const header: BlockContent = { type: 'section_header', title: 'Voltage limits' } as BlockContent;
    expect(countMatchesInBlock(header, 'Voltage')).toBe(1);
  });

  it('never matches a resolved spec token value', () => {
    expect(countMatchesInBlock(para(text('rated at '), token()), '36')).toBe(0);
  });
});

describe('replaceInBlock (G4.7)', () => {
  it('replaces literal occurrences and reports the count, preserving marks', () => {
    const block: BlockContent = {
      type: 'paragraph',
      content: {
        alignment: 'left',
        nodes: [{ type: 'text', text: 'fast and fast', marks: [{ type: 'bold' }] }],
      },
    } as BlockContent;
    const { content, replaced } = replaceInBlock(block, 'fast', 'quick');
    expect(replaced).toBe(2);
    const node = (content as { content: { nodes: { text: string; marks: unknown[] }[] } }).content.nodes[0]!;
    expect(node.text).toBe('quick and quick');
    expect(node.marks).toEqual([{ type: 'bold' }]); // marks preserved
  });

  it('replaces inside link text but leaves spec tokens untouched', () => {
    const block: BlockContent = {
      type: 'paragraph',
      content: {
        alignment: 'left',
        nodes: [
          { type: 'link', href: 'https://x', nodes: [{ type: 'text', text: 'the docs', marks: [] }] },
          token(),
        ],
      },
    } as BlockContent;
    const { content, replaced } = replaceInBlock(block, 'docs', 'guide');
    expect(replaced).toBe(1);
    const nodes = (content as { content: { nodes: { type: string; nodes?: { text: string }[] }[] } }).content.nodes;
    expect(nodes[0]!.nodes![0]!.text).toBe('the guide');
    expect(nodes[1]!.type).toBe('spec_token'); // token preserved as-is
  });

  it('returns the original content (unchanged) when nothing matches', () => {
    const block = para(text('no hits here'));
    const result = replaceInBlock(block, 'zzz', 'q');
    expect(result.replaced).toBe(0);
    expect(result.content).toBe(block);
  });
});
