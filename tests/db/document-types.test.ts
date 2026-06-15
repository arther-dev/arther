import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0004 + 0017 probes — Document Types (G0.1):
 *  - the five built-ins are global (workspace_id null) and readable by any member;
 *  - Document Types are an admin surface: owners/admins write, members can't;
 *  - built-ins are forkable-not-editable — a write to a null-workspace row is
 *    RLS-filtered, and fork_document_type() clones type + sections + approval
 *    roles into an editable workspace copy under the caller's own RLS;
 *  - cross-tenant isolation holds for workspace types.
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let strangerId: string;
let ws: string;
let datasheetId: string;
let datasheetSectionCount: number;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `dt-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `dt-member-${run}@example.com`);
  strangerId = await createAuthUser(admin, `dt-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Doctypes', ${uniqueSlug('dt')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('else')})`;

  const ds = await owner`
    select id from public.document_types where built_in and name = 'Datasheet' limit 1
  `;
  datasheetId = ds[0]!.id as string;
  datasheetSectionCount = Number(
    (await owner`select count(*)::int as n from public.document_type_sections where document_type_id = ${datasheetId}`)[0]!.n,
  );
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), member.end(), stranger.end()]);
});

describe('document types (0004 / 0017)', () => {
  it('seeds five global built-ins readable by any member', async () => {
    const seen = await member`
      select name from public.document_types where built_in and workspace_id is null order by name
    `;
    expect(seen.map((r) => r.name as string)).toEqual([
      'Datasheet',
      'Declaration of Conformity',
      'Installation Manual',
      'Quick Start',
      'User Guide',
    ]);
    expect(datasheetSectionCount).toBeGreaterThan(0);
  });

  it('lets an owner create a workspace document type', async () => {
    const rows = await owner`
      insert into public.document_types (workspace_id, name, description, built_in, created_by)
      values (${ws}, 'Internal Spec', 'house format', false, ${ownerId})
      returning id, built_in
    `;
    expect(rows[0]!.built_in).toBe(false);
  });

  it('denies a non-admin member writing document types', async () => {
    const msg = await expectDenied(
      () => member`
        insert into public.document_types (workspace_id, name, built_in, created_by)
        values (${ws}, 'Sneaky', false, ${memberId})
      `,
    );
    expect(msg).toMatch(/row-level security|violates/i);
  });

  it('treats built-ins as forkable-not-editable (write is RLS-filtered)', async () => {
    // The update matches zero rows: the write policy's USING clause requires a
    // non-null workspace_id, so a null-keyed built-in is invisible to mutation.
    await owner`update public.document_types set name = 'Hacked' where id = ${datasheetId}`;
    const after = await owner`select name from public.document_types where id = ${datasheetId}`;
    expect(after[0]!.name).toBe('Datasheet');
  });

  it('forks a built-in into an editable copy with its sections', async () => {
    const newId = (await owner`select public.fork_document_type(${datasheetId}, ${ws}) as id`)[0]!
      .id as string;
    const copy = await owner`
      select workspace_id, built_in, forked_from from public.document_types where id = ${newId}
    `;
    expect(copy[0]!.workspace_id).toBe(ws);
    expect(copy[0]!.built_in).toBe(false);
    expect(copy[0]!.forked_from).toBe(datasheetId);

    const sectionCount = Number(
      (await owner`select count(*)::int as n from public.document_type_sections where document_type_id = ${newId}`)[0]!.n,
    );
    expect(sectionCount).toBe(datasheetSectionCount);

    // The copy is a real workspace type — the owner can now edit it.
    await owner`update public.document_types set name = 'My Datasheet' where id = ${newId}`;
    const edited = await owner`select name from public.document_types where id = ${newId}`;
    expect(edited[0]!.name).toBe('My Datasheet');
  });

  it('fork copies the approval roles too', async () => {
    const srcId = (await owner`
      insert into public.document_types (workspace_id, name, built_in, created_by)
      values (${ws}, 'With Roles', false, ${ownerId}) returning id
    `)[0]!.id as string;
    await owner`
      insert into public.document_type_sections (workspace_id, document_type_id, name, display_order, created_by)
      values (${ws}, ${srcId}, 'Overview', 1, ${ownerId})
    `;
    await owner`
      insert into public.document_type_approval_roles (workspace_id, document_type_id, role_label, required, created_by)
      values (${ws}, ${srcId}, 'Compliance Lead', true, ${ownerId})
    `;

    const forkId = (await owner`select public.fork_document_type(${srcId}, ${ws}) as id`)[0]!
      .id as string;
    const roles = await owner`
      select role_label, required from public.document_type_approval_roles where document_type_id = ${forkId}
    `;
    expect(roles).toHaveLength(1);
    expect(roles[0]!.role_label).toBe('Compliance Lead');
    expect(roles[0]!.required).toBe(true);
  });

  it('denies a member forking (the copy insert fails the admin with-check)', async () => {
    const msg = await expectDenied(
      () => member`select public.fork_document_type(${datasheetId}, ${ws})`,
    );
    expect(msg).toMatch(/row-level security|violates/i);
  });

  it('hides a workspace type from another tenant', async () => {
    const seen = await stranger`
      select id from public.document_types where workspace_id = ${ws}
    `;
    expect(seen).toHaveLength(0);
  });

  it('archives only via an admin (member archive is RLS-filtered)', async () => {
    const id = (await owner`
      insert into public.document_types (workspace_id, name, built_in, created_by)
      values (${ws}, 'Archivable', false, ${ownerId}) returning id
    `)[0]!.id as string;

    // Member's update touches zero rows (write policy requires owner/admin).
    await member`update public.document_types set archived_at = now() where id = ${id}`;
    const stillActive = await owner`select archived_at from public.document_types where id = ${id}`;
    expect(stillActive[0]!.archived_at).toBeNull();

    await owner`update public.document_types set archived_at = now() where id = ${id}`;
    const archived = await owner`select archived_at from public.document_types where id = ${id}`;
    expect(archived[0]!.archived_at).not.toBeNull();
  });
});
