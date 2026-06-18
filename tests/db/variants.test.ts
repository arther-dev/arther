import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * V.1 — product variants + deltas RLS and invariants (0010). Variants/deltas are
 * editor-write, member-read. Locks:
 *   • an editor (a plain member) creates a variant + a delta every member can read;
 *   • a viewer can read but not write either table;
 *   • the `delta_type` CHECK rejects an unknown type;
 *   • the partial unique index allows only one default variant per product;
 *   • cross-tenant isolation (a stranger sees and writes nothing).
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let viewer: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let ws: string;
let productId: string;
let componentId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `var-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `var-member-${run}@example.com`);
  const viewerId = await createAuthUser(admin, `var-viewer-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `var-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Variant Co', ${uniqueSlug('var')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId}), (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('varx')})`;

  productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Base', ${ownerId}) returning id`
  )[0]!.id as string;
  componentId = (
    await owner`insert into public.components (workspace_id, name, type, created_by) values (${ws}, 'PSU', 'module', ${ownerId}) returning id`
  )[0]!.id as string;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), member.end(), viewer.end(), stranger.end()]);
});

describe('product variants + deltas (0010)', () => {
  it('a member (editor) creates a variant + delta that every member can read', async () => {
    const variantId = (
      await member`
        insert into public.product_variants (workspace_id, product_id, name, slug, created_by)
        values (${ws}, ${productId}, 'High-temp', 'high-temp', ${memberId}) returning id
      `
    )[0]!.id as string;
    await member`
      insert into public.variant_deltas (workspace_id, variant_id, delta_type, component_id)
      values (${ws}, ${variantId}, 'COMPONENT_REMOVE', ${componentId})
    `;
    for (const client of [owner, member, viewer]) {
      expect(await client`select id from public.product_variants where id = ${variantId}`).toHaveLength(1);
      expect(
        await client`select id from public.variant_deltas where variant_id = ${variantId}`,
      ).toHaveLength(1);
    }
  });

  it('a viewer can read but cannot create a variant or a delta', async () => {
    await expectDenied(
      () =>
        viewer`insert into public.product_variants (workspace_id, product_id, name, slug) values (${ws}, ${productId}, 'Nope', 'nope')`,
    );
    const variantId = (
      await owner`
        insert into public.product_variants (workspace_id, product_id, name, slug, created_by)
        values (${ws}, ${productId}, 'Owned', 'owned', ${ownerId}) returning id
      `
    )[0]!.id as string;
    await expectDenied(
      () =>
        viewer`insert into public.variant_deltas (workspace_id, variant_id, delta_type, component_id) values (${ws}, ${variantId}, 'COMPONENT_REMOVE', ${componentId})`,
    );
  });

  it('the delta_type CHECK rejects an unknown type', async () => {
    const variantId = (
      await owner`
        insert into public.product_variants (workspace_id, product_id, name, slug, created_by)
        values (${ws}, ${productId}, 'Check', 'check', ${ownerId}) returning id
      `
    )[0]!.id as string;
    await expectDenied(
      () =>
        owner`insert into public.variant_deltas (workspace_id, variant_id, delta_type, component_id) values (${ws}, ${variantId}, 'BOGUS', ${componentId})`,
    );
  });

  it('permits only one default variant per product', async () => {
    const dp = (await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'DefProd', ${ownerId}) returning id`)[0]!
      .id as string;
    await owner`
      insert into public.product_variants (workspace_id, product_id, name, slug, is_default, created_by)
      values (${ws}, ${dp}, 'A', 'a', true, ${ownerId})
    `;
    // A second default on the same product violates the partial unique index.
    await expectDenied(
      () =>
        owner`insert into public.product_variants (workspace_id, product_id, name, slug, is_default, created_by) values (${ws}, ${dp}, 'B', 'b', true, ${ownerId})`,
    );
    // A non-default second variant is fine.
    expect(
      await owner`
        insert into public.product_variants (workspace_id, product_id, name, slug, is_default, created_by)
        values (${ws}, ${dp}, 'B', 'b', false, ${ownerId}) returning id
      `,
    ).toHaveLength(1);
  });

  it('a stranger in another tenant can neither read nor write', async () => {
    expect(
      await stranger`select id from public.product_variants where workspace_id = ${ws}`,
    ).toHaveLength(0);
    await expectDenied(
      () =>
        stranger`insert into public.product_variants (workspace_id, product_id, name, slug) values (${ws}, ${productId}, 'X', 'x')`,
    );
  });
});
