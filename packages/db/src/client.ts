import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from '@arther/config/env';

/**
 * Two data paths, never mixed (architecture §3, ADR-010):
 *
 *  - user client  — carries the user's JWT; RLS is ACTIVE. Used by apps for
 *    reads and `canDo`-gated mutations.
 *  - service client — service role; RLS is BYPASSED. Used only by trusted
 *    server paths and jobs, and only through scopedServiceQuery() so every
 *    query carries its workspace_id.
 *
 * Both factories are env-gated: before Supabase is provisioned (F0.2) they
 * throw EnvNotProvisionedError with a pointer to the activation schedule —
 * the app boots, the data path explains itself.
 */

export function createUserClient(accessToken: string): SupabaseClient {
  const env = loadEnv(['phase1Cloud']);
  return createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createServiceClient(): SupabaseClient {
  const env = loadEnv(['phase1Cloud']);
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
