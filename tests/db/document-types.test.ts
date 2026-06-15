import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0017 probes — Document Type fork (G0.1/G0.2):
 * fork_document_type() atomically copies a type + sections + approval roles
 * into the caller's workspace under invoker RLS; built-ins (workspace_id null)
 * stay canonical and uneditable in place; only owner/admin may fork or edit;
 * cross-tenant forks are denied.
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let viewer: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let viewerId: string;
let strangerId: string;
let ws: string;
let strangerWs: string;
let builtinId: string;
let builtinSectionCount: number;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `dt-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `dt-member-${run}@example.com`);
  viewerId = await createAuthUser(admin, `dt-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `dt-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Typespace', ${uniqueSlug('dt')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId}), (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;
  strangerWs = (
    await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('else')}) as id`
  )[0]!.id as string;

  const builtin =
    await admin`select id from public.document_types where built_in and name = 'Datasheet' limit 1`;
  builtinId = builtin[0]!.id as string;
  builtinSectionCount = Number(
    (
      await admin`select count(*)::int as n from public.document_type_sections where document_type_id = ${builtinId}`
    )[0]!.n,
  );
});

afterAll(async () => {
  await Promise.all([
    admin?.end(),
    owner?.end(),
    member?.end(),
    viewer?.end(),
    stranger?.end(),
  ]);
});

describe('fork_document_type', () => {
  it('copies the type + sections into the workspace as an editable copy, original untouched', async () => {
    const newId = (
      await owner`select public.fork_document_type(${builtinId}, ${ws}) as id`
    )[0]!.id as string;

    const copy = (await owner`select * from public.document_types where id = ${newId}`)[0]!;
    expect(copy.workspace_id).toBe(ws);
    expect(copy.built_in).toBe(false);
    expect(copy.forked_from).toBe(builtinId);

    const copiedSections = Number(
      (
        await owner`select count(*)::int as n from public.document_type_sections where document_type_id = ${newId}`
      )[0]!.n,
    );
    expect(copiedSections).toBe(builtinSectionCount);
    expect(copiedSections).toBeGreaterThan(0);

    // The built-in is unchanged — still global, still the same section count.
    const src = (await admin`select workspace_id, built_in from public.document_types where id = ${builtinId}`)[0]!;
    expect(src.workspace_id).toBeNull();
    expect(src.built_in).toBe(true);

    // The copy is now freely editable (it carries a workspace_id).
    await owner`update public.document_types set description = 'edited' where id = ${newId}`;
    const edited = (await owner`select description from public.document_types where id = ${newId}`)[0]!;
    expect(edited.description).toBe('edited');
  });

  it('copies approval roles too (atomic copy of the whole type)', async () => {
    const base = (await owner`select public.fork_document_type(${builtinId}, ${ws}) as id`)[0]!.id as string;
    await owner`
      insert into public.document_type_approval_roles (workspace_id, document_type_id, role_label, required, created_by)
      values (${ws}, ${base}, 'Engineering', true, ${ownerId})
    `;
    const refork = (await owner`select public.fork_document_type(${base}, ${ws}) as id`)[0]!.id as string;
    const roles =
      await owner`select role_label, required from public.document_type_approval_roles where document_type_id = ${refork}`;
    expect(roles).toHaveLength(1);
    expect(roles[0]!.role_label).toBe('Engineering');
    expect(roles[0]!.required).toBe(true);
  });

  it('a non-admin member cannot fork (RLS with-check on the new type row)', async () => {
    await expectDenied(() => member`select public.fork_document_type(${builtinId}, ${ws})`);
  });

  it('a viewer cannot fork', async () => {
    await expectDenied(() => viewer`select public.fork_document_type(${builtinId}, ${ws})`);
  });

  it('a stranger cannot fork into a workspace they are not an admin of', async () => {
    await expectDenied(() => stranger`select public.fork_document_type(${builtinId}, ${ws})`);
    // ...but they can fork the same built-in into their own workspace.
    const mine = (
      await stranger`select public.fork_document_type(${builtinId}, ${strangerWs}) as id`
    )[0]!.id as string;
    expect(mine).toBeTruthy();
  });
});

describe('built-ins stay canonical', () => {
  it('an admin cannot edit a built-in in place (workspace_id null fails the write policy)', async () => {
    const before = (await admin`select name from public.document_types where id = ${builtinId}`)[0]!.name;
    // RLS USING filters the row out, so the UPDATE matches nothing — no error, no change.
    await owner`update public.document_types set name = 'Hacked' where id = ${builtinId}`;
    const after = (await admin`select name from public.document_types where id = ${builtinId}`)[0]!.name;
    expect(after).toBe(before);
  });

  it('an admin cannot create a built-in (workspace_id null) section', async () => {
    await expectDenied(
      () => owner`
        insert into public.document_type_sections (workspace_id, document_type_id, name)
        values (null, ${builtinId}, 'Sneaky')
      `,
    );
  });
});

describe('tenant isolation', () => {
  it('a stranger cannot see another workspace’s Document Types', async () => {
    const forkId = (await owner`select public.fork_document_type(${builtinId}, ${ws}) as id`)[0]!
      .id as string;
    const visible =
      await stranger`select id from public.document_types where id = ${forkId}`;
    expect(visible).toHaveLength(0);
  });
});
