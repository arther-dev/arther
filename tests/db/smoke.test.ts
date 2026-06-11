import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration smoke probes (Phase 1 F1.1–F1.5 acceptance): conventions,
 * tenancy helpers, the create_workspace bootstrap RPC, immutability and
 * archive guards — run against the dockerized Postgres with the auth shim.
 */

let admin: Sql;
let alice: Sql;
let aliceId: string;
let workspaceId: string;

beforeAll(async () => {
  admin = adminClient();
  aliceId = await createAuthUser(admin, `alice-${crypto.randomUUID().slice(0, 8)}@example.com`);
  alice = await userClient(aliceId);
});

afterAll(async () => {
  await alice?.end();
  await admin?.end();
});

describe('conventions (0001)', () => {
  it('has the required extensions', async () => {
    const rows = await admin`
      select extname from pg_extension where extname in ('pgcrypto', 'pg_trgm', 'citext')
    `;
    expect(rows.map((r) => r.extname).sort()).toEqual(['citext', 'pg_trgm', 'pgcrypto']);
  });

  it('has the recursion-safe tenancy helpers in the private schema', async () => {
    const rows = await admin`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private'
    `;
    const names = rows.map((r) => r.proname);
    for (const fn of [
      'current_workspace_ids',
      'is_workspace_member',
      'has_workspace_role',
      'is_workspace_editor',
      'shares_workspace',
    ]) {
      expect(names, `missing private.${fn}`).toContain(fn);
    }
  });

  it('audit_log is append-only even for the table owner', async () => {
    await admin`
      insert into public.audit_log (workspace_id, action, resource_type)
      values (gen_random_uuid(), 'test.event', 'test')
    `;
    const message = await expectDenied(
      () => admin`update public.audit_log set action = 'tampered' where action = 'test.event'`,
    );
    expect(message).toMatch(/immutable/);
  });
});

describe('identity & workspace bootstrap (0002/0003)', () => {
  it('mirrors auth.users into public.users on signup (handle_new_user)', async () => {
    const rows = await admin`select id, email from public.users where id = ${aliceId}`;
    expect(rows).toHaveLength(1);
  });

  it('create_workspace() creates workspace + owner membership + seeded defaults atomically', async () => {
    const slug = uniqueSlug('acme');
    const rows = await alice`select public.create_workspace('Acme Motors', ${slug}) as id`;
    workspaceId = rows[0]!.id as string;
    expect(workspaceId).toMatch(/^[0-9a-f-]{36}$/);

    const members = await alice`
      select role from public.workspace_members
      where workspace_id = ${workspaceId} and user_id = ${aliceId}
    `;
    expect(members[0]?.role).toBe('owner');

    const categories = await alice`
      select name from public.spec_categories where workspace_id = ${workspaceId} and built_in
    `;
    expect(categories).toHaveLength(7);
  });

  it('seeds the global built-in unit registry, readable by members', async () => {
    const rows = await alice`select count(*)::int as n from public.units where workspace_id is null`;
    expect(rows[0]!.n).toBeGreaterThan(30);
  });

  it('workspace slug is immutable at the database', async () => {
    const message = await expectDenied(
      () => alice`update public.workspaces set slug = ${uniqueSlug('renamed')} where id = ${workspaceId}`,
    );
    expect(message).toMatch(/slug is immutable/);
  });

  it('a JWT client cannot insert a workspace directly (bootstrap goes through the RPC)', async () => {
    await expectDenied(
      () => alice`
        insert into public.workspaces (name, slug, owner_id)
        values ('Forged', ${uniqueSlug('forged')}, ${aliceId})
      `,
    );
  });

  it('a JWT client cannot hard-delete the tenant root', async () => {
    const before = await alice`select count(*)::int as n from public.workspaces where id = ${workspaceId}`;
    expect(before[0]!.n).toBe(1);
    // No DELETE policy → 0 rows affected, workspace survives.
    await alice`delete from public.workspaces where id = ${workspaceId}`;
    const after = await alice`select count(*)::int as n from public.workspaces where id = ${workspaceId}`;
    expect(after[0]!.n).toBe(1);
  });
});

describe('spec database guards (0003)', () => {
  let productId: string;
  let fieldId: string;

  it('an editor can create products and typed spec fields with version history', async () => {
    const products = await alice`
      insert into public.products (workspace_id, name, created_by)
      values (${workspaceId}, 'BLDC Motor X1', ${aliceId})
      returning id
    `;
    productId = products[0]!.id as string;

    const fields = await alice`
      insert into public.spec_fields (workspace_id, product_id, name, type, value, category, created_by)
      values (${workspaceId}, ${productId}, 'Rated voltage', 'scalar', ${JSON.stringify({ kind: 'scalar', value: 48 })}::jsonb, 'Electrical', ${aliceId})
      returning id
    `;
    fieldId = fields[0]!.id as string;

    const versions = await alice`
      insert into public.field_versions (workspace_id, field_id, value, changed_by)
      values (${workspaceId}, ${fieldId}, ${JSON.stringify({ kind: 'scalar', value: 48 })}::jsonb, ${aliceId})
      returning id
    `;
    expect(versions).toHaveLength(1);
  });

  it('field version history is immutable (prevent_mutation fires even for the owner)', async () => {
    const message = await expectDenied(
      () => admin`update public.field_versions set note = 'tampered' where field_id = ${fieldId}`,
    );
    expect(message).toMatch(/immutable/);
  });

  it('a referenced product cannot be hard-deleted (archive instead)', async () => {
    await alice`
      insert into public.product_releases (workspace_id, product_id, name, tag, created_by)
      values (${workspaceId}, ${productId}, 'Initial', 'v1.0', ${aliceId})
    `;
    const message = await expectDenied(
      () => admin`delete from public.products where id = ${productId}`,
    );
    expect(message).toMatch(/archive it instead/);
  });

  it('releases are frozen snapshots — only notes may change', async () => {
    const message = await expectDenied(
      () => alice`update public.product_releases set tag = 'v9.9' where product_id = ${productId}`,
    );
    expect(message).toMatch(/immutable snapshots/);
    await alice`update public.product_releases set notes = 'amended note' where product_id = ${productId}`;
  });
});
