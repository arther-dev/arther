import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, anonClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * C9.2 — portal isolation. The portal serves anonymous web visitors. Its data
 * path is the SERVICE client (BYPASSRLS) constrained to published, public,
 * non-archived snapshots — never drafts, never the spec database, never another
 * workspace. This probe verifies the defence-in-depth boundary: an anonymous
 * connection (the portal visitor's worst case) can read NOTHING directly — not
 * snapshots, not draft revisions/blocks, not spec fields — and that a published
 * snapshot is self-contained (block tree + resolution baked in), so serving it
 * needs no read of the live spec graph or the working copy.
 */
let admin: Sql;
let owner: Sql;
let anon: Sql;
let ownerId: string;
let snapshotId: string;

const paragraph = { type: 'paragraph', content: { alignment: 'left', nodes: [] } };
const blockTree = [paragraph];

beforeAll(async () => {
  admin = adminClient();
  ownerId = await createAuthUser(admin, `iso-owner-${crypto.randomUUID().slice(0, 8)}@example.com`);
  owner = await userClient(ownerId);
  anon = await anonClient();

  const ws = (await owner`select public.create_workspace('Portal Iso', ${uniqueSlug('iso')}) as id`)[0]!
    .id as string;
  const productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Relay', ${ownerId}) returning id`
  )[0]!.id as string;
  // A spec field (the kind of data that must never leak to the portal).
  await owner`
    insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
    values (${ws}, ${productId}, 'Voltage', 'scalar', 'Electrical', ${ownerId})
  `;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  const documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Relay Spec', 'relay', ${ownerId}, ${ownerId}) returning id
    `
  )[0]!.id as string;
  const rev = (
    await owner`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'approved', ${ownerId}) returning id
    `
  )[0]!.id as string;
  // A draft block (working copy) — must also be invisible to the portal visitor.
  await owner`
    insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
    values (${ws}, ${documentId}, ${rev}, 'paragraph', 1, 'manual', ${owner.json(paragraph)}, ${ownerId})
  `;
  snapshotId = (
    await admin`select public.publish_document(${rev}, ${ownerId}, ${admin.json(blockTree)}, '{"Voltage":"36 V"}'::jsonb, 'relay spec') as id`
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await anon?.end();
  await admin?.end();
});

describe('the anonymous boundary is fully fenced (C9.2)', () => {
  it('anon reads nothing — not snapshots, drafts, blocks, spec fields, or docs', async () => {
    // Each table holds real rows; anon (no membership) sees none of them.
    expect(await anon`select id from public.published_snapshots`).toHaveLength(0);
    expect(await anon`select id from public.document_revisions`).toHaveLength(0);
    expect(await anon`select id from public.blocks`).toHaveLength(0);
    expect(await anon`select id from public.spec_fields`).toHaveLength(0);
    expect(await anon`select id from public.documents`).toHaveLength(0);
    expect(await anon`select id from public.products`).toHaveLength(0);
  });

  it('anon cannot insert a snapshot either (no forged publications)', async () => {
    // anon has table grants but RLS has no anon policy → with-check denies.
    let denied = false;
    try {
      await anon`
        insert into public.published_snapshots (workspace_id, document_id, version, block_tree, resolution_manifest, published_by)
        values (gen_random_uuid(), gen_random_uuid(), '1.0', '[]'::jsonb, '{}'::jsonb, ${ownerId})
      `;
    } catch {
      denied = true;
    }
    expect(denied).toBe(true);
  });
});

describe('published snapshots are self-contained (C9.2)', () => {
  it('the snapshot carries its block tree + resolved spec values (no live-spec read at serve time)', async () => {
    const snap = (
      await admin`select block_tree, resolution_manifest from public.published_snapshots where id = ${snapshotId}`
    )[0]!;
    expect((snap.block_tree as unknown[]).length).toBeGreaterThan(0);
    // The resolution manifest baked the spec value in at publish — the portal
    // never touches spec_fields to render this.
    expect(snap.resolution_manifest as Record<string, unknown>).toMatchObject({ Voltage: '36 V' });
  });
});
