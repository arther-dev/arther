import { describe, expect, it } from 'vitest';
import { slugifyWorkspaceName, workspaceSlugSchema, workspaceRoleSchema } from './workspace';

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
