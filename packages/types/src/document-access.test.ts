import { describe, expect, it } from 'vitest';
import { isPublicAccess, parseDocumentAccess } from './document-access';

describe('parseDocumentAccess (C7.1)', () => {
  it('treats missing / empty config as public (the column default)', () => {
    expect(parseDocumentAccess(undefined)).toBe('public');
    expect(parseDocumentAccess(null)).toBe('public');
    expect(parseDocumentAccess({})).toBe('public');
    expect(parseDocumentAccess({ access: 'public' })).toBe('public');
  });

  it('reads the link tier', () => {
    expect(parseDocumentAccess({ access: 'link' })).toBe('link');
  });

  it('fails closed: an unknown tier is gated, not public', () => {
    expect(parseDocumentAccess({ access: 'allowlist' })).toBe('link');
    expect(parseDocumentAccess({ access: 'whatever' })).toBe('link');
  });

  it('a non-object falls back to public (matches the legacy portal reader)', () => {
    expect(parseDocumentAccess('public')).toBe('public');
    expect(parseDocumentAccess(42)).toBe('public');
  });

  it('isPublicAccess mirrors the mode', () => {
    expect(isPublicAccess({ access: 'public' })).toBe(true);
    expect(isPublicAccess({ access: 'link' })).toBe(false);
    expect(isPublicAccess({})).toBe(true);
  });
});
