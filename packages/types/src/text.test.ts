import { describe, expect, it } from 'vitest';
import { emailField, optionalText, requiredText, TEXT_LIMITS } from './text';

describe('requiredText', () => {
  it('trims and accepts non-empty text within bounds', () => {
    expect(requiredText('Name it.').parse('  Widget  ')).toBe('Widget');
  });

  it('rejects empty (or whitespace-only) input with the given message', () => {
    const r = requiredText('Name it.').safeParse('   ');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toBe('Name it.');
  });

  it('rejects text past the default name ceiling', () => {
    const r = requiredText('Name it.').safeParse('x'.repeat(TEXT_LIMITS.name + 1));
    expect(r.success).toBe(false);
  });

  it('measures length after trimming', () => {
    const padded = `  ${'x'.repeat(TEXT_LIMITS.name)}  `;
    expect(requiredText('Name it.').parse(padded)).toHaveLength(TEXT_LIMITS.name);
  });

  it('honours a custom maximum', () => {
    expect(requiredText('Tag it.', TEXT_LIMITS.tag).safeParse('v1.0').success).toBe(true);
    expect(requiredText('Tag it.', TEXT_LIMITS.tag).safeParse('v'.repeat(65)).success).toBe(false);
  });
});

describe('optionalText', () => {
  it('allows undefined and bounds the value when present', () => {
    expect(optionalText().parse(undefined)).toBeUndefined();
    expect(optionalText(10).parse('  hi  ')).toBe('hi');
    expect(optionalText(10).safeParse('x'.repeat(11)).success).toBe(false);
  });
});

describe('emailField', () => {
  it('accepts a valid address and rejects malformed or over-long ones', () => {
    expect(emailField().parse('a@b.co')).toBe('a@b.co');
    expect(emailField().safeParse('not-an-email').success).toBe(false);
    expect(emailField().safeParse(`${'a'.repeat(TEXT_LIMITS.email)}@b.co`).success).toBe(false);
  });
});
