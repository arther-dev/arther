import { describe, expect, it } from 'vitest';
import { workspaceSlugSchema, workspaceRoleSchema } from './workspace';

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

describe('workspaceRoleSchema', () => {
  it('matches the migration 0002 role check constraint', () => {
    expect(workspaceRoleSchema.options).toEqual(['owner', 'admin', 'member', 'viewer']);
  });
});
