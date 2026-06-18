import postgres, { type Sql } from 'postgres';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/arther';

/** Superuser connection — migrations owner; bypasses RLS like the table owner does. */
export function adminClient(): Sql {
  return postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
}

/**
 * A connection simulating an authenticated Supabase user: SET ROLE
 * authenticated + request.jwt.claims, which is exactly how Supabase resolves
 * auth.uid() server-side. One dedicated connection per simulated user.
 */
export async function userClient(userId: string): Promise<Sql> {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  await sql.unsafe(`select set_config('request.jwt.claims', '${claims}', false)`);
  await sql.unsafe('set role authenticated');
  return sql;
}

/**
 * A connection simulating an UNAUTHENTICATED Supabase visitor: SET ROLE anon
 * with no `sub` claim, so `auth.uid()` is null. This is the portal's worst-case
 * boundary — member-RLS tables (drafts, specs, snapshots) have no anon policy,
 * so anon reads return nothing (the portal must use the constrained service role).
 */
export async function anonClient(): Promise<Sql> {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  await sql.unsafe(`select set_config('request.jwt.claims', '{}', false)`);
  await sql.unsafe('set role anon');
  return sql;
}

/** Insert an auth.users row (the shim's GoTrue stand-in); the 0002 trigger mirrors it. */
export async function createAuthUser(admin: Sql, email: string): Promise<string> {
  const rows = await admin`
    insert into auth.users (email, raw_user_meta_data)
    values (${email}, ${JSON.stringify({ full_name: email.split('@')[0] })}::jsonb)
    returning id
  `;
  return rows[0]!.id as string;
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Assert that a query is denied by RLS/grants (insert/update with-check failures raise 42501). */
export async function expectDenied(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the statement to be denied, but it succeeded');
}
