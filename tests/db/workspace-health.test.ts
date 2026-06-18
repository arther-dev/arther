import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * A.7 — workspace operational-health metrics (0026): generation success,
 * approval rejection rate, and the live stale-document count (a spec reference
 * behind the field's current version). Locks the aggregates and the
 * SECURITY-INVOKER RLS scoping (a stranger sees zeros).
 */

let admin: Sql;
let owner: Sql;
let stranger: Sql;
let ownerId: string;
let ws: string;
let revisionId: string;

const paragraph = { type: 'paragraph', content: { alignment: 'left', nodes: [] } };

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `wh-owner-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `wh-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Health Co', ${uniqueSlug('whc')}) as id`)[0]!
    .id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('whx')})`;

  const productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Widget', ${ownerId}) returning id`
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  const documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Guide', 'guide', ${ownerId}, ${ownerId}) returning id
    `
  )[0]!.id as string;
  revisionId = (
    await owner`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'draft', ${ownerId}) returning id
    `
  )[0]!.id as string;
  const blockId = (
    await owner`
      insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
      values (${ws}, ${documentId}, ${revisionId}, 'paragraph', 0, 'manual', ${owner.json(paragraph)}, ${ownerId})
      returning id
    `
  )[0]!.id as string;

  // A versioned field referenced at v1; then bumped to v2 → the reference is stale.
  const fieldId = (
    await owner`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${productId}, 'Rated voltage', 'scalar', 'Electrical', ${ownerId}) returning id
    `
  )[0]!.id as string;
  const v1 = (
    await owner`select public.update_spec_field_value(${fieldId}, ${owner.json({ value: 36, unit_id: null })}, 'v1') as id`
  )[0]!.id as string;
  await owner`
    insert into public.block_spec_references (workspace_id, block_id, document_id, field_id, field_version_id)
    values (${ws}, ${blockId}, ${documentId}, ${fieldId}, ${v1})
  `;
  await owner`select public.update_spec_field_value(${fieldId}, ${owner.json({ value: 48, unit_id: null })}, 'v2')`;

  // Generation runs: 2 succeeded, 1 failed, 1 still queued (non-terminal, excluded).
  await admin`
    insert into public.generation_runs (workspace_id, product_id, document_type_id, status)
    values
      (${ws}, ${productId}, ${docTypeId}, 'succeeded'),
      (${ws}, ${productId}, ${docTypeId}, 'succeeded'),
      (${ws}, ${productId}, ${docTypeId}, 'failed'),
      (${ws}, ${productId}, ${docTypeId}, 'queued')
  `;
  // Approval decisions: 2 approved, 1 rejected, 1 owner_override (excluded from the rate).
  await admin`
    insert into public.approval_records (workspace_id, revision_id, action, reason)
    values
      (${ws}, ${revisionId}, 'approved', null),
      (${ws}, ${revisionId}, 'approved', null),
      (${ws}, ${revisionId}, 'rejected', 'needs work'),
      (${ws}, ${revisionId}, 'owner_override', 'shipping')
  `;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), stranger.end()]);
});

describe('workspace_health (A.7)', () => {
  it('aggregates generation, rejection, and stale-document health', async () => {
    const h = (await owner`select * from public.workspace_health(${ws})`)[0]!;
    expect(Number(h.generations_total)).toBe(3); // queued excluded
    expect(Number(h.generations_succeeded)).toBe(2);
    expect(Number(h.generations_failed)).toBe(1);
    expect(Number(h.approvals_total)).toBe(3); // owner_override excluded
    expect(Number(h.approvals_rejected)).toBe(1);
    expect(Number(h.stale_documents)).toBe(1);
  });

  it('a stranger in another tenant sees zeros (RLS scopes every source)', async () => {
    const h = (await stranger`select * from public.workspace_health(${ws})`)[0]!;
    expect(Number(h.generations_total)).toBe(0);
    expect(Number(h.approvals_total)).toBe(0);
    expect(Number(h.stale_documents)).toBe(0);
  });
});
