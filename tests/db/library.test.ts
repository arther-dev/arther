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

  it('an editor edits the blocks + records a version; a viewer cannot edit (R.2c)', async () => {
    const id = (
      await member`
        insert into public.library_items (workspace_id, name, type, created_by)
        values (${ws}, 'Editable', 'snippet', ${memberId}) returning id
      `
    )[0]!.id as string;
    // Editor updates the block content and records a version snapshot.
    await member`update public.library_items set blocks = '[{"type":"divider"}]'::jsonb where id = ${id}`;
    await member`
      insert into public.library_item_versions (workspace_id, library_item_id, blocks_snapshot, change_note, created_by)
      values (${ws}, ${id}, '[{"type":"divider"}]'::jsonb, 'Edited', ${memberId})
    `;
    expect(
      await owner`select version_id from public.library_item_versions where library_item_id = ${id}`,
    ).toHaveLength(1);
    // A viewer cannot edit the blocks. RLS UPDATE filters the row out via `using`
    // (a viewer isn't an editor), so the statement touches 0 rows — no error — and
    // the content is unchanged.
    const attempted = await viewer`
      update public.library_items set blocks = '[]'::jsonb where id = ${id} returning id
    `;
    expect(attempted).toHaveLength(0);
    const after = (await owner`select blocks from public.library_items where id = ${id}`)[0]!.blocks;
    const blocks = typeof after === 'string' ? JSON.parse(after) : after;
    expect(blocks).toEqual([{ type: 'divider' }]);
  });

  it('rolls a snippet back to a prior version, keeping history append-only (R.4)', async () => {
    const v1 = [{ type: 'divider' }];
    const v2 = [{ type: 'paragraph', content: { alignment: 'left', nodes: [] } }];
    const id = (
      await member`
        insert into public.library_items (workspace_id, name, type, blocks, created_by)
        values (${ws}, 'Rollback target', 'snippet', ${member.json(v1)}, ${memberId}) returning id
      `
    )[0]!.id as string;
    const v1Version = (
      await member`
        insert into public.library_item_versions (workspace_id, library_item_id, blocks_snapshot, change_note, created_by)
        values (${ws}, ${id}, ${member.json(v1)}, 'Created', ${memberId}) returning version_id
      `
    )[0]!.version_id as string;
    // Edit forward to v2.
    await member`update public.library_items set blocks = ${member.json(v2)} where id = ${id}`;
    await member`
      insert into public.library_item_versions (workspace_id, library_item_id, blocks_snapshot, change_note, created_by)
      values (${ws}, ${id}, ${member.json(v2)}, 'Edited', ${memberId})
    `;

    // Roll back to v1: read its snapshot, write it as current, record a NEW version.
    const snap = (
      await member`select blocks_snapshot from public.library_item_versions where version_id = ${v1Version} and library_item_id = ${id}`
    )[0]!.blocks_snapshot;
    const snapshot = typeof snap === 'string' ? JSON.parse(snap) : snap;
    await member`update public.library_items set blocks = ${member.json(snapshot)} where id = ${id}`;
    await member`
      insert into public.library_item_versions (workspace_id, library_item_id, blocks_snapshot, change_note, created_by)
      values (${ws}, ${id}, ${member.json(snapshot)}, 'Rolled back to the version from 2026-06-18', ${memberId})
    `;

    // Current content is v1 again; the rolled-back-to version is preserved (append-only).
    const current = (await owner`select blocks from public.library_items where id = ${id}`)[0]!.blocks;
    expect(typeof current === 'string' ? JSON.parse(current) : current).toEqual(v1);
    expect(
      await owner`select version_id from public.library_item_versions where library_item_id = ${id}`,
    ).toHaveLength(3);
    expect(
      await owner`select version_id from public.library_item_versions where version_id = ${v1Version}`,
    ).toHaveLength(1);

    // A viewer cannot record a rollback version.
    await expectDenied(
      () =>
        viewer`insert into public.library_item_versions (workspace_id, library_item_id, blocks_snapshot, change_note) values (${ws}, ${id}, ${viewer.json(v1)}, 'Rolled back')`,
    );
  });

  it('stores a promoted block sequence verbatim (content fidelity for R.2 promotion)', async () => {
    // "Save to Library" copies the selected blocks' content into library_items.blocks;
    // the jsonb must round-trip exactly so the promoted snippet renders what was selected.
    const blocks = [
      { type: 'paragraph', content: { alignment: 'left', nodes: [] } },
      { type: 'divider' },
    ];
    const id = (
      await member`
        insert into public.library_items (workspace_id, name, type, blocks, created_by)
        values (${ws}, 'Promoted', 'snippet', ${member.json(blocks)}, ${memberId})
        returning id
      `
    )[0]!.id as string;
    const raw = (await owner`select blocks from public.library_items where id = ${id}`)[0]!.blocks;
    // jsonb comes back parsed or as text depending on the driver path; normalize.
    const stored = typeof raw === 'string' ? JSON.parse(raw) : raw;
    expect(stored).toEqual(blocks);
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
