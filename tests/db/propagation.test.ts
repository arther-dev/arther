import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G6.2 probes — two-speed propagation write surface. The classification + token
 * rewrite are unit-tested in `@arther/types`; this proves the SQL-level
 * invariants the propagation task (service role) leans on:
 *   • advancing a `block_spec_references` anchor clears the G6.1 staleness join
 *     (the structured speed's net effect);
 *   • `field_change_diffs` + `document_review_states` are service-role-write-only
 *     (members read; authenticated writes denied) — so propagation MUST run as
 *     the service role;
 *   • a `section_review_items` row routes to its assigned owner and is readable
 *     by members, with a `dashboard_action_items` row alongside it;
 *   • a published snapshot's content is frozen (invariant 5 / G6.7) — propagation
 *     writes only to the working copy and can never mutate a snapshot.
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
let documentId: string;
let revisionId: string;
let blockId: string;
let fieldId: string;
let v1: string;
let v2: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `pg-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `pg-member-${run}@example.com`);
  strangerId = await createAuthUser(admin, `pg-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Propagate', ${uniqueSlug('pg')}) as id`)[0]!.id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('pgx')})`;

  productId = (
    await owner`insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Inverter X', ${ownerId}) returning id`
  )[0]!.id as string;
  const documentTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;

  documentId = (
    await owner`insert into public.documents
        (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${documentTypeId}, 'Datasheet', 'datasheet', ${ownerId}, ${ownerId})
      returning id`
  )[0]!.id as string;
  revisionId = (
    await owner`insert into public.document_revisions
        (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'draft', ${ownerId}) returning id`
  )[0]!.id as string;
  await owner`update public.documents set current_revision_id = ${revisionId} where id = ${documentId}`;

  fieldId = (
    await owner`insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${productId}, 'Rated voltage', 'scalar', 'Electrical', ${ownerId}) returning id`
  )[0]!.id as string;
  v1 = (
    await owner`select public.update_spec_field_value(${fieldId}, ${owner.json({ value: 36, unit_id: null })}, 'v1') as id`
  )[0]!.id as string;

  // A prose block citing the field at v1, plus its reference anchor.
  const para = {
    type: 'paragraph',
    content: {
      alignment: 'left',
      nodes: [
        { type: 'text', text: 'Rated at ', marks: [] },
        { type: 'spec_token', field_id: fieldId, field_version_id: v1, display_value: '36', unit_id: null, product_id: productId, component_id: null },
      ],
    },
  };
  blockId = (
    await owner`insert into public.blocks
        (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
      values (${ws}, ${documentId}, ${revisionId}, 'paragraph', 0, 'spec', ${owner.json(para)}, ${ownerId})
      returning id`
  )[0]!.id as string;
  await owner`insert into public.block_spec_references
      (workspace_id, block_id, document_id, field_id, field_version_id)
    values (${ws}, ${blockId}, ${documentId}, ${fieldId}, ${v1})`;

  // The value moves on → the reference is now stale.
  v2 = (
    await owner`select public.update_spec_field_value(${fieldId}, ${owner.json({ value: 48, unit_id: null })}, 'v2') as id`
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await member?.end();
  await stranger?.end();
  await admin?.end();
});

const staleCount = (sql: Sql) => sql`
  select count(*)::int as n
  from public.block_spec_references bsr
  join public.spec_fields sf on sf.id = bsr.field_id
  where bsr.document_id = ${documentId} and bsr.field_version_id <> sf.current_version_id
`;

describe('two-speed propagation (G6.2)', () => {
  it('advancing the reference anchor clears the staleness join (structured speed)', async () => {
    expect(v2).not.toBe(v1);
    expect((await staleCount(owner))[0]!.n).toBe(1); // stale before propagation

    await admin`update public.block_spec_references
       set field_version_id = ${v2} where block_id = ${blockId} and field_id = ${fieldId}`;

    expect((await staleCount(owner))[0]!.n).toBe(0); // cleared after
  });

  it('field_change_diffs is service-role-write-only (members read, authenticated writes denied)', async () => {
    await expectDenied(
      () => owner`insert into public.field_change_diffs
          (workspace_id, field_id, new_version_id, old_display_value, new_display_value, changed_by)
        values (${ws}, ${fieldId}, ${v2}, '36', '48', ${ownerId})`,
    );
    await admin`insert into public.field_change_diffs
        (workspace_id, field_id, field_name, new_version_id, old_display_value, new_display_value, changed_by)
      values (${ws}, ${fieldId}, 'Rated voltage', ${v2}, '36', '48', ${ownerId})`;
    const seen = await member`select new_display_value from public.field_change_diffs where field_id = ${fieldId}`;
    expect(seen[0]!.new_display_value).toBe('48');
  });

  it('document_review_states is service-role-written; needs_review is visible to members', async () => {
    await expectDenied(
      () => owner`insert into public.document_review_states (workspace_id, document_id, state)
        values (${ws}, ${documentId}, 'needs_review')`,
    );
    await admin`insert into public.document_review_states
        (workspace_id, document_id, state, triggered_at, triggered_by_field_ids)
      values (${ws}, ${documentId}, 'needs_review', now(), ${admin.json([fieldId])})`;
    const state = await member`select state from public.document_review_states where document_id = ${documentId}`;
    expect(state[0]!.state).toBe('needs_review');
  });

  it('a section review item routes to its owner with a dashboard item, readable by members', async () => {
    const item = (
      await admin`insert into public.section_review_items
          (workspace_id, document_id, section_name, field_category, assigned_to, affected_block_ids)
        values (${ws}, ${documentId}, 'Datasheet', 'Electrical', ${memberId}, ${admin.json([blockId])})
        returning id`
    )[0]!.id as string;
    await admin`insert into public.dashboard_action_items
        (workspace_id, type, assigned_to, reference_id, title, document_id)
      values (${ws}, 'section_review', ${memberId}, ${item}, 'Review "Datasheet" — Rated voltage changed', ${documentId})`;

    const reviews = await member`select assigned_to from public.section_review_items where document_id = ${documentId}`;
    expect(reviews[0]!.assigned_to).toBe(memberId);
    const actions = await member`select type from public.dashboard_action_items where assigned_to = ${memberId}`;
    expect(actions[0]!.type).toBe('section_review');
    // A stranger sees neither.
    expect(await stranger`select 1 from public.section_review_items where document_id = ${documentId}`).toHaveLength(0);
  });

  it('a published snapshot is frozen — propagation can never mutate snapshot content (G6.7)', async () => {
    await admin`insert into public.published_snapshots
        (workspace_id, document_id, product_id, version, block_tree, published_by)
      values (${ws}, ${documentId}, ${productId}, '1.0', ${admin.json([{ id: blockId, type: 'paragraph' }])}, ${ownerId})`;
    const message = await expectDenied(
      () => admin`update public.published_snapshots set block_tree = ${admin.json([])} where document_id = ${documentId}`,
    );
    expect(message).toMatch(/frozen/i);
  });
});
