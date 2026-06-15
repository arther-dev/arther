import { describe, expect, it } from 'vitest';
import {
  BRIEF_FRAGMENTS,
  briefFragmentFormSchema,
  briefFragmentKeySchema,
  briefGuidance,
  briefKeyLabel,
  humanizeBriefKey,
  isKnownBriefKey,
  orderBriefKeys,
} from './brief';
import { TEXT_LIMITS } from './text';

describe('brief fragment catalogue', () => {
  it('every canonical fragment carries a label and non-empty guidance', () => {
    for (const f of BRIEF_FRAGMENTS) {
      expect(f.key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.guidance.length).toBeGreaterThan(0);
    }
  });

  it('includes the five standard keys (spec §3.2) and the built-in section keys', () => {
    const keys = BRIEF_FRAGMENTS.map((f) => f.key);
    for (const standard of [
      'overview',
      'target_applications',
      'key_differentiators',
      'regulatory_context',
      'compatibility_notes',
    ]) {
      expect(keys).toContain(standard);
    }
    // Keys the 0004 built-in Document Types reference must be resolvable.
    for (const seeded of ['safety_context', 'installation_context', 'package_contents']) {
      expect(keys).toContain(seeded);
    }
  });

  it('resolves guidance and labels for known keys, falls back for unknown', () => {
    expect(briefGuidance('overview')).toBeTruthy();
    expect(briefGuidance('not_a_real_key')).toBeUndefined();
    expect(briefKeyLabel('target_applications')).toBe('Target applications');
    expect(briefKeyLabel('custom_section')).toBe('Custom section');
    expect(isKnownBriefKey('overview')).toBe(true);
    expect(isKnownBriefKey('custom_section')).toBe(false);
  });

  it('humanizes an arbitrary key', () => {
    expect(humanizeBriefKey('target_applications')).toBe('Target applications');
    expect(humanizeBriefKey('overview')).toBe('Overview');
  });
});

describe('orderBriefKeys', () => {
  it('keeps canonical keys in fixed order, then extras alphabetically, deduped', () => {
    const ordered = orderBriefKeys(['zeta_custom', 'overview', 'alpha_custom', 'alpha_custom']);
    expect(ordered.slice(0, BRIEF_FRAGMENTS.length)).toEqual(BRIEF_FRAGMENTS.map((f) => f.key));
    expect(ordered.slice(BRIEF_FRAGMENTS.length)).toEqual(['alpha_custom', 'zeta_custom']);
  });

  it('returns the canonical set when no extras are supplied', () => {
    expect(orderBriefKeys([])).toEqual(BRIEF_FRAGMENTS.map((f) => f.key));
  });
});

describe('briefFragmentKeySchema', () => {
  it('accepts lowercase slug keys', () => {
    expect(briefFragmentKeySchema.parse('target_applications')).toBe('target_applications');
  });

  it('rejects uppercase, leading digits, spaces, and over-long keys', () => {
    expect(briefFragmentKeySchema.safeParse('Target').success).toBe(false);
    expect(briefFragmentKeySchema.safeParse('1abc').success).toBe(false);
    expect(briefFragmentKeySchema.safeParse('two words').success).toBe(false);
    expect(briefFragmentKeySchema.safeParse('a'.repeat(65)).success).toBe(false);
  });
});

describe('briefFragmentFormSchema', () => {
  const base = {
    entityType: 'product',
    entityId: '11111111-1111-1111-1111-111111111111',
    key: 'overview',
  };

  it('accepts a valid fragment and an empty body (a clear)', () => {
    expect(briefFragmentFormSchema.safeParse({ ...base, content: 'A motor.' }).success).toBe(true);
    expect(briefFragmentFormSchema.safeParse({ ...base, content: '' }).success).toBe(true);
  });

  it('rejects an unknown entity type and an over-long body', () => {
    expect(briefFragmentFormSchema.safeParse({ ...base, entityType: 'doc', content: '' }).success).toBe(
      false,
    );
    expect(
      briefFragmentFormSchema.safeParse({ ...base, content: 'x'.repeat(TEXT_LIMITS.briefFragment + 1) })
        .success,
    ).toBe(false);
  });
});
