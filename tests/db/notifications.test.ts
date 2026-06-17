import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * C3 probes — the unified notification system (collaboration spec §9; schema in
 * 0007). Under test:
 *   - notifications are RECIPIENT-private: only the recipient reads them, and the
 *     dispatch writes them under the service role (no authenticated INSERT);
 *   - a recipient marks their own read; another member can't even see them;
 *   - preferences are self-managed (a member can't write another's).
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let ownerId: string;
let memberId: string;
let ws: string;
let memberMembershipId: string;
let ownerMembershipId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `nt-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `nt-member-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);

  ws = (await owner`select public.create_workspace('Notif Co', ${uniqueSlug('ntf')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId})
  `;
  memberMembershipId = (
    await admin`select id from public.workspace_members where workspace_id = ${ws} and user_id = ${memberId}`
  )[0]!.id as string;
  ownerMembershipId = (
    await admin`select id from public.workspace_members where workspace_id = ${ws} and user_id = ${ownerId}`
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await member?.end();
  await admin?.end();
});

describe('notifications are recipient-private (C3.1/C3.4)', () => {
  let notifId: string;

  it('the service role dispatches a notification (no authenticated INSERT)', async () => {
    notifId = (
      await admin`
        insert into public.notifications (workspace_id, recipient_id, event_type, payload)
        values (${ws}, ${memberId}, 'review_requested', ${admin.json({ documentTitle: 'Datasheet' })})
        returning id
      `
    )[0]!.id as string;
    expect(notifId).toBeTruthy();

    // A JWT client may not insert — the dispatch path is service-role only.
    await expectDenied(
      () => member`
        insert into public.notifications (workspace_id, recipient_id, event_type, payload)
        values (${ws}, ${memberId}, 'review_requested', '{}'::jsonb)
      `,
    );
  });

  it('only the recipient can read it', async () => {
    expect(await member`select id from public.notifications where id = ${notifId}`).toHaveLength(1);
    // The owner is a workspace admin but NOT the recipient — RLS hides it.
    expect(await owner`select id from public.notifications where id = ${notifId}`).toHaveLength(0);
  });

  it('the recipient marks their own read; a non-recipient cannot touch it', async () => {
    await member`update public.notifications set read_at = now() where id = ${notifId}`;
    expect(
      (await admin`select read_at from public.notifications where id = ${notifId}`)[0]!.read_at,
    ).not.toBeNull();

    // The owner's update matches no visible row (RLS) — a no-op, never another's.
    await owner`update public.notifications set read_at = null where id = ${notifId}`;
    expect(
      (await admin`select read_at from public.notifications where id = ${notifId}`)[0]!.read_at,
    ).not.toBeNull();
  });
});

describe('preferences are self-managed (C3.2)', () => {
  it('a member manages their own preference', async () => {
    await member`
      insert into public.notification_preferences (workspace_member_id, event_type, in_app_enabled, email_enabled)
      values (${memberMembershipId}, 'comment_added', true, false)
    `;
    expect(
      (await admin`select email_enabled from public.notification_preferences
        where workspace_member_id = ${memberMembershipId} and event_type = 'comment_added'`)[0]!.email_enabled,
    ).toBe(false);
  });

  it('a member cannot write another member’s preference', async () => {
    await expectDenied(
      () => member`
        insert into public.notification_preferences (workspace_member_id, event_type, in_app_enabled, email_enabled)
        values (${ownerMembershipId}, 'comment_added', false, false)
      `,
    );
  });
});
