import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * A — the `workspace_review_cycle_times` aggregate (0027). A review cycle is the
 * span from a revision entering Review (the latest `document_state_changed` event
 * with payload to='review' before the decision) to its approval/rejection in
 * `approval_records`. Locks: the duration pairing, the approve/reject split, that a
 * decision with no preceding submit event is not measured, and SECURITY INVOKER
 * (a stranger in another tenant sees zero, never another workspace's reviews).
 */

let admin: Sql;
let owner: Sql;
let stranger: Sql;
let ownerId: string;
let ws: string;
let revisionId: string;
let documentId: string;

const cycleTimes = async (client: Sql, workspace: string) => {
  const row = (await client`select * from public.workspace_review_cycle_times(${workspace})`)[0]!;
  return {
    reviewsMeasured: Number(row.reviews_measured),
    approvals: Number(row.approvals),
    rejections: Number(row.rejections),
    avgHours: row.avg_hours_to_decision == null ? null : Number(row.avg_hours_to_decision),
    medianHours: row.median_hours_to_decision == null ? null : Number(row.median_hours_to_decision),
  };
};

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `rct-owner-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `rct-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Review Co', ${uniqueSlug('rct')}) as id`)[0]!
    .id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('rctx')})`;

  const productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Widget', ${ownerId}) returning id`
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Guide', 'guide', ${ownerId}, ${ownerId}) returning id
    `
  )[0]!.id as string;
  revisionId = (
    await owner`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'approved', ${ownerId}) returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), stranger.end()]);
});

describe('workspace_review_cycle_times (0027)', () => {
  it('pairs a submit event with the decision and measures the duration', async () => {
    // Entered review 6 hours before the approval. Events are service-role writes
    // (analytics_events has no authenticated INSERT policy).
    await admin`
      insert into public.analytics_events (workspace_id, document_id, event_type, actor_user_id, payload, occurred_at)
      values (${ws}, ${documentId}, 'document_state_changed', ${ownerId},
              ${admin.json({ action: 'submit_for_review', from: 'draft', to: 'review' })},
              now() - interval '6 hours')
    `;
    await owner`
      insert into public.approval_records (workspace_id, revision_id, approver_id, action, recorded_at)
      values (${ws}, ${revisionId}, ${ownerId}, 'approved', now())
    `;

    const m = await cycleTimes(owner, ws);
    expect(m.reviewsMeasured).toBe(1);
    expect(m.approvals).toBe(1);
    expect(m.rejections).toBe(0);
    expect(m.avgHours).toBeGreaterThan(5.5);
    expect(m.avgHours).toBeLessThan(6.5);
  });

  it('counts a rejection and ignores a decision with no preceding submit event', async () => {
    // A rejection 2 hours after a fresh submit → measured. (Service-role event write.)
    await admin`
      insert into public.analytics_events (workspace_id, document_id, event_type, actor_user_id, payload, occurred_at)
      values (${ws}, ${documentId}, 'document_state_changed', ${ownerId},
              ${admin.json({ action: 'submit_for_review', from: 'draft', to: 'review' })},
              now() - interval '2 hours')
    `;
    await owner`
      insert into public.approval_records (workspace_id, revision_id, approver_id, action, recorded_at)
      values (${ws}, ${revisionId}, ${ownerId}, 'rejected', now())
    `;

    // A decision whose document has NO submit event at all → not measurable.
    const otherDoc = (
      await owner`
        insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
        select workspace_id, product_id, document_type_id, 'No submit', 'no-submit', ${ownerId}, ${ownerId}
        from public.documents where id = ${documentId} returning id
      `
    )[0]!.id as string;
    const otherRev = (
      await owner`
        insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
        values (${ws}, ${otherDoc}, 1, 'approved', ${ownerId}) returning id
      `
    )[0]!.id as string;
    await owner`
      insert into public.approval_records (workspace_id, revision_id, approver_id, action, recorded_at)
      values (${ws}, ${otherRev}, ${ownerId}, 'approved', now())
    `;

    const m = await cycleTimes(owner, ws);
    // The first test's approval + this rejection = 2 measured; the no-submit
    // approval is excluded (no submitted_at).
    expect(m.reviewsMeasured).toBe(2);
    expect(m.approvals).toBe(1);
    expect(m.rejections).toBe(1);
  });

  it('a stranger in another tenant measures nothing (SECURITY INVOKER + RLS)', async () => {
    const m = await cycleTimes(stranger, ws);
    expect(m.reviewsMeasured).toBe(0);
    expect(m.avgHours).toBeNull();
  });
});
