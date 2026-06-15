import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0004 + 0017 probes — Document Types (G0.1/G0.2):
 * built-ins (workspace_id null) are globally readable but never editable;
 * fork_document_type() clones a built-in into an editable workspace copy
 * (row + sections + approval roles) atomically under the caller's RLS while
 * leaving the source canonical; writes are admin-gated; cross-workspace types
 * stay isolated.
 */

let admin: Sql;
let owner: Sql;
let viewer: Sql;
let stranger: Sql;
let ownerId: string;
let viewerId: string;
let strangerId: string;
let ws: string;
let datasheetId: string; // a seeded built-in

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `dt-owner-${run}@example.com`);
  viewerId = await createAuthUser(admin, `dt-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `dt-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Docspace', ${uniqueSlug('doc')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('else')})`;

  datasheetId = (
    await owner`
      select id from public.document_types
      where built_in and workspace_id is null and name = 'Datasheet' limit 1
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), viewer.end(), stranger.end()]);
});

describe('built-in document types', () => {
  it('seeds all five built-ins, globally readable', async () => {
    const rows = await viewer`
      select name from public.document_types where built_in and workspace_id is null
    `;
    const names = rows.map((r) => r.name as string);
    expect(names).toEqual(
      expect.arrayContaining([
        'Datasheet',
        'Installation Manual',
        'User Guide',
        'Quick Start',
        'Declaration of Conformity',
      ]),
    );
  });

  it('ships an ordered section schema (the generation contract)', async () => {
    const sections = await owner`
      select name, display_order, spec_field_categories, brief_required
      from public.document_type_sections
      where document_type_id = ${datasheetId} order by display_order
    `;
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0]!.display_order as number).toBeLessThanOrEqual(sections[1]!.display_order as number);
  });

  it('cannot be edited (built-ins are forked, not edited)', async () => {
    // The 0004 write policy's USING excludes workspace_id-null rows, so an UPDATE
    // simply matches zero rows (RLS filters it out) — the built-in is unchanged.
    await owner`update public.document_types set name = 'Hacked' where id = ${datasheetId}`;
    const [row] = await owner`select name from public.document_types where id = ${datasheetId}`;
    expect(row!.name).toBe('Datasheet');
  });
});

describe('fork_document_type()', () => {
  let forkId: string;

  it('clones the built-in into an editable workspace copy with its sections', async () => {
    forkId = (
      await owner`select public.fork_document_type(${datasheetId}, ${ws}) as id`
    )[0]!.id as string;

    const [fork] = await owner`
      select workspace_id, built_in, forked_from, name from public.document_types where id = ${forkId}
    `;
    expect(fork!.workspace_id).toBe(ws);
    expect(fork!.built_in).toBe(false);
    expect(fork!.forked_from).toBe(datasheetId);

    const srcCount = (
      await owner`select count(*)::int as n from public.document_type_sections where document_type_id = ${datasheetId}`
    )[0]!.n as number;
    const forkCount = (
      await owner`select count(*)::int as n from public.document_type_sections where document_type_id = ${forkId}`
    )[0]!.n as number;
    expect(forkCount).toBe(srcCount);

    // The fork's sections are scoped to the workspace (the editable copy).
    const wsScoped = (
      await owner`select count(*)::int as n from public.document_type_sections
                  where document_type_id = ${forkId} and workspace_id = ${ws}`
    )[0]!.n as number;
    expect(wsScoped).toBe(forkCount);
  });

  it('leaves the source built-in canonical', async () => {
    const [src] = await owner`
      select workspace_id, built_in from public.document_types where id = ${datasheetId}
    `;
    expect(src!.workspace_id).toBeNull();
    expect(src!.built_in).toBe(true);
  });

  it('the editable fork accepts section edits by an admin', async () => {
    const [section] = await owner`
      select id from public.document_type_sections where document_type_id = ${forkId} order by display_order limit 1
    `;
    await owner`
      update public.document_type_sections
      set spec_field_categories = '["Electrical","Thermal"]'::jsonb, brief_required = true
      where id = ${section!.id}
    `;
    const [updated] = await owner`
      select spec_field_categories, brief_required from public.document_type_sections where id = ${section!.id}
    `;
    expect(updated!.brief_required).toBe(true);
    expect(updated!.spec_field_categories).toEqual(['Electrical', 'Thermal']);
  });

  it('denies forking to a non-admin (the insert is admin-gated)', async () => {
    const msg = await expectDenied(
      () => viewer`select public.fork_document_type(${datasheetId}, ${ws})`,
    );
    expect(msg).toBeTruthy();
  });

  it('hides the workspace fork from a stranger in another workspace', async () => {
    const rows = await stranger`select id from public.document_types where id = ${forkId}`;
    expect(rows).toHaveLength(0);
    // …but the stranger still sees the global built-ins.
    const builtins = await stranger`select id from public.document_types where id = ${datasheetId}`;
    expect(builtins).toHaveLength(1);
  });
});

describe('document type write gating', () => {
  it('lets an admin create a workspace type from scratch', async () => {
    const [created] = await owner`
      insert into public.document_types (workspace_id, name, built_in, created_by)
      values (${ws}, 'Test Report', false, ${ownerId}) returning id
    `;
    expect(created!.id).toBeTruthy();
  });

  it('denies a viewer creating a workspace type', async () => {
    const msg = await expectDenied(
      () => viewer`
        insert into public.document_types (workspace_id, name, built_in, created_by)
        values (${ws}, 'Sneaky', false, ${viewerId})
      `,
    );
    expect(msg).toBeTruthy();
  });
});
