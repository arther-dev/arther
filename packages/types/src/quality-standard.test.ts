import { describe, expect, it } from 'vitest';
import {
  formatQualityConstraints,
  MAX_QUALITY_CONSTRAINTS,
  parseQualityConstraints,
  qualityStandardFormSchema,
  type QualityConstraint,
} from './quality-standard';
import { TEXT_LIMITS } from './text';

describe('parseQualityConstraints', () => {
  it('parses a full pipe-delimited constraint', () => {
    const [c] = parseQualityConstraints('section | Specifications | max_words: 150 | Keep it tight');
    expect(c).toEqual<QualityConstraint>({
      scope: 'section',
      target: 'Specifications',
      rule: 'max_words: 150',
      description: 'Keep it tight',
    });
  });

  it('drops the target for a global-scoped constraint even if one is typed', () => {
    const [c] = parseQualityConstraints('global | ignored | require_summary: true |');
    expect(c).toEqual<QualityConstraint>({ scope: 'global', rule: 'require_summary: true' });
    expect(c).not.toHaveProperty('target');
  });

  it('treats target and description as optional', () => {
    const [c] = parseQualityConstraints('block_type | | imperative_mood: true');
    expect(c).toEqual<QualityConstraint>({ scope: 'block_type', rule: 'imperative_mood: true' });
  });

  it('skips blank lines and lines with an unknown scope or empty rule', () => {
    const out = parseQualityConstraints(
      ['', 'nonsense | x | y', 'section | S | ', 'global | | real_rule: 1', '   '].join('\n'),
    );
    expect(out).toEqual<QualityConstraint[]>([{ scope: 'global', rule: 'real_rule: 1' }]);
  });

  it('is case-insensitive on scope and keeps pipes inside the description', () => {
    const [c] = parseQualityConstraints('GLOBAL | | rule | a | b | c');
    expect(c).toEqual<QualityConstraint>({ scope: 'global', rule: 'rule', description: 'a | b | c' });
  });

  it('caps the constraint count', () => {
    const raw = Array.from({ length: MAX_QUALITY_CONSTRAINTS + 25 }, () => 'global | | r: 1').join(
      '\n',
    );
    expect(parseQualityConstraints(raw)).toHaveLength(MAX_QUALITY_CONSTRAINTS);
  });

  it('round-trips through formatQualityConstraints', () => {
    const constraints: QualityConstraint[] = [
      { scope: 'global', rule: 'require_summary: true', description: 'every doc opens with a summary' },
      { scope: 'section', target: 'Safety', rule: 'require_conditions_column: true' },
    ];
    expect(parseQualityConstraints(formatQualityConstraints(constraints))).toEqual(constraints);
  });
});

describe('qualityStandardFormSchema', () => {
  it('requires a name', () => {
    expect(qualityStandardFormSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('accepts a name with optional constraints text', () => {
    const parsed = qualityStandardFormSchema.safeParse({
      name: 'House discipline',
      constraints: 'global | | require_summary: true',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a constraints blob past the ceiling', () => {
    const parsed = qualityStandardFormSchema.safeParse({
      name: 'Big',
      constraints: 'x'.repeat(TEXT_LIMITS.briefFragment + 1),
    });
    expect(parsed.success).toBe(false);
  });
});
