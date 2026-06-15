import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G1.4 probes — generation run state (migration 0005 `generation_runs` /
 * `generation_run_sections`). The defining guarantee: writes are SERVICE-ROLE
 * ONLY — there is no authenticated write policy, so a run cannot be forged from
 * a client — while members READ (the progress UI). The `admin` (superuser)
 * connection stands in for the service role here; `editor`/`viewer` are
 * authenticated clients. Strangers see nothing.
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
let documentTypeId: string;
let runId: string;
let sectionIds: string[] = [];

const asJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `gen-editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `gen-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `gen-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Genworks', ${uniqueSlug('gw')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${editorId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('gwx')})`;

  productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Servo Drive S2', ${editorId}) returning id
    `
  )[0]!.id as string;
  documentTypeId = (
    await editor`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;

  // Service-role (admin) creates the run + its section scaffold.
  runId = (
    await admin`
      insert into public.generation_runs (workspace_id, product_id, document_type_id, status, requested_by)
      values (${ws}, ${productId}, ${documentTypeId}, 'running', ${editorId}) returning id
    `
  )[0]!.id as string;
  sectionIds = [];
  for (let i = 0; i < 2; i += 1) {
    const id = (
      await admin`
        insert into public.generation_run_sections (workspace_id, run_id, name, display_order, status)
        values (${ws}, ${runId}, ${`Section ${i}`}, ${i}, 'pending') returning id
      `
    )[0]!.id as string;
    sectionIds.push(id);
  }
});

afterAll(async () => {
  await editor?.end();
  await viewer?.end();
  await stranger?.end();
  await admin?.end();
});

describe('generation runs (G1.4)', () => {
  it('a member reads the service-created run and its sections in order', async () => {
    const runRows = await editor`select status, product_id from public.generation_runs where id = ${runId}`;
    expect(runRows[0]!.status).toBe('running');
    const sections = await editor`
      select name, status, display_order from public.generation_run_sections
      where run_id = ${runId} order by display_order
    `;
    expect(sections.map((s) => s.name)).toEqual(['Section 0', 'Section 1']);
  });

  it('a viewer (member) can also read the run', async () => {
    const rows = await viewer`select id from public.generation_runs where id = ${runId}`;
    expect(rows).toHaveLength(1);
  });

  it('an authenticated client cannot forge a run (no write policy)', async () => {
    await expectDenied(
      () => editor`
        insert into public.generation_runs (workspace_id, product_id, document_type_id, status, requested_by)
        values (${ws}, ${productId}, ${documentTypeId}, 'succeeded', ${editorId})
      `,
    );
  });

  it('an authenticated client cannot insert or update a section', async () => {
    await expectDenied(
      () => editor`
        insert into public.generation_run_sections (workspace_id, run_id, name, display_order, status)
        values (${ws}, ${runId}, 'Injected', 9, 'succeeded')
      `,
    );
    await expectDenied(
      () => editor`update public.generation_run_sections set status = 'succeeded' where id = ${sectionIds[0]!}`,
    );
  });

  it('an authenticated client cannot update a run’s status', async () => {
    await expectDenied(
      () => editor`update public.generation_runs set status = 'succeeded' where id = ${runId}`,
    );
  });

  it('service-role section transitions — status, tokens, produced blocks — persist and read back', async () => {
    const produced = [crypto.randomUUID(), crypto.randomUUID()];
    await admin`
      update public.generation_run_sections
      set status = 'succeeded', input_tokens = 800, output_tokens = 1200,
          produced_block_ids = ${admin.json(produced)}, completed_at = now()
      where id = ${sectionIds[0]!}
    `;
    const seen = await editor`
      select status, input_tokens, output_tokens, produced_block_ids
      from public.generation_run_sections where id = ${sectionIds[0]!}
    `;
    expect(seen[0]!.status).toBe('succeeded');
    expect(seen[0]!.input_tokens).toBe(800);
    expect(asJson(seen[0]!.produced_block_ids)).toHaveLength(2);
  });

  it('service-role run accounting — token totals and completion — persist', async () => {
    await admin`
      update public.generation_runs
      set status = 'succeeded', input_tokens = 800, output_tokens = 1200, completed_at = now()
      where id = ${runId}
    `;
    const seen = await editor`select status, input_tokens, output_tokens from public.generation_runs where id = ${runId}`;
    expect(seen[0]!.status).toBe('succeeded');
    expect(seen[0]!.output_tokens).toBe(1200);
  });

  it('a stranger sees no runs and cannot forge one', async () => {
    const rows = await stranger`select id from public.generation_runs where id = ${runId}`;
    expect(rows).toHaveLength(0);
    await expectDenied(
      () => stranger`
        insert into public.generation_runs (workspace_id, product_id, document_type_id, status, requested_by)
        values (${ws}, ${productId}, ${documentTypeId}, 'running', ${strangerId})
      `,
    );
  });
});
