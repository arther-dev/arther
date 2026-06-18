import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * R.8 — duplication_records RLS (0009): the audit row `duplicateDocument` writes.
 * Editor-write, member-read (the doc references are nullable / on delete set null,
 * so the probe uses bare rows). The block/reference/embed copies themselves go
 * through tables already probed elsewhere; this locks the record's policy.
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let viewer: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let ws: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `dup-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `dup-member-${run}@example.com`);
  const viewerId = await createAuthUser(admin, `dup-viewer-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `dup-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Dup Co', ${uniqueSlug('dup')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId}), (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('dupx')})`;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), member.end(), viewer.end(), stranger.end()]);
});

describe('duplication_records RLS (0009)', () => {
  it('an editor records a duplication that every member can read', async () => {
    const id = (
      await member`
        insert into public.duplication_records (workspace_id, blocks_resolved, blocks_carried_over, created_by)
        values (${ws}, 5, 2, ${memberId}) returning id
      `
    )[0]!.id as string;
    for (const client of [owner, member, viewer]) {
      expect(await client`select id from public.duplication_records where id = ${id}`).toHaveLength(1);
    }
  });

  it('a viewer cannot record a duplication', async () => {
    await expectDenied(
      () => viewer`insert into public.duplication_records (workspace_id) values (${ws})`,
    );
  });

  it('a stranger in another tenant can neither read nor write', async () => {
    expect(
      await stranger`select id from public.duplication_records where workspace_id = ${ws}`,
    ).toHaveLength(0);
    await expectDenied(
      () => stranger`insert into public.duplication_records (workspace_id) values (${ws})`,
    );
  });
});
