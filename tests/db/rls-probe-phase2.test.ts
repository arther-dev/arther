import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G8.3 — the second-user RLS probe (F8.1) extended to the Phase-2 tables
 * (IMPLEMENTATION_PLAN.md §8.4). User B in W2 can neither read nor mutate W1's
 * documents, revisions, blocks, block→spec references, or the action-dashboard /
 * domain-ownership rows. Per-feature probes already cover each table; this is the
 * consolidated cross-tenant gate over the document + tracking spine.
 */

let admin: Sql;
let alice: Sql; // owner of W1
let bob: Sql; // owner of W2 — the hostile second user
let aliceId: string;
let bobId: string;
let w1: string;
let documentId: string;
let revisionId: string;
let blockId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  aliceId = await createAuthUser(admin, `p2-alice-${run}@example.com`);
  bobId = await createAuthUser(admin, `p2-bob-${run}@example.com`);
  alice = await userClient(aliceId);
  bob = await userClient(bobId);

  w1 = (await alice`select public.create_workspace('W1', ${uniqueSlug('p2')}) as id`)[0]!.id as string;
  await bob`select public.create_workspace('W2', ${uniqueSlug('p2x')})`;

  const productId = (
    await alice`
      insert into public.products (workspace_id, name, created_by)
      values (${w1}, 'Servo Drive S2', ${aliceId}) returning id
    `
  )[0]!.id as string;
  const fieldId = (
    await alice`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${w1}, ${productId}, 'Rated voltage', 'scalar', 'Electrical', ${aliceId}) returning id
    `
  )[0]!.id as string;
  const fieldV1 = (
    await alice`select public.update_spec_field_value(${fieldId}, ${alice.json({ value: 36, unit_id: null })}, 'v1') as id`
  )[0]!.id as string;

  // A built-in Document Type (workspace_id null) is a valid documents.document_type_id (0004 seed).
  const documentTypeId = (
    await alice`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;

  documentId = (
    await alice`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${w1}, ${productId}, ${documentTypeId}, 'Secret Guide', 'secret', ${aliceId}, ${aliceId})
      returning id
    `
  )[0]!.id as string;
  revisionId = (
    await alice`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${w1}, ${documentId}, 1, 'draft', ${aliceId}) returning id
    `
  )[0]!.id as string;
  blockId = (
    await alice`
      insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
      values (${w1}, ${documentId}, ${revisionId}, 'paragraph', 0, 'manual', ${alice.json({ type: 'paragraph', content: { alignment: 'left', nodes: [] } })}, ${aliceId})
      returning id
    `
  )[0]!.id as string;
  await alice`
    insert into public.block_spec_references (workspace_id, block_id, document_id, field_id, field_version_id)
    values (${w1}, ${blockId}, ${documentId}, ${fieldId}, ${fieldV1})
  `;

  // Tracking spine: an action-dashboard item (editor write) + a domain owner (admin write).
  await alice`
    insert into public.dashboard_action_items (workspace_id, type, assigned_to, reference_id, title)
    values (${w1}, 'section_review', ${aliceId}, ${crypto.randomUUID()}, 'Review the Electrical section')
  `;
  await alice`
    insert into public.domain_ownership_config (workspace_id, field_category, owner_user_id, set_by)
    values (${w1}, 'Electrical', ${aliceId}, ${aliceId})
  `;
});

afterAll(async () => {
  await alice?.end();
  await bob?.end();
  await admin?.end();
});

describe('cross-workspace isolation — Phase 2 tables (G8.3)', () => {
  it('B cannot read W1 documents / revisions / blocks / spec references', async () => {
    expect(await bob`select * from public.documents where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.document_revisions where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.blocks where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.block_spec_references where workspace_id = ${w1}`).toHaveLength(0);
  });

  it('B cannot read W1 action items or domain-ownership config', async () => {
    expect(await bob`select * from public.dashboard_action_items where workspace_id = ${w1}`).toHaveLength(0);
    expect(await bob`select * from public.domain_ownership_config where workspace_id = ${w1}`).toHaveLength(0);
  });

  it('B cannot mutate W1 blocks (zero rows affected) or insert into W1 (with-check)', async () => {
    const edited = await bob`update public.blocks set display_order = 99 where id = ${blockId}`;
    expect(edited.count).toBe(0);
    await expectDenied(
      () => bob`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
        values (${w1}, ${documentId}, ${revisionId}, 'paragraph', 1, 'manual', ${bob.json({ type: 'paragraph', content: { alignment: 'left', nodes: [] } })}, ${bobId})
      `,
    );
  });
});
