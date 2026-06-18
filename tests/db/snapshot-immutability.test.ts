import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * C9.1 — published-snapshot immutability. The publish history is the compliance
 * artifact, so a frozen snapshot's CONTENT columns reject updates (the
 * `guard_snapshot_frozen` trigger, 0008) and snapshots are never deleted
 * (`prevent_mutation`). Only the operational columns mutate — `pdf_ready` (C5),
 * `access_config` (C7), `archived_at` (unpublish, C4.6). The guard fires for the
 * service role too, so this probes via the admin client.
 */
let admin: Sql;
let owner: Sql;
let ownerId: string;
let snapshotId: string;

const blockTree = [{ type: 'paragraph', content: { alignment: 'left', nodes: [] } }];

beforeAll(async () => {
  admin = adminClient();
  ownerId = await createAuthUser(admin, `imm-owner-${crypto.randomUUID().slice(0, 8)}@example.com`);
  owner = await userClient(ownerId);
  const ws = (await owner`select public.create_workspace('Immutable Co', ${uniqueSlug('imm')}) as id`)[0]!
    .id as string;
  const productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Unit', ${ownerId}) returning id`
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  const documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Unit Spec', 'unit', ${ownerId}, ${ownerId}) returning id
    `
  )[0]!.id as string;
  const rev = (
    await owner`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'approved', ${ownerId}) returning id
    `
  )[0]!.id as string;
  snapshotId = (
    await admin`select public.publish_document(${rev}, ${ownerId}, ${admin.json(blockTree)}, '{}'::jsonb, 'unit spec') as id`
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await admin?.end();
});

describe('content columns are frozen (C9.1)', () => {
  it('rejects edits to block_tree, resolution_manifest, version, document_id, published_by', async () => {
    const frozen = async (run: () => Promise<unknown>) =>
      expect(await expectDenied(run)).toMatch(/frozen/i);

    await frozen(() => admin`update public.published_snapshots set block_tree = '[]'::jsonb where id = ${snapshotId}`);
    await frozen(
      () => admin`update public.published_snapshots set resolution_manifest = '{"x":1}'::jsonb where id = ${snapshotId}`,
    );
    await frozen(() => admin`update public.published_snapshots set version = '9.9' where id = ${snapshotId}`);
    await frozen(
      () => admin`update public.published_snapshots set document_id = gen_random_uuid() where id = ${snapshotId}`,
    );
    await frozen(
      () => admin`update public.published_snapshots set published_by = null where id = ${snapshotId}`,
    );
  });

  it('snapshots are never deleted (publish history is immutable)', async () => {
    expect(await expectDenied(() => admin`delete from public.published_snapshots where id = ${snapshotId}`)).toMatch(
      /immutable|cannot|delete/i,
    );
  });
});

describe('operational columns still mutate (C9.1)', () => {
  it('allows pdf_ready, access_config, and archived_at', async () => {
    await admin`update public.published_snapshots set pdf_ready = true where id = ${snapshotId}`;
    await admin`update public.published_snapshots set access_config = '{"access":"link"}'::jsonb where id = ${snapshotId}`;
    await admin`update public.published_snapshots set archived_at = now() where id = ${snapshotId}`;
    const row = (
      await admin`select pdf_ready, access_config, archived_at from public.published_snapshots where id = ${snapshotId}`
    )[0]!;
    expect(row.pdf_ready).toBe(true);
    expect((row.access_config as { access: string }).access).toBe('link');
    expect(row.archived_at).not.toBeNull();
  });
});
