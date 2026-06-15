import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0016 probes — workspace deletion (F8.7). Owner-only soft delete with
 * a 14-day grace; the moment it is requested the tenant disappears from every
 * member's RLS view, yet still resurfaces through the definer restore lookup;
 * owner-only restore inside the window; and the replica-mode purge that hard-
 * deletes past the grace period — bypassing the immutability guards (here
 * analytics_events) that otherwise fire on the cascade and block the delete.
 * Soft-delete columns + request/cancel RPCs live in 0002; purge + lookup in 0016.
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let ownerId: string;
let memberId: string;
let ws: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `wd-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `wd-member-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);

  ws = (await owner`select public.create_workspace('Doomed Co', ${uniqueSlug('doom')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId})
  `;
});

afterAll(async () => {
  await owner?.end();
  await member?.end();
  await admin?.end();
});

describe('request_workspace_deletion (owner-only soft delete + grace)', () => {
  it('a non-owner cannot request deletion', async () => {
    expect(
      await expectDenied(() => member`select public.request_workspace_deletion(${ws})`),
    ).toMatch(/only the workspace owner/);
  });

  it('the owner soft-deletes: sets deleted_at + a ~14-day purge_after, writes an audit row', async () => {
    await owner`select public.request_workspace_deletion(${ws})`;
    const [row] = await admin`
      select deleted_at, purge_after, deletion_requested_by from public.workspaces where id = ${ws}
    `;
    expect(row!.deleted_at).not.toBeNull();
    expect(row!.purge_after).not.toBeNull();
    expect(new Date(row!.purge_after as string).getTime()).toBeGreaterThan(Date.now());
    expect(row!.deletion_requested_by).toBe(ownerId);
    const [audit] = await admin`
      select 1 as ok from public.audit_log
      where workspace_id = ${ws} and action = 'workspace.deletion_requested'
    `;
    expect(audit?.ok).toBe(1);
  });

  it('the tenant vanishes from every member’s RLS view at once', async () => {
    // The tenancy helpers exclude soft-deleted workspaces (0002), so members and
    // the owner alike can no longer see the workspace through the JWT client.
    expect((await member`select count(*)::int as n from public.workspaces where id = ${ws}`)[0]!.n).toBe(0);
    expect((await owner`select count(*)::int as n from public.workspaces where id = ${ws}`)[0]!.n).toBe(0);
    // Spec data is hidden too — the tenancy helpers gate every table.
    expect((await member`select count(*)::int as n from public.products where workspace_id = ${ws}`)[0]!.n).toBe(0);
  });

  it('a second deletion request is rejected (already pending)', async () => {
    expect(
      await expectDenied(() => owner`select public.request_workspace_deletion(${ws})`),
    ).toMatch(/already pending deletion/);
  });
});

describe('get_pending_workspace_deletion (restore affordance, RLS-hidden tenant)', () => {
  it('surfaces the pending workspace to the owner with their role', async () => {
    const [row] = await owner`select * from public.get_pending_workspace_deletion()`;
    expect(row!.id).toBe(ws);
    expect(row!.role).toBe('owner');
    expect(row!.purge_after).not.toBeNull();
  });

  it('surfaces it to a plain member too (so they see the countdown), as their role', async () => {
    const [row] = await member`select * from public.get_pending_workspace_deletion()`;
    expect(row!.id).toBe(ws);
    expect(row!.role).toBe('member');
  });
});

describe('cancel_workspace_deletion (owner-only restore in-window)', () => {
  it('a non-owner cannot cancel', async () => {
    expect(
      await expectDenied(() => member`select public.cancel_workspace_deletion(${ws})`),
    ).toMatch(/only the workspace owner/);
  });

  it('the owner restores: deleted_at clears and the tenant is visible again', async () => {
    await owner`select public.cancel_workspace_deletion(${ws})`;
    const [row] = await admin`select deleted_at, purge_after from public.workspaces where id = ${ws}`;
    expect(row!.deleted_at).toBeNull();
    expect(row!.purge_after).toBeNull();
    expect((await member`select count(*)::int as n from public.workspaces where id = ${ws}`)[0]!.n).toBe(1);
  });
});

describe('purge_deleted_workspaces (replica-mode hard delete past grace)', () => {
  let doomed: string;
  let inGrace: string;

  beforeAll(async () => {
    // A workspace whose grace has expired, carrying an immutable analytics_events
    // row — its no_delete guard fires on the cascade, so a plain DELETE is blocked.
    doomed = (await owner`select public.create_workspace('Expired', ${uniqueSlug('exp')}) as id`)[0]!
      .id as string;
    await owner`select public.request_workspace_deletion(${doomed})`;
    await admin`update public.workspaces set purge_after = now() - interval '1 day' where id = ${doomed}`;
    await admin`
      insert into public.analytics_events (workspace_id, event_type)
      values (${doomed}, 'document_viewed')
    `;

    // A second soft-deleted workspace still inside its grace window — must survive.
    inGrace = (await owner`select public.create_workspace('Recent', ${uniqueSlug('rec')}) as id`)[0]!
      .id as string;
    await owner`select public.request_workspace_deletion(${inGrace})`;
  });

  it('a plain delete is blocked by the guard triggers (why the purge needs replica role)', async () => {
    // The owner-row rule and the immutability/archive guards fire on the cascade;
    // any one of them blocks a naive DELETE. The purge neutralises them all.
    expect(
      await expectDenied(() => admin`delete from public.workspaces where id = ${doomed}`),
    ).toMatch(/owner cannot be removed|immutable and cannot be|archive it instead/);
  });

  it('authenticated clients cannot invoke the purge (service-role only)', async () => {
    expect(
      await expectDenied(() => owner`select public.purge_deleted_workspaces()`),
    ).toMatch(/permission denied/);
  });

  it('purges past-grace workspaces (guards bypassed under replica) and leaves in-grace ones', async () => {
    const purged = (await admin`select public.purge_deleted_workspaces() as n`)[0]!.n;
    expect(Number(purged)).toBeGreaterThanOrEqual(1);

    expect((await admin`select count(*)::int as n from public.workspaces where id = ${doomed}`)[0]!.n).toBe(0);
    // The explicit per-table delete reached the immutable child and the members.
    expect(
      (await admin`select count(*)::int as n from public.analytics_events where workspace_id = ${doomed}`)[0]!.n,
    ).toBe(0);
    expect(
      (await admin`select count(*)::int as n from public.workspace_members where workspace_id = ${doomed}`)[0]!.n,
    ).toBe(0);
    // The in-grace workspace is untouched.
    expect((await admin`select count(*)::int as n from public.workspaces where id = ${inGrace}`)[0]!.n).toBe(1);
  });
});
