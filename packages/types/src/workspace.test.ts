import { describe, expect, it } from 'vitest';
import {
  seatTierForRole,
  slugifyWorkspaceName,
  summarizeSeats,
  workspaceSlugSchema,
  workspaceRoleSchema,
} from './workspace';

describe('workspaceSlugSchema', () => {
  it('accepts portal-safe slugs', () => {
    for (const slug of ['acme', 'acme-motors', 'a1']) {
      expect(workspaceSlugSchema.parse(slug)).toBe(slug);
    }
  });

  it('rejects slugs that would break portal subdomains', () => {
    for (const slug of ['Acme', '-acme', 'acme-', 'ac me', 'a', 'a_b']) {
      expect(() => workspaceSlugSchema.parse(slug)).toThrow();
    }
  });
});

describe('slugifyWorkspaceName', () => {
  it('derives portal-safe slugs that pass the slug schema', () => {
    const cases: Array<[string, string]> = [
      ['Acme Motors', 'acme-motors'],
      ['  Käfer & Söhne GmbH ', 'kafer-sohne-gmbh'],
      ['BLDC—Motor (X1)', 'bldc-motor-x1'],
    ];
    for (const [name, expected] of cases) {
      const slug = slugifyWorkspaceName(name);
      expect(slug).toBe(expected);
      expect(workspaceSlugSchema.safeParse(slug).success).toBe(true);
    }
  });

  it('returns an empty string for names with no usable characters', () => {
    expect(slugifyWorkspaceName('!!!')).toBe('');
  });
});

describe('workspaceRoleSchema', () => {
  it('matches the migration 0002 role check constraint', () => {
    expect(workspaceRoleSchema.options).toEqual(['owner', 'admin', 'member', 'viewer']);
  });
});

describe('seat tracking (H.4)', () => {
  it('maps owner/admin/member to paid Editor seats and viewer to a free seat', () => {
    expect(seatTierForRole('owner')).toBe('editor');
    expect(seatTierForRole('admin')).toBe('editor');
    expect(seatTierForRole('member')).toBe('editor');
    expect(seatTierForRole('viewer')).toBe('viewer');
  });

  it('summarizes editor vs viewer seat counts', () => {
    expect(summarizeSeats(['owner', 'admin', 'member', 'viewer', 'viewer'])).toEqual({
      editorSeats: 3,
      viewerSeats: 2,
      total: 5,
    });
    expect(summarizeSeats([])).toEqual({ editorSeats: 0, viewerSeats: 0, total: 0 });
  });
});
