import { describe, expect, it } from 'vitest';
import { DbRuleError, rpcError } from './errors';

describe('rpcError (F8.5 least-privilege error responses)', () => {
  it('surfaces app-raised rules (P0001) verbatim as a DbRuleError', () => {
    const err = rpcError('createRelease', {
      code: 'P0001',
      message: 'product is archived; unarchive it before creating a release',
    });
    expect(err).toBeInstanceOf(DbRuleError);
    expect(err.message).toBe('product is archived; unarchive it before creating a release');
    // No internal call-site prefix leaks into a user-safe rule message.
    expect(err.message).not.toContain('createRelease');
  });

  it('keeps raw Postgres errors internal — plain Error, never a DbRuleError', () => {
    const err = rpcError('createRelease', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "product_releases_tag_key"',
    });
    expect(err).not.toBeInstanceOf(DbRuleError);
    // The call-site context is preserved for the server log,
    // but the caller folds this into a generic user message.
    expect(err.message).toContain('createRelease');
    expect(err.message).toContain('unique constraint');
  });

  it('treats a missing/unknown SQLSTATE as internal', () => {
    expect(rpcError('commitImportSession', { message: 'connection reset' })).not.toBeInstanceOf(
      DbRuleError,
    );
    expect(
      rpcError('commitImportSession', { code: '40001', message: 'serialization failure' }),
    ).not.toBeInstanceOf(DbRuleError);
  });
});
