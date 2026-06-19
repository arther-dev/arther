import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * H.4 — seat tracking (billing spec §6). The post-launch billing UI needs two
 * things from day one, and this probe proves the schema already records them:
 *   - seat counts: Editor seats (owner/admin/member, paid) vs Viewer seats
 *     (free) are derivable from `workspace_members.role`;
 *   - role→seat timestamps: a role change that crosses the Editor/Viewer boundary
 *     is timestamped (and attributed) via the 0002 `set_updated_at` trigger, so
 *     billing can prorate.
 * Seat data is RLS-scoped to the workspace — a foreign tenant counts zero.
 */

let admin: Sql;
let owner: Sql;
let stranger: Sql;
let ownerId: string;
let ws: string;
let demotableMemberId: string; // the workspace_members.id we will demote to viewer

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `seat-owner-${run}@example.com`);
  const adminUserId = await createAuthUser(admin, `seat-admin-${run}@example.com`);
  const member1Id = await createAuthUser(admin, `seat-m1-${run}@example.com`);
  const member2Id = await createAuthUser(admin, `seat-m2-${run}@example.com`);
  const viewer1Id = await createAuthUser(admin, `seat-v1-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `seat-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Seats Co', ${uniqueSlug('seat')}) as id`)[0]!
    .id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('seatx')})`;

  // Owner adds: 1 admin + 2 members (all Editor seats) + 1 viewer (free seat).
  // With the owner that is 4 Editor seats and 1 Viewer seat.
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values
      (${ws}, ${adminUserId}, 'admin',  ${ownerId}),
      (${ws}, ${member1Id},   'member', ${ownerId}),
      (${ws}, ${member2Id},   'member', ${ownerId}),
      (${ws}, ${viewer1Id},   'viewer', ${ownerId})
  `;
  demotableMemberId = (
    await owner`select id from public.workspace_members where workspace_id = ${ws} and user_id = ${member2Id}`
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await stranger?.end();
  await admin?.end();
});

describe('seat counts (H.4 — billing spec §6 seat-count tracking)', () => {
  it('Editor seats (owner/admin/member) and Viewer seats are derivable from role', async () => {
    const tiers = await owner`
      select
        count(*) filter (where role in ('owner','admin','member'))::int as editor_seats,
        count(*) filter (where role = 'viewer')::int as viewer_seats,
        count(*)::int as total
      from public.workspace_members
      where workspace_id = ${ws}
    `;
    expect({
      editorSeats: tiers[0]!.editor_seats,
      viewerSeats: tiers[0]!.viewer_seats,
      total: tiers[0]!.total,
    }).toEqual({ editorSeats: 4, viewerSeats: 1, total: 5 });
  });
});

describe('role→seat timestamps (H.4 — proration)', () => {
  it('a role change across the Editor/Viewer boundary is timestamped and attributed', async () => {
    const before = (
      await owner`select role, joined_at, updated_at from public.workspace_members where id = ${demotableMemberId}`
    )[0]!;
    expect(before.role).toBe('member'); // an Editor seat

    // Demote the member to a Viewer (free) seat — a billable seat change.
    await owner`
      update public.workspace_members set role = 'viewer', updated_by = ${ownerId}
      where id = ${demotableMemberId}
    `;

    const after = (
      await owner`
        select role, updated_by, joined_at, updated_at,
          (updated_at > joined_at) as bumped,
          (now() - updated_at < interval '5 minutes') as recent
        from public.workspace_members where id = ${demotableMemberId}
      `
    )[0]!;
    expect(after.role).toBe('viewer'); // now a free seat
    expect(after.updated_by).toBe(ownerId); // attributed to who changed it
    expect(after.recent).toBe(true); // the transition timestamp tracks the change
    expect(after.bumped).toBe(true); // and advanced past the join time
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at as string).getTime(),
    );

    // The seat mix flipped: 3 Editor seats, 2 Viewer seats.
    const tiers = await owner`
      select
        count(*) filter (where role in ('owner','admin','member'))::int as editor_seats,
        count(*) filter (where role = 'viewer')::int as viewer_seats
      from public.workspace_members where workspace_id = ${ws}
    `;
    expect(tiers[0]!.editor_seats).toBe(3);
    expect(tiers[0]!.viewer_seats).toBe(2);
  });
});

describe('seat data is tenant-isolated (H.4 + RLS)', () => {
  it('a member of another workspace counts zero seats here', async () => {
    const rows = await stranger`
      select count(*)::int as n from public.workspace_members where workspace_id = ${ws}
    `;
    expect(rows[0]!.n).toBe(0);
  });
});
