import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G8.2 probes — `analytics_events` (0011): the metering store the app writes
 * (document_generated / block_regenerated / spec_field_updated). Locks the 0011
 * invariants the emit relies on:
 *   • written by the service role only — no authenticated INSERT policy;
 *   • members read their workspace's events, strangers see none (cross-tenant);
 *   • append-only — update/delete are blocked even for the owner role.
 */

let admin: Sql;
let alice: Sql;
let bob: Sql;
let aliceId: string;
let w1: string;
let eventId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  aliceId = await createAuthUser(admin, `an-alice-${run}@example.com`);
  const bobId = await createAuthUser(admin, `an-bob-${run}@example.com`);
  alice = await userClient(aliceId);
  bob = await userClient(bobId);

  w1 = (await alice`select public.create_workspace('Analytics', ${uniqueSlug('an')}) as id`)[0]!
    .id as string;
  await bob`select public.create_workspace('Elsewhere', ${uniqueSlug('anx')})`;

  // Service-role write (admin bypasses RLS the way service_role does).
  eventId = (
    await admin`
      insert into public.analytics_events (workspace_id, event_type, actor_user_id, payload)
      values (${w1}, 'document_generated', ${aliceId}, ${JSON.stringify({ runId: 'r1' })}::jsonb)
      returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await alice?.end();
  await bob?.end();
  await admin?.end();
});

describe('analytics_events (G8.2)', () => {
  it('a workspace member reads their events; a stranger sees none', async () => {
    expect(await alice`select id from public.analytics_events where workspace_id = ${w1}`).toHaveLength(1);
    expect(await bob`select id from public.analytics_events where workspace_id = ${w1}`).toHaveLength(0);
  });

  it('authenticated users cannot insert — events come from the service role only', async () => {
    const msg = await expectDenied(
      () =>
        alice`insert into public.analytics_events (workspace_id, event_type) values (${w1}, 'spec_field_updated')`,
    );
    expect(msg).toBeTruthy();
  });

  it('is append-only — update and delete are blocked even for the owner role', async () => {
    await expectDenied(() => admin`update public.analytics_events set event_type = 'x' where id = ${eventId}`);
    await expectDenied(() => admin`delete from public.analytics_events where id = ${eventId}`);
  });
});
