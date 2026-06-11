import { describe, expect, it } from 'vitest';
import { EnvNotProvisionedError, loadEnv } from './env';

const LOCAL = { DATABASE_URL: 'postgres://postgres:postgres@localhost:54329/arther' };

describe('loadEnv', () => {
  it('passes when every required tier is present', () => {
    const env = loadEnv(['local'], LOCAL);
    expect(env.DATABASE_URL).toBe(LOCAL.DATABASE_URL);
  });

  it('fails fast when a required tier is missing keys', () => {
    expect(() => loadEnv(['local'], {})).toThrow(/DATABASE_URL/);
  });

  it('fails fast listing every missing key of a required tier', () => {
    expect(() => loadEnv(['phase1Cloud'], {})).toThrow(/SUPABASE_URL[\s\S]*SUPABASE_ANON_KEY/);
  });

  it('boots without optional tiers, then throws a typed error on access', () => {
    const env = loadEnv(['local'], LOCAL);
    expect(() => env.ANTHROPIC_API_KEY).toThrow(EnvNotProvisionedError);
    expect(() => env.ANTHROPIC_API_KEY).toThrow(/IMPLEMENTATION_PLAN\.md/);
  });

  it('exposes optional-tier keys when they are present', () => {
    const env = loadEnv(['local'], { ...LOCAL, ANTHROPIC_API_KEY: 'sk-test' });
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
  });

  it('rejects malformed values in required tiers', () => {
    expect(() => loadEnv(['local'], { DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });
});
