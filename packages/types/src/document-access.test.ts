import { describe, expect, it } from 'vitest';
import {
  isEmailAllowed,
  isPublicAccess,
  magicLinkStatus,
  normalizeDomains,
  normalizeEmails,
  parseDocumentAccess,
  parseDocumentAllowlist,
} from './document-access';

describe('parseDocumentAccess (C7.1)', () => {
  it('treats missing / empty config as public (the column default)', () => {
    expect(parseDocumentAccess(undefined)).toBe('public');
    expect(parseDocumentAccess(null)).toBe('public');
    expect(parseDocumentAccess({})).toBe('public');
    expect(parseDocumentAccess({ access: 'public' })).toBe('public');
  });

  it('reads the gated tiers', () => {
    expect(parseDocumentAccess({ access: 'link' })).toBe('link');
    expect(parseDocumentAccess({ access: 'allowlist' })).toBe('allowlist');
  });

  it('fails closed: an unknown tier is gated, not public', () => {
    expect(parseDocumentAccess({ access: 'whatever' })).toBe('link');
  });

  it('a non-object falls back to public (matches the legacy portal reader)', () => {
    expect(parseDocumentAccess('public')).toBe('public');
    expect(parseDocumentAccess(42)).toBe('public');
  });

  it('isPublicAccess mirrors the mode', () => {
    expect(isPublicAccess({ access: 'public' })).toBe(true);
    expect(isPublicAccess({ access: 'link' })).toBe(false);
    expect(isPublicAccess({ access: 'allowlist' })).toBe(false);
    expect(isPublicAccess({})).toBe(true);
  });
});

describe('allowlist (C7.3)', () => {
  const cfg = {
    access: 'allowlist',
    allowlist: { emails: ['Alice@Acme.com'], domains: ['@Partner.io'] },
  };

  it('normalises emails and domains on read', () => {
    expect(parseDocumentAllowlist(cfg)).toEqual({
      emails: ['alice@acme.com'],
      domains: ['partner.io'],
    });
  });

  it('admits an exactly-listed email (case-insensitive)', () => {
    expect(isEmailAllowed(cfg, 'alice@acme.com')).toBe(true);
    expect(isEmailAllowed(cfg, 'ALICE@ACME.COM')).toBe(true);
  });

  it('admits any address on a listed domain', () => {
    expect(isEmailAllowed(cfg, 'bob@partner.io')).toBe(true);
  });

  it('rejects an off-list email', () => {
    expect(isEmailAllowed(cfg, 'eve@evil.com')).toBe(false);
    expect(isEmailAllowed(cfg, 'alice@acme.org')).toBe(false); // wrong domain
  });

  it('rejects malformed emails and admits no one with an empty allowlist', () => {
    expect(isEmailAllowed(cfg, 'not-an-email')).toBe(false);
    expect(isEmailAllowed(cfg, 'trailing@')).toBe(false);
    expect(isEmailAllowed({ access: 'allowlist' }, 'alice@acme.com')).toBe(false);
  });

  it('only applies to the allowlist tier', () => {
    expect(isEmailAllowed({ access: 'link' }, 'alice@acme.com')).toBe(false);
    expect(isEmailAllowed({ access: 'public' }, 'alice@acme.com')).toBe(false);
  });

  it('normalize helpers trim, lowercase, dedupe, and drop junk', () => {
    expect(normalizeEmails([' A@b.com ', 'a@b.com', 'nope'])).toEqual(['a@b.com']);
    expect(normalizeDomains(['@Acme.com ', 'acme.com', 'localhost'])).toEqual(['acme.com']);
  });
});

describe('magicLinkStatus (C7.4)', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();

  it('revoked beats everything', () => {
    expect(magicLinkStatus({ revokedAt: past, expiresAt: future })).toBe('revoked');
  });
  it('expired when past expiry and not revoked', () => {
    expect(magicLinkStatus({ revokedAt: null, expiresAt: past })).toBe('expired');
  });
  it('active otherwise', () => {
    expect(magicLinkStatus({ revokedAt: null, expiresAt: future })).toBe('active');
  });
});
