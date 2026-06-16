import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G6.3 probes — `domain_ownership_config`: the matrix the four-step owner
 * fallback reads (spec §3.4). The resolution *logic* is unit-tested in
 * `@arther/types`; this proves the schema invariants the resolver leans on:
 *   • singular owner per category at workspace-default scope, and per
 *     (category, product) at product scope (the partial-unique indexes);
 *   • a product override may coexist with a workspace default for the same
 *     category (distinct scopes);
 *   • it is a Settings surface — owner/admin write, members read, strangers
 *     see nothing (0006 `doc_read` / `doc_write`).
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let strangerId: string;
let ws: string;
let productId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `do-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `do-member-${run}@example.com`);
  strangerId = await createAuthUser(admin, `do-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Ownership', ${uniqueSlug('do')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('dox')})`;

  productId = (
    await owner`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Inverter X', ${ownerId}) returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await member?.end();
  await stranger?.end();
  await admin?.end();
});

describe('domain_ownership_config (G6.3)', () => {
  it('an admin/owner sets a workspace-default owner for a category', async () => {
    const rows = await owner`
      insert into public.domain_ownership_config
        (workspace_id, field_category, product_id, owner_user_id, set_by)
      values (${ws}, 'Electrical', null, ${memberId}, ${ownerId})
      returning id, product_id
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.product_id).toBeNull();
  });

  it('a product-specific override coexists with the workspace default (distinct scopes)', async () => {
    const rows = await owner`
      insert into public.domain_ownership_config
        (workspace_id, field_category, product_id, owner_user_id, set_by)
      values (${ws}, 'Electrical', ${productId}, ${ownerId}, ${ownerId})
      returning id, product_id
    `;
    expect(rows[0]!.product_id).toBe(productId);
    // Both scopes for 'Electrical' now exist side by side.
    const both = await owner`
      select product_id from public.domain_ownership_config
      where workspace_id = ${ws} and field_category = 'Electrical'
    `;
    expect(both).toHaveLength(2);
  });

  it('a second workspace-default owner for the same category is rejected (singular)', async () => {
    await expectDenied(
      () => owner`
        insert into public.domain_ownership_config
          (workspace_id, field_category, product_id, owner_user_id, set_by)
        values (${ws}, 'Electrical', null, ${ownerId}, ${ownerId})
      `,
    );
  });

  it('a second override for the same (category, product) is rejected (singular)', async () => {
    await expectDenied(
      () => owner`
        insert into public.domain_ownership_config
          (workspace_id, field_category, product_id, owner_user_id, set_by)
        values (${ws}, 'Electrical', ${productId}, ${memberId}, ${ownerId})
      `,
    );
  });

  it('a plain member reads the matrix but cannot write it (Settings is admin-gated)', async () => {
    const seen = await member`
      select field_category from public.domain_ownership_config where workspace_id = ${ws}
    `;
    expect(seen.length).toBeGreaterThanOrEqual(2);
    await expectDenied(
      () => member`
        insert into public.domain_ownership_config
          (workspace_id, field_category, product_id, owner_user_id, set_by)
        values (${ws}, 'Mechanical', null, ${memberId}, ${memberId})
      `,
    );
  });

  it('a stranger sees nothing and cannot write', async () => {
    const seen = await stranger`
      select 1 from public.domain_ownership_config where workspace_id = ${ws}
    `;
    expect(seen).toHaveLength(0);
    await expectDenied(
      () => stranger`
        insert into public.domain_ownership_config
          (workspace_id, field_category, product_id, owner_user_id, set_by)
        values (${ws}, 'Compliance', null, ${strangerId}, ${strangerId})
      `,
    );
  });
});
