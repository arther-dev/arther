import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@arther/db';

/**
 * The portal's data path (C6.1). The portal serves anonymous visitors, so it
 * reads published snapshots through the SERVICE client (the `@arther/db` portal
 * readers scope every query to one workspace + public access). Env-gated: before
 * Supabase is provisioned it returns null so pages render a graceful message
 * instead of crashing — the portal explains itself.
 */
export function getPortalDb(): SupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}
