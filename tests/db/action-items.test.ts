import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G6.5 probes — `dashboard_action_items` (0006): the personal action queue the
 * propagation engine (G6.2) writes and the Dashboard reads. Locks the 0006 RLS:
 *   • members read their workspace's items; strangers see none (cross-tenant);
 *   • a non-member cannot write into a workspace's queue (with-check);
 *   • an editor resolves an item (status pending -> resolved).
 * The "personal" scoping (assigned_to == me) is an app-level filter on top of the
 * member-read policy and is covered by the @arther/types unit tests.
 */

let admin: Sql;
let alice: Sql;
let bob: Sql;
let aliceId: string;
let w1: string;
let itemId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  aliceId = await createAuthUser(admin, `dai-alice-${run}@example.com`);
  const bobId = await createAuthUser(admin, `dai-bob-${run}@example.com`);
  alice = await userClient(aliceId);
  bob = await userClient(bobId);

  w1 = (await alice`select public.create_workspace('Queue', ${uniqueSlug('dai')}) as id`)[0]!
    .id as string;
  await bob`select public.create_workspace('Elsewhere', ${uniqueSlug('daix')})`;

  // The propagation engine writes these as the service role (admin bypasses RLS).
  itemId = (
    await admin`
      insert into public.dashboard_action_items
        (workspace_id, type, assigned_to, reference_id, title, context)
      values (${w1}, 'section_review', ${aliceId}, ${crypto.randomUUID()},
              'Electrical Characteristics — Industrial Servo A', 'Rated Voltage changed: 36 V → 48 V')
      returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await alice?.end();
  await bob?.end();
  await admin?.end();
});

describe('dashboard_action_items (G6.5)', () => {
  it('a workspace member reads their queue; a stranger sees none', async () => {
    expect(
      await alice`select id from public.dashboard_action_items where workspace_id = ${w1}`,
    ).toHaveLength(1);
    expect(
      await bob`select id from public.dashboard_action_items where workspace_id = ${w1}`,
    ).toHaveLength(0);
  });

  it('a non-member cannot write into another workspace’s queue', async () => {
    const msg = await expectDenied(
      () =>
        bob`insert into public.dashboard_action_items (workspace_id, type, assigned_to, reference_id, title)
            values (${w1}, 'section_review', ${aliceId}, ${crypto.randomUUID()}, 'Injected')`,
    );
    expect(msg).toBeTruthy();
  });

  it('an editor resolves an item (status -> resolved)', async () => {
    await alice`update public.dashboard_action_items set status = 'resolved' where id = ${itemId}`;
    const rows = await alice`select status from public.dashboard_action_items where id = ${itemId}`;
    expect(rows[0]!.status).toBe('resolved');
  });
});
