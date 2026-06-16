import { describe, expect, it } from 'vitest';
import { searchSnippet } from './search';

describe('searchSnippet', () => {
  it('returns short text unchanged (whitespace collapsed)', () => {
    expect(searchSnippet('The  rated\nvoltage', 'voltage')).toBe('The rated voltage');
  });

  it('centres the window on the matched term with ellipses', () => {
    const text = 'a'.repeat(100) + ' voltage ' + 'b'.repeat(100);
    const out = searchSnippet(text, 'voltage', 40);
    expect(out).toContain('voltage');
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(42); // window + the two ellipses
  });

  it('truncates the head with a trailing ellipsis when there is no match', () => {
    const text = 'x'.repeat(200);
    const out = searchSnippet(text, 'nope', 40);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(41);
  });

  it('is case-insensitive on the lead term', () => {
    const text = 'intro '.repeat(40) + 'Voltage rating follows here';
    expect(searchSnippet(text, 'voltage', 40)).toContain('Voltage');
  });

  it('handles an empty query by truncating the head', () => {
    expect(searchSnippet('y'.repeat(50), '', 20)).toBe(`${'y'.repeat(20)}…`);
  });
});
