import { describe, expect, it } from 'vitest';
import { matchOptionValue } from './combobox';

const OPTS = [
  { value: 'c1', label: 'NEMA 23 Stator' },
  { value: 'c2', label: 'Driver Board' },
];

describe('matchOptionValue', () => {
  it('resolves an exact label to its value', () => {
    expect(matchOptionValue(OPTS, 'Driver Board')).toBe('c2');
  });

  it('is case-insensitive and trims', () => {
    expect(matchOptionValue(OPTS, '  driver board ')).toBe('c2');
  });

  it('returns empty for a partial or unknown label', () => {
    expect(matchOptionValue(OPTS, 'Driver')).toBe('');
    expect(matchOptionValue(OPTS, 'nope')).toBe('');
  });

  it('returns empty for blank input', () => {
    expect(matchOptionValue(OPTS, '   ')).toBe('');
    expect(matchOptionValue(OPTS, '')).toBe('');
  });
});
