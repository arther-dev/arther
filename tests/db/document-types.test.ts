import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0017 probes — Document Type fork (G0.1):
 * fork_document_type() copies a built-in's sections + approval roles into the
 * caller's workspace atomically as an editable copy; the built-in stays
 * canonical; admin RLS governs the copy (members can't fork, can't edit
 * built-ins, can't fork into another tenant's workspace).
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let strangerId: string;
let ws: string;
let strangerWs: string;
let datasheetId: string;
let datasheetSectionCount: number;

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
  strangerWs = (
    await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('else')}) as id`
  )[0]!.id as string;

  // The five built-ins are seeded globally by 0004; Datasheet has five sections.
  const ds = await owner`
    select id from public.document_types where built_in is true and workspace_id is null and name = 'Datasheet'
  `;
  datasheetId = ds[0]!.id as string;
  datasheetSectionCount = Number(
    (
      await admin`select count(*)::int as n from public.document_type_sections where document_type_id = ${datasheetId}`
    )[0]!.n,
  );
  expect(datasheetSectionCount).toBeGreaterThan(0);
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), member.end(), stranger.end()]);
});

describe('fork_document_type (0017)', () => {
  it('copies the built-in into an editable workspace type with all its sections', async () => {
    const newId = (
      await owner`select public.fork_document_type(${ws}::uuid, ${datasheetId}::uuid) as id`
    )[0]!.id as string;

    const forked = (
      await owner`
        select workspace_id, name, built_in, forked_from from public.document_types where id = ${newId}
      `
    )[0]!;
    expect(forked.workspace_id).toBe(ws);
    expect(forked.built_in).toBe(false);
    expect(forked.forked_from).toBe(datasheetId);
    expect(forked.name).toBe('Datasheet');

    const sectionCount = Number(
      (
        await owner`select count(*)::int as n from public.document_type_sections where document_type_id = ${newId}`
      )[0]!.n,
    );
    expect(sectionCount).toBe(datasheetSectionCount);
    // Sections are workspace-scoped on the copy (RLS-isolatable).
    const wsScoped = Number(
      (
        await owner`select count(*)::int as n from public.document_type_sections where document_type_id = ${newId} and workspace_id = ${ws}`
      )[0]!.n,
    );
    expect(wsScoped).toBe(datasheetSectionCount);
  });

  it('leaves the built-in canonical (unchanged, still global)', async () => {
    const after = (
      await admin`
        select workspace_id, built_in,
          (select count(*)::int from public.document_type_sections where document_type_id = ${datasheetId}) as n
        from public.document_types where id = ${datasheetId}
      `
    )[0]!;
    expect(after.workspace_id).toBeNull();
    expect(after.built_in).toBe(true);
    expect(Number(after.n)).toBe(datasheetSectionCount);
  });

  it('lets an admin rename and archive a forked type', async () => {
    const id = (
      await owner`select public.fork_document_type(${ws}::uuid, ${datasheetId}::uuid) as id`
    )[0]!.id as string;
    await owner`update public.document_types set name = 'Datasheet (EU)' where id = ${id}`;
    await owner`update public.document_types set archived_at = now() where id = ${id}`;
    const row = (
      await owner`select name, archived_at from public.document_types where id = ${id}`
    )[0]!;
    expect(row.name).toBe('Datasheet (EU)');
    expect(row.archived_at).not.toBeNull();
  });

  it('denies a non-admin member forking a built-in', async () => {
    const msg = await expectDenied(
      () => member`select public.fork_document_type(${ws}::uuid, ${datasheetId}::uuid)`,
    );
    expect(msg).toBeTruthy();
  });

  it('denies editing a built-in (not editable, ever)', async () => {
    await expectDenied(
      () => owner`update public.document_types set name = 'Hacked' where id = ${datasheetId}`,
    );
    // confirm the built-in name is untouched
    const row = (
      await admin`select name from public.document_types where id = ${datasheetId}`
    )[0]!;
    expect(row.name).toBe('Datasheet');
  });

  it("denies forking into another tenant's workspace", async () => {
    await expectDenied(
      () => owner`select public.fork_document_type(${strangerWs}::uuid, ${datasheetId}::uuid)`,
    );
  });

  it('rejects forking a non-built-in source', async () => {
    const id = (
      await owner`select public.fork_document_type(${ws}::uuid, ${datasheetId}::uuid) as id`
    )[0]!.id as string;
    // The fork itself is a workspace type — forking it must be rejected.
    const msg = await expectDenied(
      () => owner`select public.fork_document_type(${ws}::uuid, ${id}::uuid)`,
    );
    expect(msg).toContain('not a built-in');
  });
});
