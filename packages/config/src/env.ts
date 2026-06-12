import { z } from 'zod';

/**
 * Typed env loader (Phase 1 F0.5).
 *
 * Server-side only — importing this from client code is a bug; none of these
 * values may reach a client bundle. Keys are grouped into tiers that map to
 * the cloud-dependency activation schedule (IMPLEMENTATION_PLAN.md §6):
 *
 *   local       — usable today (dockerized Postgres)
 *   phase1Cloud — Supabase / Sentry (F0.2–F0.4)
 *   phase2Plus  — Anthropic / Trigger.dev / Resend / Upstash (G1+, C3+)
 *
 * A surface declares the tiers it requires; missing keys in a required tier
 * fail fast at startup. Keys in undeclared tiers stay optional so the app
 * boots before every provider is provisioned — accessing one then throws
 * EnvNotProvisionedError with a pointer to the activation schedule.
 */

const tierSchemas = {
  local: z.object({
    DATABASE_URL: z.string().url(),
  }),
  phase1Cloud: z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SENTRY_DSN: z.string().url().optional(),
    /** Public app origin for Supabase auth redirects (F2.1/F2.3). */
    APP_URL: z.string().url().optional(),
  }),
  phase2Plus: z.object({
    ANTHROPIC_API_KEY: z.string().min(1),
    TRIGGER_SECRET_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  }),
} as const;

export type EnvTier = keyof typeof tierSchemas;

type TierShape<T extends EnvTier> = z.infer<(typeof tierSchemas)[T]>;
export type Env = Partial<TierShape<'local'> & TierShape<'phase1Cloud'> & TierShape<'phase2Plus'>>;

export class EnvNotProvisionedError extends Error {
  constructor(key: string, tier: EnvTier) {
    super(
      `Env key "${key}" (tier: ${tier}) is not provisioned. ` +
        `See IMPLEMENTATION_PLAN.md §6 for when this provider comes online, ` +
        `and .env.example for the expected keys.`,
    );
    this.name = 'EnvNotProvisionedError';
  }
}

/**
 * Validate the tiers a surface requires; expose the rest leniently behind a
 * proxy that throws a typed error on access-when-absent.
 */
export function loadEnv(
  required: readonly EnvTier[],
  source: Record<string, string | undefined> = process.env,
): Env {
  const collected: Record<string, string | undefined> = {};
  const problems: string[] = [];

  for (const tier of Object.keys(tierSchemas) as EnvTier[]) {
    const schema = tierSchemas[tier];
    if (required.includes(tier)) {
      const parsed = schema.safeParse(source);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          problems.push(`${String(issue.path[0])} (${tier}): ${issue.message}`);
        }
      } else {
        Object.assign(collected, parsed.data);
      }
    } else {
      // Lenient: take whatever is present without validating completeness.
      for (const key of Object.keys(schema.shape)) {
        if (source[key] !== undefined && source[key] !== '') collected[key] = source[key];
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Missing or invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  }

  const tierOfKey = new Map<string, EnvTier>();
  for (const tier of Object.keys(tierSchemas) as EnvTier[]) {
    for (const key of Object.keys(tierSchemas[tier].shape)) tierOfKey.set(key, tier);
  }

  return new Proxy(collected as Env, {
    get(target, prop: string) {
      if (typeof prop !== 'string' || !tierOfKey.has(prop)) {
        return Reflect.get(target, prop);
      }
      const value = Reflect.get(target, prop);
      if (value === undefined || value === '') {
        throw new EnvNotProvisionedError(prop, tierOfKey.get(prop)!);
      }
      return value;
    },
  });
}
