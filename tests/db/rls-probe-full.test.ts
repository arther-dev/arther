import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * H.2 — the full second-workspace RLS probe (IMPLEMENTATION_PLAN.md §8.4, the
 * v1 launch gate). F8.1 (`rls-probe`) covered the Phase-1 spine and G8.3
 * (`rls-probe-phase2`) the document/tracking spine; this closes the lineage over
 * **all tables** with three layers:
 *
 *   1. a catalog meta-check — *every* `public` table has RLS enabled, and every
 *      workspace-scoped table carries at least one policy (deny-all `audit_log`
 *      aside), so a table can never ship without isolation;
 *   2. explicit cross-tenant assertions over the Phase 3/4 tables (collaboration,
 *      publishing, content reuse, variants, analytics) seeded into W1; and
 *   3. a dynamic sweep — for *every* table with a `workspace_id`, a member of a
 *      second workspace sees zero of W1's rows (with a positive control proving
 *      the owner does see them, so the sweep can't pass vacuously).
 */

let admin: Sql;
let alice: Sql; // owner of W1 — holds the secrets
let bob: Sql; // owner of W2 — the hostile second tenant
let aliceId: string;
let bobId: string;
let w1: string;
let productId: string;
let variantId: string;
let libraryItemId: string;

/** Tables intentionally RLS-enabled with no authenticated policy (deny-all). */
const DENY_ALL_TABLES = new Set(['audit_log']);

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  aliceId = await createAuthUser(admin, `full-alice-${run}@example.com`);
  bobId = await createAuthUser(admin, `full-bob-${run}@example.com`);
  alice = await userClient(aliceId);
  bob = await userClient(bobId);

  w1 = (await alice`select public.create_workspace('Full W1', ${uniqueSlug('full')}) as id`)[0]!
    .id as string;
  await bob`select public.create_workspace('Full W2', ${uniqueSlug('fullx')})`;

  // --- Phase 1/2 spine ------------------------------------------------------
  productId = (
    await alice`
      insert into public.products (workspace_id, name, created_by)
      values (${w1}, 'Secret Drive', ${aliceId}) returning id
    `
  )[0]!.id as string;
  const componentId = (
    await alice`
      insert into public.components (workspace_id, name, type, created_by)
      values (${w1}, 'Secret Coil', 'part', ${aliceId}) returning id
    `
  )[0]!.id as string;
  const fieldId = (
    await alice`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${w1}, ${productId}, 'Rated voltage', 'scalar', 'Electrical', ${aliceId}) returning id
    `
  )[0]!.id as string;
  await alice`select public.update_spec_field_value(${fieldId}, ${alice.json({ value: 36, unit_id: null })}, 'v1')`;

  const documentTypeId = (
    await alice`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  const documentId = (
    await alice`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${w1}, ${productId}, ${documentTypeId}, 'Secret Guide', 'secret-full', ${aliceId}, ${aliceId})
      returning id
    `
  )[0]!.id as string;
  const revisionId = (
    await alice`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${w1}, ${documentId}, 1, 'draft', ${aliceId}) returning id
    `
  )[0]!.id as string;
  const blockId = (
    await alice`
      insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
      values (${w1}, ${documentId}, ${revisionId}, 'paragraph', 0, 'manual', ${alice.json({ type: 'paragraph', content: { alignment: 'left', nodes: [] } })}, ${aliceId})
      returning id
    `
  )[0]!.id as string;

  // --- Phase 3 — collaboration + publishing ---------------------------------
  const threadId = (
    await alice`
      insert into public.comment_threads (workspace_id, revision_id, block_id, anchor_type, created_by)
      values (${w1}, ${revisionId}, ${blockId}, 'block', ${aliceId}) returning id
    `
  )[0]!.id as string;
  await alice`
    insert into public.comments (workspace_id, thread_id, author_id, body)
    values (${w1}, ${threadId}, ${aliceId}, 'Is this rated or measured?')
  `;
  await alice`
    insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at)
    values (${w1}, ${documentId}, 'reader@example.com', ${`hash-${run}`}, 'open', now() + interval '7 days')
  `;
  // published_snapshots + notifications + analytics_events have no authenticated
  // INSERT policy (pipeline / dispatch / service-role writes) — seed via admin.
  await admin`
    insert into public.published_snapshots (workspace_id, document_id, product_id, version, block_tree, published_by)
    values (${w1}, ${documentId}, ${productId}, '1.0', ${admin.json([])}, ${aliceId})
  `;
  await admin`
    insert into public.notifications (workspace_id, recipient_id, event_type, payload)
    values (${w1}, ${aliceId}, 'comment_mention', ${admin.json({ threadId })})
  `;
  await admin`
    insert into public.analytics_events (workspace_id, event_type, actor_user_id, document_id, payload)
    values (${w1}, 'document_generated', ${aliceId}, ${documentId}, ${admin.json({})})
  `;

  // --- Phase 4 — content reuse + variants -----------------------------------
  libraryItemId = (
    await alice`
      insert into public.library_items (workspace_id, name, type, owner_id, blocks, created_by)
      values (${w1}, 'Safety Notice', 'snippet', ${aliceId}, ${alice.json([{ type: 'paragraph' }])}, ${aliceId})
      returning id
    `
  )[0]!.id as string;
  await alice`
    insert into public.library_item_versions (workspace_id, library_item_id, blocks_snapshot, created_by)
    values (${w1}, ${libraryItemId}, ${alice.json([{ type: 'paragraph' }])}, ${aliceId})
  `;
  variantId = (
    await alice`
      insert into public.product_variants (workspace_id, product_id, name, slug, created_by)
      values (${w1}, ${productId}, '48V', '48v', ${aliceId}) returning id
    `
  )[0]!.id as string;
  await alice`
    insert into public.variant_deltas (workspace_id, variant_id, delta_type, component_id, created_by)
    values (${w1}, ${variantId}, 'COMPONENT_REMOVE', ${componentId}, ${aliceId})
  `;
});

afterAll(async () => {
  await alice?.end();
  await bob?.end();
  await admin?.end();
});

describe('every table is locked down by construction (H.2 meta-check)', () => {
  it('every public table has row-level security enabled', async () => {
    const unprotected = await admin`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
      order by c.relname
    `;
    expect(unprotected.map((r) => r.relname)).toEqual([]);
  });

  it('every workspace-scoped table carries a policy (deny-all tables aside)', async () => {
    const rows = await admin`
      select col.table_name
      from information_schema.columns col
      where col.table_schema = 'public' and col.column_name = 'workspace_id'
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = col.table_name
        )
      order by col.table_name
    `;
    const policyless = rows.map((r) => r.table_name as string);
    expect(policyless.filter((t) => !DENY_ALL_TABLES.has(t))).toEqual([]);
  });
});

describe('cross-workspace isolation — Phase 3/4 tables (H.2)', () => {
  it('B cannot read W1 collaboration rows (threads, comments, notifications)', async () => {
    expect(await bob`select * from public.comment_threads where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.comments where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.notifications where workspace_id = ${w1}`).toHaveLength(0);
  });

  it('B cannot read W1 publishing rows (snapshots, magic links)', async () => {
    expect(await bob`select * from public.published_snapshots where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.magic_links where workspace_id = ${w1}`).toHaveLength(0);
  });

  it('B cannot read W1 content-reuse rows (library items + versions)', async () => {
    expect(await bob`select * from public.library_items where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.library_item_versions where workspace_id = ${w1}`).toHaveLength(0);
  });

  it('B cannot read W1 variant rows (variants, deltas)', async () => {
    expect(await bob`select * from public.product_variants where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.variant_deltas where workspace_id = ${w1}`).toHaveLength(0);
  });

  it('B cannot read W1 analytics events', async () => {
    expect(await bob`select * from public.analytics_events where workspace_id = ${w1}`).toHaveLength(0);
  });

  it('B cannot insert into W1 (with-check) — comments, library items, variants', async () => {
    await expectDenied(
      () => bob`
        insert into public.library_items (workspace_id, name, type, created_by)
        values (${w1}, 'Injected', 'snippet', ${bobId})
      `,
    );
    await expectDenied(
      () => bob`
        insert into public.product_variants (workspace_id, product_id, name, slug, created_by)
        values (${w1}, ${productId}, 'Injected', 'injected', ${bobId})
      `,
    );
  });

  it('B cannot mutate W1 rows (zero rows affected)', async () => {
    const renamedVariant = await bob`update public.product_variants set name = 'pwned' where id = ${variantId}`;
    expect(renamedVariant.count).toBe(0);
    const renamedItem = await bob`update public.library_items set name = 'pwned' where id = ${libraryItemId}`;
    expect(renamedItem.count).toBe(0);
  });
});

describe('dynamic full sweep — no W1 rows leak across the tenant boundary (H.2)', () => {
  it('a second-workspace member sees zero of W1’s rows in every workspace-scoped table', async () => {
    const tables = (
      await admin`
        select distinct col.table_name
        from information_schema.columns col
        join information_schema.tables t
          on t.table_schema = col.table_schema and t.table_name = col.table_name
        where col.table_schema = 'public' and col.column_name = 'workspace_id'
          and t.table_type = 'BASE TABLE'
        order by col.table_name
      `
    ).map((r) => r.table_name as string);

    // Sanity: the sweep must actually cover the breadth of the schema.
    expect(tables.length).toBeGreaterThan(30);

    const leaks: string[] = [];
    for (const table of tables) {
      const rows = await bob.unsafe(
        `select count(*)::int as n from public."${table}" where workspace_id = $1`,
        [w1],
      );
      if ((rows[0]!.n as number) !== 0) leaks.push(`${table}=${rows[0]!.n}`);
    }
    expect(leaks).toEqual([]);
  });

  it('the owner DOES see W1’s seeded rows (the sweep is not vacuous)', async () => {
    const seeded = [
      'products',
      'spec_fields',
      'documents',
      'blocks',
      'comment_threads',
      'comments',
      'magic_links',
      'published_snapshots',
      'analytics_events',
      'library_items',
      'product_variants',
      'variant_deltas',
    ];
    const empty: string[] = [];
    for (const table of seeded) {
      const rows = await alice.unsafe(
        `select count(*)::int as n from public."${table}" where workspace_id = $1`,
        [w1],
      );
      if ((rows[0]!.n as number) < 1) empty.push(table);
    }
    expect(empty).toEqual([]);
  });
});
