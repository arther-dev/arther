import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G0.4 Brand Profiles probes — the 0004 table + RLS underpinning the admin
 * surface: owner/admin write, member/viewer read-only, the
 * brand_profiles_one_default_idx single-default invariant (the toggle in
 * @arther/db clears before it sets so this index is never tripped), and
 * cross-tenant isolation. The first-becomes-default / archive-promote logic is
 * app-side JS (covered by the @arther/db + form unit paths), not SQL behaviour.
 */

let admin: Sql;
let owner: Sql;
let adminMember: Sql;
let member: Sql;
let viewer: Sql;
let stranger: Sql;
let ownerId: string;
let adminMemberId: string;
let memberId: string;
let viewerId: string;
let strangerId: string;
let ws: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `bp-owner-${run}@example.com`);
  adminMemberId = await createAuthUser(admin, `bp-admin-${run}@example.com`);
  memberId = await createAuthUser(admin, `bp-member-${run}@example.com`);
  viewerId = await createAuthUser(admin, `bp-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `bp-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  adminMember = await userClient(adminMemberId);
  member = await userClient(memberId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Brandspace', ${uniqueSlug('brand')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values
      (${ws}, ${adminMemberId}, 'admin', ${ownerId}),
      (${ws}, ${memberId}, 'member', ${ownerId}),
      (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;
  // The stranger lives in a different tenant — the isolation probe.
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('else')})`;
});

afterAll(async () => {
  await Promise.all([
    admin.end(),
    owner.end(),
    adminMember.end(),
    member.end(),
    viewer.end(),
    stranger.end(),
  ]);
});

describe('brand profiles RLS (0004)', () => {
  it('an admin can create a profile and every member can read it', async () => {
    const id = (
      await adminMember`
        insert into public.brand_profiles (workspace_id, name, created_by)
        values (${ws}, 'House Style', ${adminMemberId}) returning id
      `
    )[0]!.id as string;

    for (const client of [owner, adminMember, member, viewer]) {
      const rows = await client`select id from public.brand_profiles where id = ${id}`;
      expect(rows.length).toBe(1);
    }
  });

  it('a member cannot create a profile', async () => {
    const message = await expectDenied(
      () =>
        member`insert into public.brand_profiles (workspace_id, name) values (${ws}, 'Sneaky')`,
    );
    expect(message).toMatch(/row-level security|denied|policy/i);
  });

  it('a viewer cannot create a profile', async () => {
    await expectDenied(
      () =>
        viewer`insert into public.brand_profiles (workspace_id, name) values (${ws}, 'Nope')`,
    );
  });

  it('enforces a single workspace default via the partial unique index', async () => {
    await owner`
      insert into public.brand_profiles (workspace_id, name, is_workspace_default, created_by)
      values (${ws}, 'Default A', true, ${ownerId})
    `;
    // A second simultaneous default is rejected.
    const message = await expectDenied(
      () => owner`
        insert into public.brand_profiles (workspace_id, name, is_workspace_default, created_by)
        values (${ws}, 'Default B', true, ${ownerId})
      `,
    );
    expect(message).toMatch(/duplicate key|unique/i);

    // Clear-then-set (the @arther/db toggle order) succeeds.
    await owner`
      update public.brand_profiles set is_workspace_default = false
      where workspace_id = ${ws} and is_workspace_default = true
    `;
    await owner`
      insert into public.brand_profiles (workspace_id, name, is_workspace_default, created_by)
      values (${ws}, 'Default B', true, ${ownerId})
    `;
    const defaults =
      await owner`select count(*)::int as n from public.brand_profiles where workspace_id = ${ws} and is_workspace_default and archived_at is null`;
    expect(defaults[0]!.n).toBe(1);
  });

  it('an archived default no longer counts against the single-default index', async () => {
    // Two defaults can coexist if one is archived (the index is partial on archived_at).
    await owner`
      update public.brand_profiles
      set archived_at = now(), is_workspace_default = false
      where workspace_id = ${ws} and name = 'Default B'
    `;
    const rows = await owner`
      insert into public.brand_profiles (workspace_id, name, is_workspace_default, created_by)
      values (${ws}, 'Default C', true, ${ownerId}) returning id
    `;
    expect(rows.length).toBe(1);
  });

  it('a stranger in another tenant can neither read nor write the workspace profiles', async () => {
    const rows = await stranger`select id from public.brand_profiles where workspace_id = ${ws}`;
    expect(rows.length).toBe(0);
    await expectDenied(
      () =>
        stranger`insert into public.brand_profiles (workspace_id, name) values (${ws}, 'Intruder')`,
    );
  });
});
