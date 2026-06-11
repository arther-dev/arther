import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * The second-user RLS probe (Phase 1 F8.1, pulled forward as a standing CI
 * gate — IMPLEMENTATION_PLAN.md §8): user B in workspace W2 can neither read
 * nor mutate anything belonging to user A's workspace W1, via the same JWT
 * path the app uses. Also proves the Viewer seat boundary at the row.
 */

let admin: Sql;
let alice: Sql; // owner of W1
let bob: Sql; // owner of W2 — the hostile second user
let vera: Sql; // viewer inside W1 — free seat, must not write content
let aliceId: string;
let bobId: string;
let veraId: string;
let w1: string;
let w2: string;
let w1ProductId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  aliceId = await createAuthUser(admin, `alice-${run}@example.com`);
  bobId = await createAuthUser(admin, `bob-${run}@example.com`);
  veraId = await createAuthUser(admin, `vera-${run}@example.com`);
  alice = await userClient(aliceId);
  bob = await userClient(bobId);
  vera = await userClient(veraId);

  w1 = (await alice`select public.create_workspace('W1', ${uniqueSlug('w1')}) as id`)[0]!
    .id as string;
  w2 = (await bob`select public.create_workspace('W2', ${uniqueSlug('w2')}) as id`)[0]!
    .id as string;

  // Alice (owner) adds Vera as a viewer in W1 — allowed by members_write.
  await alice`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${w1}, ${veraId}, 'viewer', ${aliceId})
  `;

  w1ProductId = (
    await alice`
      insert into public.products (workspace_id, name, created_by)
      values (${w1}, 'W1 Secret Product', ${aliceId})
      returning id
    `
  )[0]!.id as string;

  await alice`
    insert into public.spec_fields (workspace_id, product_id, name, type, value, category, created_by)
    values (${w1}, ${w1ProductId}, 'Max torque', 'scalar', ${JSON.stringify({ kind: 'scalar', value: 2.4 })}::jsonb, 'Performance', ${aliceId})
  `;
});

afterAll(async () => {
  for (const sql of [alice, bob, vera]) await sql?.end();
  await admin?.end();
});

describe('cross-workspace isolation (user B vs W1)', () => {
  it('B sees only their own workspace', async () => {
    const rows = await bob`select id from public.workspaces`;
    expect(rows.map((r) => r.id)).toEqual([w2]);
  });

  it('B cannot read W1 rows: workspaces, members, products, spec_fields', async () => {
    expect(await bob`select * from public.workspaces where id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.workspace_members where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.products where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.spec_fields where workspace_id = ${w1}`).toHaveLength(0);
  });

  it('B cannot update W1 rows (zero rows affected)', async () => {
    const renamed = await bob`update public.workspaces set name = 'pwned' where id = ${w1}`;
    expect(renamed.count).toBe(0);
    const productEdit = await bob`update public.products set name = 'pwned' where id = ${w1ProductId}`;
    expect(productEdit.count).toBe(0);
  });

  it('B cannot insert content into W1 (with-check violation)', async () => {
    await expectDenied(
      () => bob`
        insert into public.products (workspace_id, name, created_by)
        values (${w1}, 'Injected', ${bobId})
      `,
    );
  });

  it('B cannot grant themselves membership of W1', async () => {
    await expectDenied(
      () => bob`
        insert into public.workspace_members (workspace_id, user_id, role, invited_by)
        values (${w1}, ${bobId}, 'admin', ${bobId})
      `,
    );
  });

  it('B cannot read W1 field version history', async () => {
    expect(await bob`select * from public.field_versions where workspace_id = ${w1}`).toHaveLength(0);
  });
});

describe('viewer seat boundary inside W1 (RLS backstop behind canDo)', () => {
  it('a viewer can read workspace content', async () => {
    expect(await vera`select id from public.products where workspace_id = ${w1}`).toHaveLength(1);
  });

  it('a viewer cannot write content at the row (is_workspace_editor backstop)', async () => {
    await expectDenied(
      () => vera`
        insert into public.products (workspace_id, name, created_by)
        values (${w1}, 'Viewer Product', ${veraId})
      `,
    );
    const edit = await vera`update public.products set name = 'edited' where id = ${w1ProductId}`;
    expect(edit.count).toBe(0);
  });

  it('a viewer keeps their spec’d write: field comments', async () => {
    const fieldId = (
      await vera`select id from public.spec_fields where workspace_id = ${w1} limit 1`
    )[0]!.id as string;
    const rows = await vera`
      insert into public.field_comments (workspace_id, field_id, author_id, body)
      values (${w1}, ${fieldId}, ${veraId}, 'Is this rated or measured?')
      returning id
    `;
    expect(rows).toHaveLength(1);
  });
});
