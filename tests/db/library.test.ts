import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * R.1 — block library RLS (0009). The library is editor-write (owner/admin/member,
 * viewers excluded — `is_workspace_editor`) and member-read. Locks:
 *   • an editor (a plain member here) creates a library_item + its version row,
 *     and every member — including a viewer — can read both;
 *   • a viewer cannot write either table;
 *   • the hard-delete guard allows deleting an item with no embeds;
 *   • cross-tenant isolation (a stranger sees and writes nothing).
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let viewer: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let viewerId: string;
let ws: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `li-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `li-member-${run}@example.com`);
  viewerId = await createAuthUser(admin, `li-viewer-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `li-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Library', ${uniqueSlug('lib')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values
      (${ws}, ${memberId}, 'member', ${ownerId}),
      (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('libx')})`;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), member.end(), viewer.end(), stranger.end()]);
});

describe('block library RLS (0009)', () => {
  it('a member (editor) creates an item + version that every member can read', async () => {
    const id = (
      await member`
        insert into public.library_items (workspace_id, name, type, owner_id, created_by)
        values (${ws}, 'Warranty notice', 'snippet', ${memberId}, ${memberId}) returning id
      `
    )[0]!.id as string;
    await member`
      insert into public.library_item_versions (workspace_id, library_item_id, blocks_snapshot, created_by)
      values (${ws}, ${id}, '[]'::jsonb, ${memberId})
    `;

    for (const client of [owner, member, viewer]) {
      expect(await client`select id from public.library_items where id = ${id}`).toHaveLength(1);
      expect(
        await client`select version_id from public.library_item_versions where library_item_id = ${id}`,
      ).toHaveLength(1);
    }
  });

  it('a viewer can read but cannot create an item or a version', async () => {
    await expectDenied(
      () =>
        viewer`insert into public.library_items (workspace_id, name, type) values (${ws}, 'Nope', 'template')`,
    );
    const someId = (
      await owner`
        insert into public.library_items (workspace_id, name, type, created_by)
        values (${ws}, 'Owned', 'snippet', ${ownerId}) returning id
      `
    )[0]!.id as string;
    await expectDenied(
      () =>
        viewer`insert into public.library_item_versions (workspace_id, library_item_id, blocks_snapshot) values (${ws}, ${someId}, '[]'::jsonb)`,
    );
  });

  it('the delete guard allows removing an item with no embeds', async () => {
    const id = (
      await owner`
        insert into public.library_items (workspace_id, name, type, created_by)
        values (${ws}, 'Disposable', 'template', ${ownerId}) returning id
      `
    )[0]!.id as string;
    await owner`delete from public.library_items where id = ${id}`;
    expect(await owner`select id from public.library_items where id = ${id}`).toHaveLength(0);
  });

  it('a stranger in another tenant can neither read nor write the library', async () => {
    expect(await stranger`select id from public.library_items where workspace_id = ${ws}`).toHaveLength(
      0,
    );
    await expectDenied(
      () =>
        stranger`insert into public.library_items (workspace_id, name, type) values (${ws}, 'Intruder', 'snippet')`,
    );
  });
});
