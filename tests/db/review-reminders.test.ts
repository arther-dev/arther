import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * C3.6 probe — the review-reminder job's selection query (the rest is pure
 * `computeReviewReminders`, unit-tested, + already-probed dispatch). The daily
 * job considers only in-review documents whose due date is yesterday or today
 * (UTC); a draft, or a far-future due date, is left out.
 */
let admin: Sql;
let owner: Sql;
let ownerId: string;
let ws: string;
let documentId: string;

beforeAll(async () => {
  admin = adminClient();
  ownerId = await createAuthUser(admin, `rr-owner-${crypto.randomUUID().slice(0, 8)}@example.com`);
  owner = await userClient(ownerId);
  ws = (await owner`select public.create_workspace('Reminder Co', ${uniqueSlug('rmd')}) as id`)[0]!
    .id as string;
  const productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Gadget', ${ownerId}) returning id`
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Gadget Manual', 'gadget', ${ownerId}, ${ownerId})
      returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await admin?.end();
});

function selectDue(client: Sql) {
  // Mirrors runReviewReminders' window: in-review, due in [yesterday, tomorrow).
  return client`
    select dr.id from public.document_revisions dr
    join public.documents d on d.id = dr.document_id
    where dr.state = 'review' and dr.review_due_date is not null
      and dr.review_due_date >= date_trunc('day', now()) - interval '1 day'
      and dr.review_due_date <  date_trunc('day', now()) + interval '1 day'
      and d.id = ${documentId}
  `;
}

describe('reminder selection (C3.6)', () => {
  it('selects an in-review document due today, and skips drafts and far-future due dates', async () => {
    // `now()` / the interval are literal SQL in the template (not parameters).
    const today = (
      await owner`
        insert into public.document_revisions (workspace_id, document_id, revision_number, state, review_due_date, created_by)
        values (${ws}, ${documentId}, 501, 'review', now(), ${ownerId}) returning id
      `
    )[0]!.id as string;
    await owner`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, review_due_date, created_by)
      values (${ws}, ${documentId}, 502, 'draft', now(), ${ownerId})
    `; // wrong state
    await owner`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, review_due_date, created_by)
      values (${ws}, ${documentId}, 503, 'review', now() + interval '30 days', ${ownerId})
    `; // outside the window

    const selected = (await selectDue(admin)).map((r) => r.id);
    expect(selected).toContain(today);
    expect(selected).toHaveLength(1);
  });
});
