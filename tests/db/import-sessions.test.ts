import { beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0015 probes — commit_import_session() (F7.6/F7.7):
 * the reviewed plan applies atomically (product → components → edges →
 * fields → values via 0012 → auto-release via 0013); a failing mutation
 * rolls the whole import back (no partial commit); sessions are editor-only
 * to create/commit, member-readable, and tenant-isolated.
 */

let admin: Sql;
let editor: Sql;
let viewer: Sql;
let stranger: Sql;
let editorId: string;
let viewerId: string;
let strangerId: string;
let ws: string;
let unitV: string;

function plan(unitId: string) {
  return [
    { kind: 'create_product', key: 'product', name: 'Imported Motor', description: 'From sheet' },
    { kind: 'create_component', key: 'c0.create', ckey: 'c0', name: 'Stator', componentType: 'part' },
    {
      kind: 'attach_component',
      key: 'c0.attach',
      ckey: 'c0',
      componentId: null,
      componentName: 'Stator',
      parentCkey: null,
      parentComponentId: null,
      quantity: 2,
    },
    {
      kind: 'create_component',
      key: 'c1.create',
      ckey: 'c1',
      name: 'Winding',
      componentType: 'part',
    },
    {
      // Nested under Stator: parent resolves to the Stator EDGE in this product.
      kind: 'attach_component',
      key: 'c1.attach',
      ckey: 'c1',
      componentId: null,
      componentName: 'Winding',
      parentCkey: 'c0',
      parentComponentId: null,
      quantity: 4,
    },
    {
      kind: 'create_field',
      key: 'p.f0',
      owner: { kind: 'product' },
      name: 'Rated Voltage',
      fieldType: 'scalar',
      category: 'Electrical',
      unitId,
      options: null,
      conditions: null,
      value: { value: 24, unit_id: unitId },
    },
    {
      kind: 'create_field',
      key: 'c0.f0',
      owner: { kind: 'component', ckey: 'c0', componentId: null },
      name: 'Winding Resistance',
      fieldType: 'scalar',
      category: 'Electrical',
      unitId,
      options: null,
      conditions: null,
      // Null value: the field is created but nothing is versioned.
      value: null,
    },
  ];
}

async function createSession(client: Sql, workspaceId: string, mutations: unknown): Promise<string> {
  const rows = await client`
    insert into public.import_sessions
      (workspace_id, status, source_filename, proposed_mutations, created_by)
    values
      (${workspaceId}, 'proposed', 'MotorSpec_v2.1.xlsx', ${client.json(mutations as never)},
       (select auth.uid()))
    returning id
  `;
  return rows[0]!.id as string;
}

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `imp-editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `imp-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `imp-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Impspace', ${uniqueSlug('imp')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${editorId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('ielse')})`;

  unitV = (await admin`select id from public.units where symbol = 'V' limit 1`)[0]!.id as string;
});

describe('commit_import_session', () => {
  it('applies the full plan atomically and auto-creates the import release', async () => {
    const sessionId = await createSession(editor, ws, plan(unitV));
    const productId = (
      await editor`select public.commit_import_session(${sessionId}) as id`
    )[0]!.id as string;

    const product = (
      await editor`select name, description from public.products where id = ${productId}`
    )[0]!;
    expect(product.name).toBe('Imported Motor');

    // Components attached with quantities; Winding nests under Stator's edge.
    const edges = await editor`
      select c.name, pc.quantity, pc.parent_component_id
        from public.product_components pc
        join public.components c on c.id = pc.component_id
       where pc.product_id = ${productId}
       order by c.name
    `;
    expect(edges).toHaveLength(2);
    expect(edges[0]!.name).toBe('Stator');
    expect(edges[0]!.quantity).toBe(2);
    expect(edges[0]!.parent_component_id).toBeNull();
    expect(edges[1]!.name).toBe('Winding');
    expect(edges[1]!.quantity).toBe(4);

    const statorEdge = (
      await editor`
        select pc.id from public.product_components pc
          join public.components c on c.id = pc.component_id
         where pc.product_id = ${productId} and c.name = 'Stator'
      `
    )[0]!.id as string;
    expect(edges[1]!.parent_component_id).toBe(statorEdge);

    // The valued field went through 0012: version row + moved pointer.
    const field = (
      await editor`
        select id, value, current_version_id from public.spec_fields
         where product_id = ${productId} and name = 'Rated Voltage'
      `
    )[0]!;
    expect(field.value).toEqual({ value: 24, unit_id: unitV });
    expect(field.current_version_id).not.toBeNull();
    const versions = await editor`
      select note from public.field_versions where field_id = ${field.id}
    `;
    expect(versions).toHaveLength(1);
    expect(versions[0]!.note).toContain('Imported from MotorSpec_v2.1.xlsx');

    // The null-valued field exists but has no version (nothing was entered).
    const unvalued = (
      await editor`
        select value, current_version_id from public.spec_fields
         where name = 'Winding Resistance' and workspace_id = ${ws}
      `
    )[0]!;
    expect(unvalued.value).toBeNull();
    expect(unvalued.current_version_id).toBeNull();

    // Import always creates a release pinning the one valued field (§6.2 step 5).
    const releases = await editor`
      select id, name, tag from public.product_releases where product_id = ${productId}
    `;
    expect(releases).toHaveLength(1);
    expect(releases[0]!.name).toContain('Imported from MotorSpec_v2.1.xlsx');
    expect(releases[0]!.tag).toMatch(/^import-/);
    const pinned = await editor`
      select count(*)::int as n from public.release_field_values where release_id = ${releases[0]!.id}
    `;
    expect(pinned[0]!.n).toBe(1);

    // Session stamped committed and pointed at the product.
    const session = (
      await editor`select status, committed_at, target_product_id from public.import_sessions where id = ${sessionId}`
    )[0]!;
    expect(session.status).toBe('committed');
    expect(session.committed_at).not.toBeNull();
    expect(session.target_product_id).toBe(productId);
  });

  it('re-import: set_value on an existing field appends a version, nothing else changes', async () => {
    const productId = (
      await editor`
        insert into public.products (workspace_id, name, created_by)
        values (${ws}, 'Reimport Target', ${editorId}) returning id
      `
    )[0]!.id as string;
    const fieldId = (
      await editor`
        insert into public.spec_fields (workspace_id, product_id, name, type, category, unit_id, created_by)
        values (${ws}, ${productId}, 'Speed', 'scalar', 'Performance', ${unitV}, ${editorId})
        returning id
      `
    )[0]!.id as string;
    await editor`select public.update_spec_field_value(${fieldId}, ${editor.json({ value: 1000, unit_id: unitV })}, 'Initial value')`;

    const sessionId = (
      await editor`
        insert into public.import_sessions
          (workspace_id, target_product_id, status, source_filename, proposed_mutations, created_by)
        values (${ws}, ${productId}, 'proposed', 'MotorSpec_v2.2.xlsx',
                ${editor.json([
                  {
                    kind: 'set_value',
                    key: 'p.f0',
                    fieldId,
                    newValue: { value: 1500, unit_id: unitV },
                  },
                ] as never)}, ${editorId})
        returning id
      `
    )[0]!.id as string;

    const returned = (
      await editor`select public.commit_import_session(${sessionId}) as id`
    )[0]!.id as string;
    expect(returned).toBe(productId);

    const versions = await editor`
      select value from public.field_versions where field_id = ${fieldId} order by changed_at
    `;
    expect(versions).toHaveLength(2);
    expect(versions[1]!.value).toEqual({ value: 1500, unit_id: unitV });
  });

  it('rolls back the entire import when any mutation fails (no partial commit)', async () => {
    const before = (
      await editor`select count(*)::int as n from public.products where workspace_id = ${ws}`
    )[0]!.n as number;
    const bad = [...plan(unitV), { kind: 'set_value', key: 'x', fieldId: crypto.randomUUID(), newValue: { value: 1 } }];
    const sessionId = await createSession(editor, ws, bad);
    await expectDenied(
      () => editor`select public.commit_import_session(${sessionId})`,
    );
    const after = (
      await editor`select count(*)::int as n from public.products where workspace_id = ${ws}`
    )[0]!.n as number;
    expect(after).toBe(before); // create_product rolled back with everything else
    const session = (
      await editor`select status from public.import_sessions where id = ${sessionId}`
    )[0]!;
    expect(session.status).toBe('proposed'); // still committable after fixing
  });

  it('only commits sessions in proposed state (no double commit)', async () => {
    const sessionId = await createSession(editor, ws, plan(unitV));
    await editor`select public.commit_import_session(${sessionId})`;
    const message = await expectDenied(
      () => editor`select public.commit_import_session(${sessionId})`,
    );
    expect(message).toContain('expected proposed');
  });

  it('viewers cannot create sessions or commit (editor-gated end to end)', async () => {
    await expectDenied(() => createSession(viewer, ws, plan(unitV)));
    const sessionId = await createSession(editor, ws, plan(unitV));
    // FOR UPDATE row-locking applies the editor-gated UPDATE policy, so the
    // viewer sees "not found or not accessible" before anything is written.
    await expectDenied(() => viewer`select public.commit_import_session(${sessionId})`);
    // Viewers can still READ the session (members read — the audit trail).
    const visible = await viewer`select id from public.import_sessions where id = ${sessionId}`;
    expect(visible).toHaveLength(1);
  });

  it('stranger isolation: no read, no commit across workspaces', async () => {
    const sessionId = await createSession(editor, ws, plan(unitV));
    const visible = await stranger`select id from public.import_sessions where id = ${sessionId}`;
    expect(visible).toHaveLength(0);
    const message = await expectDenied(
      () => stranger`select public.commit_import_session(${sessionId})`,
    );
    expect(message).toContain('not found or not accessible');
  });
});
