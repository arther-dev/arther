import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * F5.8 probes — field comments: commenting is a MEMBER right (viewers
 * included — deliberately not editor-gated, 0003 `field_comments_rw`);
 * version-context columns persist; strangers see nothing.
 */

let admin: Sql;
let editor: Sql;
let viewer: Sql;
let stranger: Sql;
let editorId: string;
let viewerId: string;
let strangerId: string;
let ws: string;
let fieldId: string;
let versionId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `fc-editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `fc-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `fc-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Commentry', ${uniqueSlug('fc')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${editorId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('fcx')})`;

  const products = await editor`
    insert into public.products (workspace_id, name, created_by)
    values (${ws}, 'Pump P1', ${editorId}) returning id
  `;
  fieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${products[0]!.id}, 'Max pressure', 'scalar', 'Mechanical', ${editorId})
      returning id
    `
  )[0]!.id as string;
  versionId = (
    await editor`
      select public.update_spec_field_value(${fieldId}, ${editor.json({ value: 6, unit_id: null })}) as id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await editor?.end();
  await viewer?.end();
  await stranger?.end();
  await admin?.end();
});

describe('field_comments (F5.8)', () => {
  it('a VIEWER can comment — commenting is a member right, not editor-gated', async () => {
    const rows = await viewer`
      insert into public.field_comments
        (workspace_id, field_id, field_version_id, value_snapshot, author_id, body)
      values (${ws}, ${fieldId}, ${versionId}, ${viewer.json({ value: 6, unit_id: null })},
              ${viewerId}, 'Is 6 bar the burst or working pressure?')
      returning id, field_version_id, value_snapshot
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.field_version_id).toBe(versionId);
  });

  it('the version context survives later value changes ("at this comment")', async () => {
    await editor`select public.update_spec_field_value(${fieldId}, ${editor.json({ value: 8, unit_id: null })})`;
    const comments = await editor`
      select field_version_id, value_snapshot from public.field_comments
      where field_id = ${fieldId}
    `;
    expect(comments[0]!.field_version_id).toBe(versionId); // still the old version
    const snapshot =
      typeof comments[0]!.value_snapshot === 'string'
        ? JSON.parse(comments[0]!.value_snapshot)
        : comments[0]!.value_snapshot;
    expect(snapshot).toEqual({ value: 6, unit_id: null });
  });

  it('threading: a reply references its parent', async () => {
    const parent = await editor`
      select id from public.field_comments where field_id = ${fieldId} limit 1
    `;
    const reply = await editor`
      insert into public.field_comments
        (workspace_id, field_id, author_id, body, parent_comment_id)
      values (${ws}, ${fieldId}, ${editorId}, 'Working pressure — burst is 12.', ${parent[0]!.id})
      returning parent_comment_id
    `;
    expect(reply[0]!.parent_comment_id).toBe(parent[0]!.id);
  });

  it('strangers can neither read nor write another workspace’s comments', async () => {
    const rows = await stranger`
      select 1 from public.field_comments where field_id = ${fieldId}
    `;
    expect(rows).toHaveLength(0);
    await expectDenied(
      () => stranger`
        insert into public.field_comments (workspace_id, field_id, author_id, body)
        values (${ws}, ${fieldId}, ${strangerId}, 'drive-by')
      `,
    );
  });
});

describe('archive lifecycle (F5.10)', () => {
  it('editors archive and restore; viewers cannot', async () => {
    await editor`
      update public.spec_fields
         set archived_at = now(), archived_by = ${editorId} where id = ${fieldId}
    `;
    const archived = await editor`select archived_at from public.spec_fields where id = ${fieldId}`;
    expect(archived[0]!.archived_at).not.toBeNull();

    // Viewer update matches zero rows under the editor-gated write policy.
    await viewer`update public.spec_fields set archived_at = null where id = ${fieldId}`;
    const still = await editor`select archived_at from public.spec_fields where id = ${fieldId}`;
    expect(still[0]!.archived_at).not.toBeNull();

    await editor`
      update public.spec_fields set archived_at = null, archived_by = null where id = ${fieldId}
    `;
    const restored = await editor`select archived_at from public.spec_fields where id = ${fieldId}`;
    expect(restored[0]!.archived_at).toBeNull();
  });
});
