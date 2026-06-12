import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0013 probes — releases & overrides (F5.6/F5.7):
 * create_product_release() pins current versions atomically under the
 * caller's RLS; deletion is editor-only and blocked while a document
 * references the release; field type changes are blocked while overrides
 * exist; overrides are scalar-family-only and must sit on the right edge.
 */

let admin: Sql;
let editor: Sql;
let viewer: Sql;
let stranger: Sql;
let editorId: string;
let viewerId: string;
let strangerId: string;
let ws: string;
let productId: string;
let edgeId: string;
let productFieldId: string; // valued product-level field
let componentFieldId: string; // valued shared-component field
let unvaluedFieldId: string; // never valued — must not be pinned
let componentId: string;

const V = (n: number) => ({ value: n, unit_id: null });

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `rel-editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `rel-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `rel-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Relspace', ${uniqueSlug('rel')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${editorId})
  `;
  // The stranger gets their own workspace — the cross-tenant probe.
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('else')})`;

  productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Gateway G1', ${editorId}) returning id
    `
  )[0]!.id as string;
  componentId = (
    await editor`
      insert into public.components (workspace_id, name, type, created_by)
      values (${ws}, 'Motor Controller', 'module', ${editorId}) returning id
    `
  )[0]!.id as string;
  edgeId = (
    await editor`
      insert into public.product_components (workspace_id, product_id, component_id, quantity, created_by)
      values (${ws}, ${productId}, ${componentId}, 1, ${editorId}) returning id
    `
  )[0]!.id as string;

  productFieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${productId}, 'System voltage', 'scalar', 'Electrical', ${editorId})
      returning id
    `
  )[0]!.id as string;
  componentFieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, component_id, name, type, category, created_by)
      values (${ws}, ${componentId}, 'Rated voltage', 'scalar', 'Electrical', ${editorId})
      returning id
    `
  )[0]!.id as string;
  unvaluedFieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${productId}, 'Mass', 'scalar', 'Mechanical', ${editorId})
      returning id
    `
  )[0]!.id as string;

  await editor`select public.update_spec_field_value(${productFieldId}, ${editor.json(V(48))})`;
  await editor`select public.update_spec_field_value(${componentFieldId}, ${editor.json(V(36))})`;
});

afterAll(async () => {
  await editor?.end();
  await viewer?.end();
  await stranger?.end();
  await admin?.end();
});

describe('create_product_release', () => {
  it('pins the current version of product + attached-component fields, skipping unvalued ones', async () => {
    const releaseId = (
      await editor`select public.create_product_release(${productId}, 'v1.0-release', 'v1.0', 'first cut') as id`
    )[0]!.id as string;

    const pins = await editor`
      select field_id, version_id from public.release_field_values
      where release_id = ${releaseId} order by field_id
    `;
    const pinnedFields = pins.map((p) => p.field_id as string).sort();
    expect(pinnedFields).toEqual([productFieldId, componentFieldId].sort());
    expect(pinnedFields).not.toContain(unvaluedFieldId);

    // Each pin is the field's current_version_id at snapshot time.
    for (const pin of pins) {
      const f = await editor`
        select current_version_id from public.spec_fields where id = ${pin.field_id}
      `;
      expect(pin.version_id).toBe(f[0]!.current_version_id);
    }
  });

  it('keeps the pin while the field moves on — the snapshot is frozen history', async () => {
    const releaseId = (
      await editor`select public.create_product_release(${productId}, 'v1.1-release', 'v1.1') as id`
    )[0]!.id as string;
    const before = await editor`
      select version_id from public.release_field_values
      where release_id = ${releaseId} and field_id = ${componentFieldId}
    `;
    await editor`select public.update_spec_field_value(${componentFieldId}, ${editor.json(V(72))})`;
    const after = await editor`
      select version_id from public.release_field_values
      where release_id = ${releaseId} and field_id = ${componentFieldId}
    `;
    expect(after[0]!.version_id).toBe(before[0]!.version_id);
    const f = await editor`select current_version_id from public.spec_fields where id = ${componentFieldId}`;
    expect(f[0]!.current_version_id).not.toBe(before[0]!.version_id);
  });

  it('requires a name and tag and an unarchived, accessible product', async () => {
    expect(
      await expectDenied(
        () => editor`select public.create_product_release(${productId}, '', 'v9')`,
      ),
    ).toMatch(/name and tag are required/);
    // The stranger's RLS can't see the product at all.
    expect(
      await expectDenied(
        () => stranger`select public.create_product_release(${productId}, 'x', 'v9')`,
      ),
    ).toMatch(/not found or not accessible/);
  });

  it('viewers cannot create releases (RLS write boundary)', async () => {
    await expectDenied(
      () => viewer`select public.create_product_release(${productId}, 'nope', 'v0')`,
    );
  });
});

describe('release immutability + deletion', () => {
  it('only notes are editable after creation (0003 freeze guard)', async () => {
    const releaseId = (
      await editor`select public.create_product_release(${productId}, 'v2.0-release', 'v2.0') as id`
    )[0]!.id as string;
    await editor`update public.product_releases set notes = 'amended' where id = ${releaseId}`;
    expect(
      await expectDenied(
        () => editor`update public.product_releases set tag = 'v2.0.1' where id = ${releaseId}`,
      ),
    ).toMatch(/immutable snapshots/);
  });

  it('editors can delete an unreferenced release; pins cascade away', async () => {
    const releaseId = (
      await editor`select public.create_product_release(${productId}, 'scratch', 'tmp') as id`
    )[0]!.id as string;
    await editor`delete from public.product_releases where id = ${releaseId}`;
    const pins = await editor`
      select 1 from public.release_field_values where release_id = ${releaseId}
    `;
    expect(pins).toHaveLength(0);
  });

  it('deletion is blocked while a document was generated from the release (§3.8)', async () => {
    const releaseId = (
      await editor`select public.create_product_release(${productId}, 'doc-bound', 'v3.0') as id`
    )[0]!.id as string;
    // Generation lineage lives on block_spec_references.release_id (0005).
    // Build the minimal chain in owner context — the documents surface itself
    // is Phase 2; only the reference matters to this guard.
    const typeId = (
      await admin`insert into public.document_types (name) values ('Probe sheet') returning id`
    )[0]!.id as string;
    const docId = (
      await admin`
        insert into public.documents (workspace_id, product_id, document_type_id, title, slug, created_by)
        values (${ws}, ${productId}, ${typeId}, 'G1 datasheet', 'g1-datasheet', ${editorId})
        returning id
      `
    )[0]!.id as string;
    const revisionId = (
      await admin`
        insert into public.document_revisions (workspace_id, document_id, revision_number, created_by)
        values (${ws}, ${docId}, 1, ${editorId}) returning id
      `
    )[0]!.id as string;
    const blockId = (
      await admin`
        insert into public.blocks (workspace_id, document_id, revision_id, type, source)
        values (${ws}, ${docId}, ${revisionId}, 'spec_table', 'spec') returning id
      `
    )[0]!.id as string;
    const versionId = (
      await admin`select current_version_id as id from public.spec_fields where id = ${componentFieldId}`
    )[0]!.id as string;
    await admin`
      insert into public.block_spec_references
        (workspace_id, block_id, document_id, field_id, field_version_id, release_id)
      values (${ws}, ${blockId}, ${docId}, ${componentFieldId}, ${versionId}, ${releaseId})
    `;

    expect(
      await expectDenied(
        () => editor`delete from public.product_releases where id = ${releaseId}`,
      ),
    ).toMatch(/documents generated from it/);

    await admin`delete from public.documents where id = ${docId}`; // blocks + references cascade
    await admin`delete from public.document_types where id = ${typeId}`;
    await editor`delete from public.product_releases where id = ${releaseId}`;
  });

  it('viewers and strangers cannot delete releases', async () => {
    const releaseId = (
      await editor`select public.create_product_release(${productId}, 'guarded', 'v4.0') as id`
    )[0]!.id as string;
    // RLS delete policies don't raise — they match zero rows. Verify nothing happened.
    await viewer`delete from public.product_releases where id = ${releaseId}`;
    await stranger`delete from public.product_releases where id = ${releaseId}`;
    const still = await editor`select 1 from public.product_releases where id = ${releaseId}`;
    expect(still).toHaveLength(1);
  });

  it('strangers cannot read another workspace’s releases', async () => {
    const rows = await stranger`
      select 1 from public.product_releases where product_id = ${productId}
    `;
    expect(rows).toHaveLength(0);
  });
});

describe('product_component_overrides', () => {
  it('an editor can set and replace an override on the edge', async () => {
    await editor`
      insert into public.product_component_overrides
        (workspace_id, product_component_id, field_id, value, set_by)
      values (${ws}, ${edgeId}, ${componentFieldId}, ${editor.json(V(24))}, ${editorId})
    `;
    await editor`
      insert into public.product_component_overrides
        (workspace_id, product_component_id, field_id, value, set_by)
      values (${ws}, ${edgeId}, ${componentFieldId}, ${editor.json(V(12))}, ${editorId})
      on conflict (product_component_id, field_id)
      do update set value = excluded.value, set_by = excluded.set_by, set_at = now()
    `;
    const rows = await editor`
      select value from public.product_component_overrides
      where product_component_id = ${edgeId} and field_id = ${componentFieldId}
    `;
    expect(rows).toHaveLength(1);
    const value = typeof rows[0]!.value === 'string' ? JSON.parse(rows[0]!.value) : rows[0]!.value;
    expect(value).toEqual({ value: 12, unit_id: null });
  });

  it('blocks the field type change while the override exists, allows it after removal (§3.5)', async () => {
    expect(
      await expectDenied(
        () => editor`update public.spec_fields set type = 'boolean' where id = ${componentFieldId}`,
      ),
    ).toMatch(/has product overrides/);

    await editor`
      delete from public.product_component_overrides
      where product_component_id = ${edgeId} and field_id = ${componentFieldId}
    `;
    await editor`update public.spec_fields set type = 'boolean' where id = ${componentFieldId}`;
    await editor`update public.spec_fields set type = 'scalar' where id = ${componentFieldId}`;
  });

  it('rejects overrides on non-scalar-family fields (table/reference/multi_enum)', async () => {
    const tableFieldId = (
      await editor`
        insert into public.spec_fields (workspace_id, component_id, name, type, category, created_by)
        values (${ws}, ${componentId}, 'Torque curve', 'table', 'Performance', ${editorId})
        returning id
      `
    )[0]!.id as string;
    expect(
      await expectDenied(
        () => editor`
          insert into public.product_component_overrides
            (workspace_id, product_component_id, field_id, value, set_by)
          values (${ws}, ${edgeId}, ${tableFieldId}, '{"columns":[],"rows":[]}'::jsonb, ${editorId})
        `,
      ),
    ).toMatch(/scalar field types only/);
  });

  it('rejects an override whose field does not belong to the component on the edge', async () => {
    expect(
      await expectDenied(
        () => editor`
          insert into public.product_component_overrides
            (workspace_id, product_component_id, field_id, value, set_by)
          values (${ws}, ${edgeId}, ${productFieldId}, ${editor.json(V(1))}, ${editorId})
        `,
      ),
    ).toMatch(/does not belong to the component/);
  });

  it('viewers cannot write overrides; strangers cannot read them', async () => {
    await expectDenied(
      () => viewer`
        insert into public.product_component_overrides
          (workspace_id, product_component_id, field_id, value, set_by)
        values (${ws}, ${edgeId}, ${componentFieldId}, ${viewer.json(V(5))}, ${viewerId})
      `,
    );
    const rows = await stranger`
      select 1 from public.product_component_overrides where product_component_id = ${edgeId}
    `;
    expect(rows).toHaveLength(0);
  });
});
