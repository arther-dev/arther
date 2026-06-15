import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0017 probes — Document Type forking + archive-when-referenced (G0.1):
 * fork_document_type() copies a built-in's type row + section schema + approval
 * roles into the workspace as an editable copy under the caller's admin RLS;
 * built-ins stay read-only to clients; archive-when-referenced blocks the delete
 * of a type with documents generated from it; tenants stay isolated.
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
let datasheetSections: number;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `dt-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `dt-member-${run}@example.com`);
  strangerId = await createAuthUser(admin, `dt-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Typespace', ${uniqueSlug('dt')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('dt-else')})`;

  // The built-in Datasheet (workspace_id null) is the canonical fork source.
  const ds = (
    await admin`
      select dt.id,
             (select count(*) from public.document_type_sections s where s.document_type_id = dt.id) as n
      from public.document_types dt
      where dt.workspace_id is null and dt.name = 'Datasheet'
    `
  )[0]!;
  datasheetId = ds.id as string;
  datasheetSections = Number(ds.n);
});

afterAll(async () => {
  await Promise.all([admin?.end(), owner?.end(), member?.end(), stranger?.end()]);
});

describe('0017 fork_document_type', () => {
  it('forks a built-in into an editable workspace copy with its full section schema', async () => {
    const newId = (
      await owner`select public.fork_document_type(${datasheetId}, ${ws}) as id`
    )[0]!.id as string;

    const copy = (
      await owner`
        select workspace_id, name, built_in, forked_from from public.document_types where id = ${newId}
      `
    )[0]!;
    expect(copy.workspace_id).toBe(ws);
    expect(copy.name).toBe('Datasheet');
    expect(copy.built_in).toBe(false);
    expect(copy.forked_from).toBe(datasheetId);

    const sections = await owner`
      select name, display_order, workspace_id
      from public.document_type_sections where document_type_id = ${newId} order by display_order
    `;
    expect(sections).toHaveLength(datasheetSections);
    // Sections mirror into the workspace (the 0004 mirror convention) and keep order.
    expect(sections.every((s) => s.workspace_id === ws)).toBe(true);
    expect(sections[0]!.display_order).toBe(1);
  });

  it('copies approval roles when forking a type that has them', async () => {
    const a = (await owner`select public.fork_document_type(${datasheetId}, ${ws}) as id`)[0]!
      .id as string;
    await owner`
      insert into public.document_type_approval_roles
        (workspace_id, document_type_id, role_label, required, display_order, created_by)
      values (${ws}, ${a}, 'Engineering', true, 0, ${ownerId})
    `;
    const b = (await owner`select public.fork_document_type(${a}, ${ws}) as id`)[0]!.id as string;
    const roles = await owner`
      select role_label, required from public.document_type_approval_roles where document_type_id = ${b}
    `;
    expect(roles).toEqual([{ role_label: 'Engineering', required: true }]);
  });

  it('rejects a fork by a non-admin (the admin write policy gates it)', async () => {
    const msg = await expectDenied(
      () => member`select public.fork_document_type(${datasheetId}, ${ws})`,
    );
    expect(msg).toMatch(/row-level security|policy|denied|permission/i);
  });
});

describe('0017 built-ins stay read-only; tenants isolated', () => {
  it('blocks a client from editing a built-in document type', async () => {
    const msg = await expectDenied(
      () => owner`update public.document_types set name = 'Hacked' where id = ${datasheetId}`,
    );
    expect(msg).toMatch(/row-level security|policy|denied|permission/i);
  });

  it("hides another workspace's document type from a stranger", async () => {
    const newId = (await owner`select public.fork_document_type(${datasheetId}, ${ws}) as id`)[0]!
      .id as string;
    const rows = await stranger`select id from public.document_types where id = ${newId}`;
    expect(rows).toHaveLength(0);
  });
});

describe('0017 archive-when-referenced delete guard', () => {
  it('blocks deleting a document type that has documents, with a friendly message', async () => {
    const typeId = (await owner`select public.fork_document_type(${datasheetId}, ${ws}) as id`)[0]!
      .id as string;
    const productId = (
      await owner`
        insert into public.products (workspace_id, name, created_by)
        values (${ws}, 'Sensor S1', ${ownerId}) returning id
      `
    )[0]!.id as string;
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, created_by)
      values (${ws}, ${productId}, ${typeId}, 'Sensor S1 Datasheet', 'sensor-s1-datasheet', ${ownerId})
    `;

    const msg = await expectDenied(
      () => owner`delete from public.document_types where id = ${typeId}`,
    );
    expect(msg).toMatch(/archive it instead of deleting/i);
  });

  it('allows deleting an unreferenced workspace document type', async () => {
    const typeId = (await owner`select public.fork_document_type(${datasheetId}, ${ws}) as id`)[0]!
      .id as string;
    await owner`delete from public.document_types where id = ${typeId}`;
    const rows = await admin`select id from public.document_types where id = ${typeId}`;
    expect(rows).toHaveLength(0);
  });
});
