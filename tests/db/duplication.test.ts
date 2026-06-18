import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * R.8 — duplication_records RLS (0009): the audit row `duplicateDocument` writes.
 * Editor-write, member-read (the doc references are nullable / on delete set null,
 * so the probe uses bare rows). The block/reference/embed copies themselves go
 * through tables already probed elsewhere; this locks the record's policy.
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let viewer: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let ws: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `dup-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `dup-member-${run}@example.com`);
  const viewerId = await createAuthUser(admin, `dup-viewer-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `dup-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Dup Co', ${uniqueSlug('dup')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId}), (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('dupx')})`;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), member.end(), viewer.end(), stranger.end()]);
});

describe('duplication_records RLS (0009)', () => {
  it('an editor records a duplication that every member can read', async () => {
    const id = (
      await member`
        insert into public.duplication_records (workspace_id, blocks_resolved, blocks_carried_over, created_by)
        values (${ws}, 5, 2, ${memberId}) returning id
      `
    )[0]!.id as string;
    for (const client of [owner, member, viewer]) {
      expect(await client`select id from public.duplication_records where id = ${id}`).toHaveLength(1);
    }
  });

  it('a viewer cannot record a duplication', async () => {
    await expectDenied(
      () => viewer`insert into public.duplication_records (workspace_id) values (${ws})`,
    );
  });

  it('a stranger in another tenant can neither read nor write', async () => {
    expect(
      await stranger`select id from public.duplication_records where workspace_id = ${ws}`,
    ).toHaveLength(0);
    await expectDenied(
      () => stranger`insert into public.duplication_records (workspace_id) values (${ws})`,
    );
  });
});

/**
 * R.8 cross-product — the load-bearing premise of cross-product re-resolution
 * (§5.8): a snippet/spec reference re-links to the **target product's** field of
 * the same name (matched case-insensitively, the only cross-product identity the
 * model has), anchored to that field's current version. A name with no populated
 * match would instead become a placeholder. This locks the SQL the TS path relies on.
 */
describe('cross-product field match by name (R.8)', () => {
  it('finds a same-named populated field in the target product with its current version', async () => {
    const targetProduct = (
      await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Widget B', ${ownerId}) returning id`
    )[0]!.id as string;
    // A populated field on the target product + its current version (the re-link anchor).
    const fieldId = (
      await owner`
        insert into public.spec_fields (workspace_id, product_id, name, type, value, category, created_by)
        values (${ws}, ${targetProduct}, 'Rated Voltage', 'scalar', ${owner.json({ kind: 'scalar', value: 5 })}, 'Electrical', ${ownerId})
        returning id
      `
    )[0]!.id as string;
    const versionId = (
      await owner`
        insert into public.field_versions (workspace_id, field_id, value, changed_by)
        values (${ws}, ${fieldId}, ${owner.json({ kind: 'scalar', value: 5 })}, ${ownerId}) returning id
      `
    )[0]!.id as string;
    await owner`update public.spec_fields set current_version_id = ${versionId} where id = ${fieldId}`;

    // Case-insensitive name match resolves to the field + its current version.
    const matched = await owner`
      select id, current_version_id, (value is not null) as populated
      from public.spec_fields
      where product_id = ${targetProduct} and lower(name) = lower('rated voltage') and archived_at is null
    `;
    expect(matched).toHaveLength(1);
    expect(matched[0]!.id).toBe(fieldId);
    expect(matched[0]!.current_version_id).toBe(versionId);
    expect(matched[0]!.populated).toBe(true);

    // A field the target product lacks yields nothing → that block would placeholder.
    const missing = await owner`
      select id from public.spec_fields
      where product_id = ${targetProduct} and lower(name) = lower('nonexistent field')
    `;
    expect(missing).toHaveLength(0);
  });
});
