import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * V.9 probes — per-variant publishing (migration 0028). `publish_document` gains
 * `p_variant_id`: a variant freezes its own `published_snapshots` row, versioned
 * on its own line, independent of the base publication and of sibling variants.
 * The two partial unique indexes keep the base line (variant_id IS NULL) distinct
 * from each variant line. Member-read / stranger-isolated like every snapshot.
 */

let admin: Sql;
let editor: Sql;
let stranger: Sql;
let editorId: string;
let strangerId: string;
let ws: string;
let productId: string;
let documentId: string;
let rev1: string;
let variantEu: string;
let variantUs: string;
// A second product (+ its own variant) to prove the cross-product guard.
let otherProductId: string;
let otherVariant: string;
let draftDocId: string;
let draftRev: string;

const blockTree = [{ type: 'paragraph', content: { alignment: 'left', nodes: [] } }];

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `var-editor-${run}@example.com`);
  strangerId = await createAuthUser(admin, `var-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Variant Co', ${uniqueSlug('var')}) as id`)[0]!
    .id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('varx')})`;

  productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Relay R1', ${editorId}) returning id
    `
  )[0]!.id as string;
  const docTypeId = (
    await editor`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;

  documentId = (
    await editor`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Relay Datasheet', 'relay', ${editorId}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  rev1 = (
    await editor`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'approved', ${editorId}) returning id
    `
  )[0]!.id as string;
  await editor`update public.documents set current_revision_id = ${rev1} where id = ${documentId}`;

  variantEu = (
    await editor`
      insert into public.product_variants (workspace_id, product_id, name, slug, is_default, created_by)
      values (${ws}, ${productId}, 'EU', 'eu', true, ${editorId}) returning id
    `
  )[0]!.id as string;
  variantUs = (
    await editor`
      insert into public.product_variants (workspace_id, product_id, name, slug, created_by)
      values (${ws}, ${productId}, 'US', 'us', ${editorId}) returning id
    `
  )[0]!.id as string;

  // A second product, its own variant, and a draft document for the guards.
  otherProductId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Relay R2', ${editorId}) returning id
    `
  )[0]!.id as string;
  otherVariant = (
    await editor`
      insert into public.product_variants (workspace_id, product_id, name, slug, created_by)
      values (${ws}, ${otherProductId}, 'Other', 'other', ${editorId}) returning id
    `
  )[0]!.id as string;
  draftDocId = (
    await editor`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${otherProductId}, ${docTypeId}, 'R2 Draft', 'r2', ${editorId}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  draftRev = (
    await editor`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${draftDocId}, 1, 'draft', ${editorId}) returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await editor?.end();
  await stranger?.end();
  await admin?.end();
});

describe('publish_document with a variant (V.9)', () => {
  it('base publish stamps variant_id NULL and flips the revision', async () => {
    const snapId = (
      await admin`select public.publish_document(${rev1}, ${editorId}, ${admin.json(blockTree)}, '{}'::jsonb, 'base') as id`
    )[0]!.id as string;
    const snap = await admin`select version, variant_id from public.published_snapshots where id = ${snapId}`;
    expect(snap[0]!.version).toBe('1.0');
    expect(snap[0]!.variant_id).toBeNull();
    const rev = await admin`select state from public.document_revisions where id = ${rev1}`;
    expect(rev[0]!.state).toBe('published');
  });

  it('a variant publishes its own snapshot on its own version line, leaving the revision untouched', async () => {
    const snapId = (
      await admin`select public.publish_document(${rev1}, ${editorId}, ${admin.json(blockTree)}, '{}'::jsonb, 'eu', ${variantEu}) as id`
    )[0]!.id as string;
    const snap = await admin`select version, variant_id from public.published_snapshots where id = ${snapId}`;
    // Base is already at 1.0, but the variant line sequences independently → also 1.0.
    expect(snap[0]!.version).toBe('1.0');
    expect(snap[0]!.variant_id).toBe(variantEu);
    // The base revision lifecycle is unchanged by a variant publish.
    const rev = await admin`select state from public.document_revisions where id = ${rev1}`;
    expect(rev[0]!.state).toBe('published');
  });

  it('republishing a variant increments only that variant’s version line', async () => {
    const snapId = (
      await admin`select public.publish_document(${rev1}, ${editorId}, ${admin.json(blockTree)}, '{}'::jsonb, 'eu2', ${variantEu}) as id`
    )[0]!.id as string;
    const snap = await admin`select version from public.published_snapshots where id = ${snapId}`;
    expect(snap[0]!.version).toBe('2.0');
    // A different variant starts its own line at 1.0; base stays at 1.0.
    const usId = (
      await admin`select public.publish_document(${rev1}, ${editorId}, ${admin.json(blockTree)}, '{}'::jsonb, 'us', ${variantUs}) as id`
    )[0]!.id as string;
    const us = await admin`select version from public.published_snapshots where id = ${usId}`;
    expect(us[0]!.version).toBe('1.0');
    const base = await admin`
      select max(version) as v from public.published_snapshots where document_id = ${documentId} and variant_id is null`;
    expect(base[0]!.v).toBe('1.0');
  });

  it('rejects a variant that does not belong to the document’s product', async () => {
    const msg = await expectDenied(
      () => admin`select public.publish_document(${rev1}, ${editorId}, ${admin.json(blockTree)}, '{}'::jsonb, 'x', ${otherVariant})`,
    );
    expect(msg).toMatch(/belong/i);
  });

  it('refuses to publish a variant before the base document has cleared approval', async () => {
    const msg = await expectDenied(
      () => admin`select public.publish_document(${draftRev}, ${editorId}, ${admin.json(blockTree)}, '{}'::jsonb, 'x', ${otherVariant})`,
    );
    expect(msg).toMatch(/before publishing a variant/i);
  });
});

describe('variant-scoped version uniqueness (partial indexes)', () => {
  it('keeps the base line and each variant line independent, but unique within a line', async () => {
    const insert = (variantId: string | null, version: string) =>
      admin`
        insert into public.published_snapshots (workspace_id, document_id, product_id, variant_id, version, block_tree, published_by)
        values (${ws}, ${documentId}, ${productId}, ${variantId}, ${version}, ${admin.json(blockTree)}, ${editorId})
      `;
    // A fresh version label across lines: base + two variants may all hold it.
    await insert(null, '9.0');
    await insert(variantEu, '9.0');
    await insert(variantUs, '9.0');
    // But a second base 9.0 and a second EU 9.0 each collide on their own line.
    expect(await expectDenied(() => insert(null, '9.0'))).toMatch(/duplicate|unique/i);
    expect(await expectDenied(() => insert(variantEu, '9.0'))).toMatch(/duplicate|unique/i);
  });
});

describe('immutability + isolation', () => {
  it('variant_id is frozen on a published snapshot', async () => {
    const msg = await expectDenied(
      () => admin`
        update public.published_snapshots set variant_id = ${variantUs}
        where document_id = ${documentId} and variant_id = ${variantEu} and version = '1.0'
      `,
    );
    expect(msg).toMatch(/frozen/i);
  });

  it('members read variant snapshots; strangers in another workspace see none', async () => {
    const seen = await editor`
      select id from public.published_snapshots where document_id = ${documentId} and variant_id = ${variantEu}`;
    expect(seen.length).toBeGreaterThan(0);
    const hidden = await stranger`
      select id from public.published_snapshots where document_id = ${documentId} and variant_id is not null`;
    expect(hidden).toHaveLength(0);
  });
});

describe('base/variant publication independence', () => {
  it('archiving the base line (variant_id IS NULL) leaves variant snapshots live', async () => {
    // Mirror archiveDocumentSnapshots' base-scoped WHERE.
    const archived = await admin`
      update public.published_snapshots set archived_at = now()
      where document_id = ${documentId} and variant_id is null and archived_at is null
      returning id`;
    expect(archived.length).toBeGreaterThan(0);
    const variantLive = await admin`
      select count(*)::int as n from public.published_snapshots
      where document_id = ${documentId} and variant_id = ${variantEu} and archived_at is null`;
    expect(variantLive[0]!.n).toBeGreaterThan(0); // a variant page is untouched by base unpublish
    // Restore the base line back so later assertions hold.
    await admin`
      update public.published_snapshots set archived_at = null
      where document_id = ${documentId} and variant_id is null`;
  });
});

describe('variant deletion is RESTRICTed by publication history (V.9, finding 1)', () => {
  it('refuses to hard-delete a variant that has ever published (FK restrict, not a freeze-guard error)', async () => {
    const msg = await expectDenied(
      () => admin`delete from public.product_variants where id = ${variantEu}`,
    );
    expect(msg).toMatch(/foreign key|still referenced|restrict/i);
    expect(msg).not.toMatch(/frozen/i); // the old SET NULL behaviour aborted with the freeze guard
  });

  it('allows hard-deleting a never-published variant', async () => {
    const deleted = await admin`delete from public.product_variants where id = ${otherVariant} returning id`;
    expect(deleted).toHaveLength(1);
  });
});
