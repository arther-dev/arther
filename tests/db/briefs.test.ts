import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G0.6 probes — Product Briefs (migration 0004 `product_briefs` /
 * `brief_fragments`). Briefs are authoring content: members READ, editors
 * WRITE. A brief mirrors the spec graph, so a component's fragments are
 * readable by every member of the workspace that shares the component (the G0
 * acceptance: "a component brief fragment is visible to every product that
 * references the component"). Strangers see nothing.
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
let componentId: string;
let briefId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `brief-editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `brief-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `brief-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Briefworks', ${uniqueSlug('bw')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${editorId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('bwx')})`;

  productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Servo A', ${editorId}) returning id
    `
  )[0]!.id as string;
  componentId = (
    await editor`
      insert into public.components (workspace_id, name, type, created_by)
      values (${ws}, 'Motor Controller', 'module', ${editorId}) returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await editor?.end();
  await viewer?.end();
  await stranger?.end();
  await admin?.end();
});

describe('product briefs (G0.6)', () => {
  it('an editor creates a brief and a fragment for a product', async () => {
    briefId = (
      await editor`
        insert into public.product_briefs (workspace_id, entity_type, entity_id, created_by)
        values (${ws}, 'product', ${productId}, ${editorId}) returning id
      `
    )[0]!.id as string;
    const frag = await editor`
      insert into public.brief_fragments (workspace_id, brief_id, key, content, updated_by)
      values (${ws}, ${briefId}, 'overview', 'A precision servo for industrial automation.', ${editorId})
      returning key, content
    `;
    expect(frag[0]!.key).toBe('overview');
  });

  it('one brief per entity — a second brief for the same product is rejected', async () => {
    await expectDenied(
      () => editor`
        insert into public.product_briefs (workspace_id, entity_type, entity_id, created_by)
        values (${ws}, 'product', ${productId}, ${editorId})
      `,
    );
  });

  it('one fragment per (brief, key) — duplicate keys are rejected', async () => {
    await expectDenied(
      () => editor`
        insert into public.brief_fragments (workspace_id, brief_id, key, content, updated_by)
        values (${ws}, ${briefId}, 'overview', 'dup', ${editorId})
      `,
    );
  });

  it('a viewer can READ a fragment but cannot WRITE one (editor-gated)', async () => {
    const read = await viewer`
      select key, content from public.brief_fragments where brief_id = ${briefId}
    `;
    expect(read).toHaveLength(1);
    await expectDenied(
      () => viewer`
        insert into public.brief_fragments (workspace_id, brief_id, key, content, updated_by)
        values (${ws}, ${briefId}, 'target_applications', 'sneaky', ${viewerId})
      `,
    );
  });

  it('a component brief fragment is visible to every member of the workspace', async () => {
    const compBrief = (
      await editor`
        insert into public.product_briefs (workspace_id, entity_type, entity_id, created_by)
        values (${ws}, 'component', ${componentId}, ${editorId}) returning id
      `
    )[0]!.id as string;
    await editor`
      insert into public.brief_fragments (workspace_id, brief_id, key, content, updated_by)
      values (${ws}, ${compBrief}, 'overview', 'Shared controller narrative.', ${editorId})
    `;
    // The viewer (a different member) sees the shared component's narrative.
    const seen = await viewer`
      select content from public.brief_fragments where brief_id = ${compBrief}
    `;
    expect(seen[0]!.content).toBe('Shared controller narrative.');
  });

  it('strangers can neither read nor write another workspace’s brief', async () => {
    const rows = await stranger`
      select 1 from public.brief_fragments where brief_id = ${briefId}
    `;
    expect(rows).toHaveLength(0);
    await expectDenied(
      () => stranger`
        insert into public.product_briefs (workspace_id, entity_type, entity_id, created_by)
        values (${ws}, 'product', ${productId}, ${strangerId})
      `,
    );
  });
});
