import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient } from './helpers';

/**
 * F8.6 single-handler audit — "one handler per trigger (signup, invite); no
 * duplicate workflows".
 *
 * The code-path half (exactly one server action / RPC per lifecycle trigger,
 * one membership-insertion path for both signup and invite accept) is verified
 * and recorded in the IMPLEMENTATION_PLAN session log. These probes lock the
 * DB-level half that CI can enforce going forward: a future migration that adds
 * a second trigger double-processing the same event (the duplicate-workflow
 * smell) fails here.
 */

let admin: Sql;

beforeAll(() => {
  admin = adminClient();
});

afterAll(async () => {
  await admin?.end();
});

describe('F8.6 single-handler audit', () => {
  it('mirrors a new auth user through exactly one trigger (handle_new_user)', async () => {
    const rows = await admin`
      select p.proname
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal
    `;
    expect(rows.map((r) => r.proname)).toEqual(['handle_new_user']);
  });

  it('guards owner-row rules through exactly one trigger on workspace_members', async () => {
    const rows = await admin`
      select count(*)::int as n
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and c.relname = 'workspace_members'
        and not t.tgisinternal and p.proname = 'guard_member_owner_rules'
    `;
    expect(rows[0]!.n).toBe(1);
  });

  it('inserts workspace_members from exactly one definer RPC per lifecycle path', async () => {
    // Signup → create_workspace (owner row); invite accept → accept_workspace_invitation
    // (member row). Both are SECURITY DEFINER (the only sanctioned membership
    // writers); transfer_workspace_ownership mutates, never inserts. A new
    // definer function mentioning the table is a second workflow to scrutinise.
    const rows = await admin`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and pg_get_functiondef(p.oid) ilike '%insert into public.workspace_members%'
      order by p.proname
    `;
    expect(rows.map((r) => r.proname)).toEqual([
      'accept_workspace_invitation',
      'create_workspace',
    ]);
  });

  it('has no duplicate user-defined triggers for the same table + event + function', async () => {
    const dups = await admin`
      select n.nspname, c.relname, p.proname, t.tgtype, count(*)::int as n
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      where not t.tgisinternal and n.nspname in ('public', 'auth')
      group by n.nspname, c.relname, p.proname, t.tgtype
      having count(*) > 1
    `;
    expect(dups).toEqual([]);
  });
});
