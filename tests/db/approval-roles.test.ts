import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G0.3 probes — approval roles (migration 0004 `document_type_approval_roles` /
 * `approval_role_assignments`). These are a Settings surface: every member
 * READS, owner/admin WRITE. Roles live on a workspace Document Type — the
 * `dtar_write` policy requires `workspace_id is not null`, so a built-in's roles
 * are read-only (you fork first). Assignments are unique per (role, member) and
 * strangers see nothing.
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let strangerId: string;
let ws: string;
let typeId: string;
let builtInTypeId: string;
let roleId: string;
let memberMembershipId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `appr-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `appr-member-${run}@example.com`);
  strangerId = await createAuthUser(admin, `appr-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Approvers', ${uniqueSlug('ap')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('apx')})`;

  memberMembershipId = (
    await owner`
      select id from public.workspace_members where workspace_id = ${ws} and user_id = ${memberId}
    `
  )[0]!.id as string;

  // A workspace Document Type (editable) + a global built-in (read-only roles).
  typeId = (
    await owner`
      insert into public.document_types (workspace_id, name, built_in, created_by, updated_by)
      values (${ws}, 'Test Report', false, ${ownerId}, ${ownerId}) returning id
    `
  )[0]!.id as string;
  builtInTypeId = (
    await admin`select id from public.document_types where built_in = true limit 1`
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await member?.end();
  await stranger?.end();
  await admin?.end();
});

describe('approval roles (G0.3)', () => {
  it('an owner adds an approval role to a workspace document type', async () => {
    roleId = (
      await owner`
        insert into public.document_type_approval_roles
          (workspace_id, document_type_id, role_label, required, display_order, created_by, updated_by)
        values (${ws}, ${typeId}, 'Engineering', true, 1, ${ownerId}, ${ownerId})
        returning id
      `
    )[0]!.id as string;
    expect(roleId).toBeTruthy();
  });

  it('built-in roles are read-only — a workspace_id-null role insert is denied', async () => {
    await expectDenied(
      () => owner`
        insert into public.document_type_approval_roles
          (workspace_id, document_type_id, role_label, required, display_order)
        values (null, ${builtInTypeId}, 'Sneaky', true, 1)
      `,
    );
  });

  it('a member can READ a role but cannot WRITE one (admin-gated)', async () => {
    const read = await member`
      select role_label from public.document_type_approval_roles where document_type_id = ${typeId}
    `;
    expect(read).toHaveLength(1);
    await expectDenied(
      () => member`
        insert into public.document_type_approval_roles
          (workspace_id, document_type_id, role_label, required, display_order, created_by, updated_by)
        values (${ws}, ${typeId}, 'Compliance', true, 2, ${memberId}, ${memberId})
      `,
    );
  });

  it('an owner assigns a member to a role; a member can read it but not write one', async () => {
    await owner`
      insert into public.approval_role_assignments (workspace_id, role_id, workspace_member_id, assigned_by)
      values (${ws}, ${roleId}, ${memberMembershipId}, ${ownerId})
    `;
    const read = await member`
      select workspace_member_id from public.approval_role_assignments where role_id = ${roleId}
    `;
    expect(read).toHaveLength(1);
    await expectDenied(
      () => member`
        insert into public.approval_role_assignments (workspace_id, role_id, workspace_member_id, assigned_by)
        values (${ws}, ${roleId}, ${memberMembershipId}, ${memberId})
      `,
    );
  });

  it('one assignment per (role, member) — a duplicate is rejected', async () => {
    await expectDenied(
      () => owner`
        insert into public.approval_role_assignments (workspace_id, role_id, workspace_member_id, assigned_by)
        values (${ws}, ${roleId}, ${memberMembershipId}, ${ownerId})
      `,
    );
  });

  it('strangers can neither read nor write another workspace’s roles or assignments', async () => {
    const roles = await stranger`
      select 1 from public.document_type_approval_roles where document_type_id = ${typeId}
    `;
    expect(roles).toHaveLength(0);
    const assigns = await stranger`
      select 1 from public.approval_role_assignments where role_id = ${roleId}
    `;
    expect(assigns).toHaveLength(0);
    await expectDenied(
      () => stranger`
        insert into public.document_type_approval_roles
          (workspace_id, document_type_id, role_label, required, display_order)
        values (${ws}, ${typeId}, 'Intruder', true, 9)
      `,
    );
  });
});
