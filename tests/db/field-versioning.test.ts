import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0012 probes — update_spec_field_value(): atomic version append +
 * pointer move + working-value update, under the caller's RLS (invoker
 * rights): editors write, viewers are denied at the row.
 */

let admin: Sql;
let editor: Sql;
let viewer: Sql;
let editorId: string;
let viewerId: string;
let ws: string;
let fieldId: string;

/** Pass objects, not pre-stringified JSON — postgres.js serializes jsonb params itself. */
const V = (n: number) => ({ value: n, unit_id: null });
const asJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `viewer-${run}@example.com`);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);

  ws = (await editor`select public.create_workspace('Verse', ${uniqueSlug('verse')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${editorId})
  `;
  const products = await editor`
    insert into public.products (workspace_id, name, created_by)
    values (${ws}, 'Servo Drive S2', ${editorId}) returning id
  `;
  fieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${products[0]!.id}, 'Rated voltage', 'scalar', 'Electrical', ${editorId})
      returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await editor?.end();
  await viewer?.end();
  await admin?.end();
});

describe('update_spec_field_value', () => {
  it('appends a version, moves the pointer, and updates the value atomically', async () => {
    const v1 = (
      await editor`select public.update_spec_field_value(${fieldId}, ${editor.json(V(36))}, 'initial') as id`
    )[0]!.id as string;

    const field = await editor`
      select value, current_version_id from public.spec_fields where id = ${fieldId}
    `;
    expect(field[0]!.current_version_id).toBe(v1);
    expect(asJson(field[0]!.value)).toEqual({ value: 36, unit_id: null });

    const versions = await editor`
      select id, note, diff, changed_by from public.field_versions
      where field_id = ${fieldId} order by changed_at
    `;
    expect(versions).toHaveLength(1);
    expect(versions[0]!.note).toBe('initial');
    expect(versions[0]!.changed_by).toBe(editorId);
    expect(asJson(versions[0]!.diff)).toEqual({ before: null, after: { value: 36, unit_id: null } });
  });

  it('keeps full history across successive updates', async () => {
    const v2 = (
      await editor`select public.update_spec_field_value(${fieldId}, ${editor.json(V(48))}) as id`
    )[0]!.id as string;
    const versions = await editor`
      select id from public.field_versions where field_id = ${fieldId} order by changed_at
    `;
    expect(versions).toHaveLength(2);
    const pointer = await editor`
      select current_version_id, value from public.spec_fields where id = ${fieldId}
    `;
    expect(pointer[0]!.current_version_id).toBe(v2);
    expect(asJson(pointer[0]!.value)).toEqual({ value: 48, unit_id: null });
  });

  it('denies viewers (invoker rights: editor-only RLS applies inside the RPC)', async () => {
    const message = await expectDenied(
      () => viewer`select public.update_spec_field_value(${fieldId}, ${viewer.json(V(99))})`,
    );
    expect(message).toMatch(/row-level security|denied|permission/i);
    const pointer = await editor`select value from public.spec_fields where id = ${fieldId}`;
    expect(asJson(pointer[0]!.value)).toEqual({ value: 48, unit_id: null });
  });

  it('refuses edits to archived fields', async () => {
    await editor`update public.spec_fields set archived_at = now() where id = ${fieldId}`;
    const message = await expectDenied(
      () => editor`select public.update_spec_field_value(${fieldId}, ${editor.json(V(50))})`,
    );
    expect(message).toMatch(/archived/);
    await editor`update public.spec_fields set archived_at = null where id = ${fieldId}`;
  });

  it('is invisible across workspaces (field lookup under RLS)', async () => {
    const outsiderId = await createAuthUser(admin, `outsider-${crypto.randomUUID().slice(0, 8)}@example.com`);
    const outsider = await userClient(outsiderId);
    await outsider`select public.create_workspace('Other', ${uniqueSlug('other')})`;
    const message = await expectDenied(
      () => outsider`select public.update_spec_field_value(${fieldId}, ${outsider.json(V(1))})`,
    );
    expect(message).toMatch(/not found or not accessible/);
    await outsider.end();
  });
});
