import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0014 probes — membership governance (F4.2/F4.3/F4.4):
 * exactly one owner per workspace at the row level (admins cannot mint
 * owners — the 0002 policy alone allowed it), atomic ownership transfer,
 * and invitee-facing invitation RPCs (lookup + accept with email/expiry/
 * revocation checks).
 */

let admin: Sql;
let owner: Sql;
let adminUser: Sql;
let invitee: Sql;
let ownerId: string;
let adminUserId: string;
let inviteeId: string;
let inviteeEmail: string;
let ws: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `mg-owner-${run}@example.com`);
  adminUserId = await createAuthUser(admin, `mg-admin-${run}@example.com`);
  inviteeEmail = `mg-invitee-${run}@example.com`;
  inviteeId = await createAuthUser(admin, inviteeEmail);
  owner = await userClient(ownerId);
  adminUser = await userClient(adminUserId);
  invitee = await userClient(inviteeId);

  ws = (await owner`select public.create_workspace('Governed', ${uniqueSlug('gov')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${adminUserId}, 'admin', ${ownerId})
  `;
});

afterAll(async () => {
  await owner?.end();
  await adminUser?.end();
  await invitee?.end();
  await admin?.end();
});

describe('owner-row governance (0014 trigger)', () => {
  it('an admin cannot mint a second owner (the 0002 policy gap)', async () => {
    expect(
      await expectDenied(
        () => adminUser`
          insert into public.workspace_members (workspace_id, user_id, role, invited_by)
          values (${ws}, ${adminUserId}, 'owner', ${adminUserId})
        `,
      ),
    ).toMatch(/already has an owner|duplicate key/);
    // Self-promotion via UPDATE is equally blocked.
    expect(
      await expectDenied(
        () => adminUser`
          update public.workspace_members set role = 'owner'
          where workspace_id = ${ws} and user_id = ${adminUserId}
        `,
      ),
    ).toMatch(/only through transfer_workspace_ownership/);
  });

  it('the owner cannot be demoted or removed outside a transfer', async () => {
    expect(
      await expectDenied(
        () => adminUser`
          update public.workspace_members set role = 'member'
          where workspace_id = ${ws} and user_id = ${ownerId}
        `,
      ),
    ).toMatch(/transfer ownership before changing/);
    expect(
      await expectDenied(
        () => adminUser`
          delete from public.workspace_members
          where workspace_id = ${ws} and user_id = ${ownerId}
        `,
      ),
    ).toMatch(/owner cannot be removed/);
  });

  it('transfer_workspace_ownership: owner-only, atomic, exactly one owner after', async () => {
    // A non-owner cannot transfer.
    await expectDenied(
      () => adminUser`select public.transfer_workspace_ownership(${ws}, ${adminUserId})`,
    );

    await owner`select public.transfer_workspace_ownership(${ws}, ${adminUserId})`;

    const roles = await admin`
      select user_id, role from public.workspace_members where workspace_id = ${ws}
    `;
    const byUser = new Map(roles.map((r) => [r.user_id as string, r.role as string]));
    expect(byUser.get(adminUserId)).toBe('owner');
    expect(byUser.get(ownerId)).toBe('admin');
    expect([...byUser.values()].filter((r) => r === 'owner')).toHaveLength(1);

    const wsRow = await admin`select owner_id from public.workspaces where id = ${ws}`;
    expect(wsRow[0]!.owner_id).toBe(adminUserId);

    // Transfer back so the rest of the suite keeps its assumptions.
    await adminUser`select public.transfer_workspace_ownership(${ws}, ${ownerId})`;
  });
});

describe('invitations (F4.3 RPCs)', () => {
  let invitationId: string;

  it('an admin creates an invitation; the invitee can look it up despite RLS', async () => {
    invitationId = (
      await adminUser`
        insert into public.workspace_invitations (workspace_id, email, role, invited_by)
        values (${ws}, ${inviteeEmail}, 'member', ${adminUserId}) returning id
      `
    )[0]!.id as string;

    // Direct read is RLS-hidden from the non-member…
    const direct = await invitee`
      select 1 from public.workspace_invitations where id = ${invitationId}
    `;
    expect(direct).toHaveLength(0);
    // …but the definer lookup returns the minimal accept-page surface.
    const lookup = await invitee`
      select * from public.get_workspace_invitation(${invitationId})
    `;
    expect(lookup).toHaveLength(1);
    expect(lookup[0]!.workspace_name).toBe('Governed');
    expect(lookup[0]!.status).toBe('pending');
  });

  it('a user with a different email cannot accept', async () => {
    const otherId = await createAuthUser(admin, `mg-other-${crypto.randomUUID().slice(0, 8)}@example.com`);
    const other = await userClient(otherId);
    expect(
      await expectDenied(
        () => other`select public.accept_workspace_invitation(${invitationId})`,
      ),
    ).toMatch(/different email address/);
    await other.end();
  });

  it('the invited user accepts once; the membership lands with the invited role', async () => {
    await invitee`select public.accept_workspace_invitation(${invitationId})`;
    const member = await admin`
      select role from public.workspace_members
      where workspace_id = ${ws} and user_id = ${inviteeId}
    `;
    expect(member[0]!.role).toBe('member');

    expect(
      await expectDenied(
        () => invitee`select public.accept_workspace_invitation(${invitationId})`,
      ),
    ).toMatch(/already accepted/);
  });

  it('revoked and expired invitations cannot be accepted', async () => {
    const revoked = (
      await adminUser`
        insert into public.workspace_invitations (workspace_id, email, role, invited_by)
        values (${ws}, ${inviteeEmail}, 'member', ${adminUserId}) returning id
      `
    )[0]!.id as string;
    await adminUser`
      update public.workspace_invitations set revoked_at = now() where id = ${revoked}
    `;
    expect(
      await expectDenied(() => invitee`select public.accept_workspace_invitation(${revoked})`),
    ).toMatch(/revoked/);

    const expired = (
      await adminUser`
        insert into public.workspace_invitations (workspace_id, email, role, invited_by)
        values (${ws}, ${inviteeEmail}, 'member', ${adminUserId}) returning id
      `
    )[0]!.id as string;
    await admin`
      update public.workspace_invitations
         set expires_at = now() - interval '1 day' where id = ${expired}
    `;
    expect(
      await expectDenied(() => invitee`select public.accept_workspace_invitation(${expired})`),
    ).toMatch(/expired/);
    const status = await invitee`select status from public.get_workspace_invitation(${expired})`;
    expect(status[0]!.status).toBe('expired');
  });
});
