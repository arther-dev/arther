import { describe, expect, it } from 'vitest';
import {
  brandProfileFormSchema,
  formatPreferredTerms,
  parsePreferredTerms,
  parseStringList,
} from './brand-profile';

describe('parseStringList', () => {
  it('splits on commas and newlines, trims, and de-dupes case-insensitively', () => {
    expect(parseStringList('precise, confident\ndirect, Precise')).toEqual([
      'precise',
      'confident',
      'direct',
    ]);
  });

  it('drops empties and whitespace-only entries', () => {
    expect(parseStringList(' , \n , bold ,, ')).toEqual(['bold']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseStringList('')).toEqual([]);
  });
});

describe('parsePreferredTerms / formatPreferredTerms', () => {
  it('parses each supported separator', () => {
    const raw = ['motor controller => servo drive', 'widget -> gadget', 'a: b', 'c = d'].join('\n');
    expect(parsePreferredTerms(raw)).toEqual({
      'motor controller': 'servo drive',
      widget: 'gadget',
      a: 'b',
      c: 'd',
    });
  });

  it('skips blank and malformed lines; last write wins', () => {
    const raw = ['', 'no separator here', 'x => 1', 'x => 2'].join('\n');
    expect(parsePreferredTerms(raw)).toEqual({ x: '2' });
  });

  it('round-trips through formatPreferredTerms', () => {
    const map = { 'motor controller': 'servo drive', widget: 'gadget' };
    expect(parsePreferredTerms(formatPreferredTerms(map))).toEqual(map);
  });
});

describe('brandProfileFormSchema', () => {
  const base = { name: 'House Style', unitPreference: 'metric' as const };

  it('accepts a minimal valid profile', () => {
    expect(brandProfileFormSchema.safeParse(base).success).toBe(true);
  });

  it('requires a name', () => {
    expect(brandProfileFormSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
  });

  it('rejects a bad hex colour but allows empty', () => {
    expect(brandProfileFormSchema.safeParse({ ...base, primaryColour: 'red' }).success).toBe(false);
    expect(brandProfileFormSchema.safeParse({ ...base, primaryColour: '#1a2b3c' }).success).toBe(
      true,
    );
    expect(brandProfileFormSchema.safeParse({ ...base, primaryColour: '' }).success).toBe(true);
  });

  it('rejects an unknown unit preference', () => {
    expect(brandProfileFormSchema.safeParse({ ...base, unitPreference: 'furlongs' }).success).toBe(
      false,
    );
  });

  it('rejects a non-URL logo but allows empty', () => {
    expect(brandProfileFormSchema.safeParse({ ...base, logoUrl: 'not a url' }).success).toBe(false);
    expect(
      brandProfileFormSchema.safeParse({ ...base, logoUrl: 'https://x.test/logo.svg' }).success,
    ).toBe(true);
    expect(brandProfileFormSchema.safeParse({ ...base, logoUrl: '' }).success).toBe(true);
  });
});
