import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G0.5 Document Quality Standards probes — the 0004 table + RLS underpinning the
 * admin surface: owner/admin write, member/viewer read-only, the
 * `document_types.quality_standard_id` FK that blocks deleting a referenced
 * standard (the "can't delete while referenced" rule, DB-enforced and surfaced
 * by @arther/db as blocked: 'referenced'), and cross-tenant isolation.
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
  ownerId = await createAuthUser(admin, `qs-owner-${run}@example.com`);
  adminMemberId = await createAuthUser(admin, `qs-admin-${run}@example.com`);
  memberId = await createAuthUser(admin, `qs-member-${run}@example.com`);
  viewerId = await createAuthUser(admin, `qs-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `qs-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  adminMember = await userClient(adminMemberId);
  member = await userClient(memberId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (
    await owner`select public.create_workspace('Qualityspace', ${uniqueSlug('qual')}) as id`
  )[0]!.id as string;
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

describe('document quality standards RLS (0004)', () => {
  it('an admin can create a standard and every member can read it', async () => {
    const id = (
      await adminMember`
        insert into public.document_quality_standards (workspace_id, name, created_by)
        values (${ws}, 'House discipline', ${adminMemberId}) returning id
      `
    )[0]!.id as string;

    for (const client of [owner, adminMember, member, viewer]) {
      const rows = await client`select id from public.document_quality_standards where id = ${id}`;
      expect(rows.length).toBe(1);
    }
  });

  it('a member cannot create a standard', async () => {
    const message = await expectDenied(
      () =>
        member`insert into public.document_quality_standards (workspace_id, name) values (${ws}, 'Sneaky')`,
    );
    expect(message).toMatch(/row-level security|denied|policy/i);
  });

  it('a viewer cannot create a standard', async () => {
    await expectDenied(
      () =>
        viewer`insert into public.document_quality_standards (workspace_id, name) values (${ws}, 'Nope')`,
    );
  });

  it('blocks deleting a standard while a document type references it', async () => {
    const standardId = (
      await owner`
        insert into public.document_quality_standards (workspace_id, name, created_by)
        values (${ws}, 'Referenced', ${ownerId}) returning id
      `
    )[0]!.id as string;
    await owner`
      insert into public.document_types (workspace_id, name, quality_standard_id, created_by)
      values (${ws}, 'Datasheet', ${standardId}, ${ownerId})
    `;

    // The 0004 FK (NO ACTION) raises a foreign-key violation (SQLSTATE 23503).
    const message = await expectDenied(
      () => owner`delete from public.document_quality_standards where id = ${standardId}`,
    );
    expect(message).toMatch(/foreign key|violates|still referenced/i);

    // Clearing the reference lets the delete through.
    await owner`update public.document_types set quality_standard_id = null where quality_standard_id = ${standardId}`;
    await owner`delete from public.document_quality_standards where id = ${standardId}`;
    const rows = await owner`select id from public.document_quality_standards where id = ${standardId}`;
    expect(rows.length).toBe(0);
  });

  it('a stranger in another tenant can neither read nor write the workspace standards', async () => {
    const rows =
      await stranger`select id from public.document_quality_standards where workspace_id = ${ws}`;
    expect(rows.length).toBe(0);
    await expectDenied(
      () =>
        stranger`insert into public.document_quality_standards (workspace_id, name) values (${ws}, 'Intruder')`,
    );
  });
});
