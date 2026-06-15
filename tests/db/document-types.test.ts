import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0017 + 0004 RLS probes — Document Types (G0.1):
 * built-ins are global and read-only; fork_document_type() copies a built-in
 * (type + sections) into the caller's workspace atomically under the caller's
 * RLS; only admins may fork; workspace types are admin-editable and archivable;
 * a second workspace sees built-ins but never another tenant's fork.
 */

let admin: Sql;
let owner: Sql; // workspace creator → role 'owner' (an admin)
let member: Sql; // role 'member' — not an admin
let stranger: Sql; // owns a different workspace
let ownerId: string;
let memberId: string;
let strangerId: string;
let ws: string;
let datasheetId: string; // a built-in source
let datasheetSections: number;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `dt-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `dt-member-${run}@example.com`);
  strangerId = await createAuthUser(admin, `dt-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Typespace', ${uniqueSlug('dt')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('else')})`;

  const src = await owner`
    select id, (select count(*) from public.document_type_sections s where s.document_type_id = dt.id) as n
    from public.document_types dt
    where dt.built_in and dt.workspace_id is null and dt.name = 'Datasheet'
  `;
  datasheetId = src[0]!.id as string;
  datasheetSections = Number(src[0]!.n);
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), member.end(), stranger.end()]);
});

describe('document types — built-ins & fork (G0.1)', () => {
  it('ships the five built-in types, visible to every workspace', async () => {
    const seen = await owner`select count(*)::int as n from public.document_types where built_in`;
    expect(seen[0]!.n).toBeGreaterThanOrEqual(5);
    expect(datasheetSections).toBeGreaterThan(0);
  });

  it('built-ins are read-only: an admin cannot edit, archive, or delete one', async () => {
    // RLS update/delete USING clause excludes workspace_id-null rows → 0 rows, no error.
    const renamed = await owner`
      update public.document_types set name = 'Hacked' where id = ${datasheetId} returning id
    `;
    expect(renamed.length).toBe(0);
    const archived = await owner`
      update public.document_types set archived_at = now() where id = ${datasheetId} returning id
    `;
    expect(archived.length).toBe(0);
    const deleted = await owner`delete from public.document_types where id = ${datasheetId} returning id`;
    expect(deleted.length).toBe(0);
    // And no one can mint a new built-in (with-check requires workspace_id not null).
    await expectDenied(
      () => owner`insert into public.document_types (name, built_in) values ('Bogus', true)`,
    );
  });

  it('an admin forks a built-in: new workspace copy with its sections, atomically', async () => {
    const forkId = (
      await owner`select public.fork_document_type(${datasheetId}, ${ws}) as id`
    )[0]!.id as string;

    const fork = (await owner`
      select workspace_id, name, built_in, forked_from from public.document_types where id = ${forkId}
    `)[0]!;
    expect(fork.workspace_id).toBe(ws);
    expect(fork.built_in).toBe(false);
    expect(fork.forked_from).toBe(datasheetId);
    expect(fork.name).toBe('Datasheet');

    const sections = await owner`
      select count(*)::int as n from public.document_type_sections where document_type_id = ${forkId}
    `;
    expect(sections[0]!.n).toBe(datasheetSections);
    // The fork is editable (workspace-owned), unlike its source.
    const renamed = await owner`
      update public.document_types set name = 'Datasheet (custom)' where id = ${forkId} returning id
    `;
    expect(renamed.length).toBe(1);
  });

  it('forking a non-built-in is rejected', async () => {
    const ownType = (
      await owner`
        insert into public.document_types (workspace_id, name, built_in, created_by)
        values (${ws}, 'From scratch', false, ${ownerId}) returning id
      `
    )[0]!.id as string;
    const msg = await expectDenied(
      () => owner`select public.fork_document_type(${ownType}, ${ws})`,
    );
    expect(msg).toMatch(/only built-in/i);
  });

  it('a non-admin member cannot fork (RLS write gate behind the RPC)', async () => {
    await expectDenied(() => member`select public.fork_document_type(${datasheetId}, ${ws})`);
  });

  it('a member can read workspace types but cannot create or archive them', async () => {
    const created = (
      await owner`
        insert into public.document_types (workspace_id, name, built_in, created_by)
        values (${ws}, 'Service Bulletin', false, ${ownerId}) returning id
      `
    )[0]!.id as string;
    // Member reads it (member-wide read policy)...
    const read = await member`select id from public.document_types where id = ${created}`;
    expect(read.length).toBe(1);
    // ...but cannot create their own (admin-only write).
    await expectDenied(
      () =>
        member`insert into public.document_types (workspace_id, name, built_in, created_by)
               values (${ws}, 'Sneaky', false, ${memberId})`,
    );
    // ...and the admin archive/restore round-trips.
    await owner`update public.document_types set archived_at = now() where id = ${created}`;
    const stillThere = await owner`
      select archived_at from public.document_types where id = ${created}
    `;
    expect(stillThere[0]!.archived_at).not.toBeNull();
    await owner`update public.document_types set archived_at = null where id = ${created}`;
  });

  it('a second workspace sees built-ins but never another tenant’s type', async () => {
    const forkId = (
      await owner`select public.fork_document_type(${datasheetId}, ${ws}) as id`
    )[0]!.id as string;
    const hidden = await stranger`select id from public.document_types where id = ${forkId}`;
    expect(hidden.length).toBe(0);
    const builtins = await stranger`select count(*)::int as n from public.document_types where built_in`;
    expect(builtins[0]!.n).toBeGreaterThanOrEqual(5);
  });
});
