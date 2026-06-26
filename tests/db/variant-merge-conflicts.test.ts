import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * V.6 probes — the variant merge-conflict ledger (migration 0029). The V.5 task
 * records conflicts (service role); members read them under RLS; editors resolve;
 * the publish path counts open BLOCKING conflicts to gate publication; strangers
 * in another workspace are isolated.
 */

let admin: Sql;
let owner: Sql;
let stranger: Sql;
let ownerId: string;
let strangerId: string;
let ws: string;
let documentId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `mc-owner-${run}@example.com`);
  strangerId = await createAuthUser(admin, `mc-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Conflict Co', ${uniqueSlug('mc')}) as id`)[0]!
    .id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('mcx')})`;

  const productId = (
    await owner`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Relay R1', ${ownerId}) returning id
    `
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Relay Datasheet', 'relay', ${ownerId}, ${ownerId})
      returning id
    `
  )[0]!.id as string;

  // Seed two conflicts: one non-blocking (Path A), one blocking (Path B).
  await admin`
    insert into public.block_merge_conflicts
      (workspace_id, document_id, section_name, position, versions, blocking, created_by)
    values
      (${ws}, ${documentId}, 'Overview', 0,
        ${admin.json([{ variant_id: '11111111-1111-1111-1111-111111111111', block_id: '22222222-2222-2222-2222-222222222222' }])},
        false, ${ownerId}),
      (${ws}, ${documentId}, 'Safety', 1, '[]'::jsonb, true, ${ownerId})
  `;
});

afterAll(async () => {
  await owner?.end();
  await stranger?.end();
  await admin?.end();
});

describe('block_merge_conflicts', () => {
  it('a member reads the document’s conflicts; a stranger sees none', async () => {
    const seen = await owner`select id, blocking from public.block_merge_conflicts where document_id = ${documentId}`;
    expect(seen).toHaveLength(2);
    const hidden = await stranger`select id from public.block_merge_conflicts where document_id = ${documentId}`;
    expect(hidden).toHaveLength(0);
  });

  it('the publish gate counts only OPEN BLOCKING conflicts', async () => {
    const n = (
      await owner`
        select count(*)::int as n from public.block_merge_conflicts
        where document_id = ${documentId} and status = 'open' and blocking = true`
    )[0]!.n as number;
    expect(n).toBe(1);
  });

  it('an editor resolves a conflict; it leaves the open set', async () => {
    const open = await owner`
      select id from public.block_merge_conflicts where document_id = ${documentId} and status = 'open' and blocking = false`;
    expect(open).toHaveLength(1);
    await owner`
      update public.block_merge_conflicts
      set status = 'resolved', resolution = 'keep_both', resolved_by = ${ownerId}, resolved_at = now()
      where id = ${open[0]!.id}`;
    const stillOpen = await owner`
      select id from public.block_merge_conflicts where document_id = ${documentId} and status = 'open'`;
    expect(stillOpen).toHaveLength(1); // only the blocking one remains
  });

  it('a stranger cannot insert a conflict into another workspace (RLS with-check)', async () => {
    await expectDenied(
      () => stranger`
        insert into public.block_merge_conflicts (workspace_id, document_id, section_name, position, blocking, created_by)
        values (${ws}, ${documentId}, 'x', 0, true, ${strangerId})
      `,
    );
  });

  it('rejects an unknown status (CHECK constraint)', async () => {
    const msg = await expectDenied(
      () => admin`
        update public.block_merge_conflicts set status = 'bogus' where document_id = ${documentId}
      `,
    );
    expect(msg).toMatch(/check|constraint|invalid/i);
  });
});
