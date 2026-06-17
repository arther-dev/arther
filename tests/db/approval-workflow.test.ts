import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * C1 probes — the approval workflow RPC `record_approval` (migration 0019) over
 * the append-only approval_records (0007) and the document_revisions state
 * machine (0005). AND-logic: a document reaches Approved only once every
 * required Document-Type role has approved at the current review cycle; one
 * rejection returns it to Draft (reason mandatory); a re-submit starts a fresh
 * cycle so prior approvals reset by scoping (the trail is never deleted). A
 * viewer assigned as an approver can complete the gate (the RPC is DEFINER).
 */

let admin: Sql;
let editor: Sql; // workspace owner + document owner
let tech: Sql; // member assigned to the Technical role
let reg: Sql; // VIEWER assigned to the Regulatory role (proves the DEFINER path)
let stranger: Sql;
let editorId: string;
let techId: string;
let regId: string;
let strangerId: string;
let ws: string;
let docTypeId: string;
let roleTech: string;
let roleReg: string;
let documentId: string;
let revisionId: string;

const stateOf = async (id: string) =>
  (await editor`select state from public.document_revisions where id = ${id}`)[0]?.state as string;

/** Re-submit the working copy into Review at a fresh cycle (what the app's submit does). */
const enterReview = async (cycle: number) => {
  await editor`
    update public.document_revisions set state = 'review', review_cycle = ${cycle}
    where id = ${revisionId}
  `;
};

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `ap-editor-${run}@example.com`);
  techId = await createAuthUser(admin, `ap-tech-${run}@example.com`);
  regId = await createAuthUser(admin, `ap-reg-${run}@example.com`);
  strangerId = await createAuthUser(admin, `ap-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  tech = await userClient(techId);
  reg = await userClient(regId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Approvals Co', ${uniqueSlug('ap')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${techId}, 'member', ${editorId}), (${ws}, ${regId}, 'viewer', ${editorId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('apx')})`;

  const productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Inverter X', ${editorId}) returning id
    `
  )[0]!.id as string;

  // A workspace-owned Document Type with two REQUIRED approval roles.
  docTypeId = (
    await editor`
      insert into public.document_types (workspace_id, name, created_by)
      values (${ws}, 'Datasheet', ${editorId}) returning id
    `
  )[0]!.id as string;
  roleTech = (
    await editor`
      insert into public.document_type_approval_roles (workspace_id, document_type_id, role_label, required, display_order)
      values (${ws}, ${docTypeId}, 'Technical Reviewer', true, 0) returning id
    `
  )[0]!.id as string;
  roleReg = (
    await editor`
      insert into public.document_type_approval_roles (workspace_id, document_type_id, role_label, required, display_order)
      values (${ws}, ${docTypeId}, 'Regulatory Reviewer', true, 1) returning id
    `
  )[0]!.id as string;

  const techMember = (
    await editor`select id from public.workspace_members where workspace_id = ${ws} and user_id = ${techId}`
  )[0]!.id as string;
  const regMember = (
    await editor`select id from public.workspace_members where workspace_id = ${ws} and user_id = ${regId}`
  )[0]!.id as string;
  await editor`
    insert into public.approval_role_assignments (workspace_id, role_id, workspace_member_id, assigned_by)
    values (${ws}, ${roleTech}, ${techMember}, ${editorId}), (${ws}, ${roleReg}, ${regMember}, ${editorId})
  `;

  documentId = (
    await editor`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Inverter X Datasheet', 'inverter-x', ${editorId}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  revisionId = (
    await editor`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, review_cycle, created_by)
      values (${ws}, ${documentId}, 1, 'review', 1, ${editorId}) returning id
    `
  )[0]!.id as string;
  await editor`update public.documents set current_revision_id = ${revisionId} where id = ${documentId}`;
});

afterAll(async () => {
  await editor?.end();
  await tech?.end();
  await reg?.end();
  await stranger?.end();
  await admin?.end();
});

describe('authorization', () => {
  it('a member not assigned to the role cannot approve for it', async () => {
    const msg = await expectDenied(
      () => reg`select public.record_approval(${revisionId}, ${roleTech}, 'approved')`,
    );
    expect(msg).toMatch(/assigned approver/i);
  });

  it('a stranger cannot approve', async () => {
    const msg = await expectDenied(
      () => stranger`select public.record_approval(${revisionId}, ${roleTech}, 'approved')`,
    );
    expect(msg).toMatch(/assigned approver/i);
  });

  it('the document owner cannot self-approve (spec §2.4)', async () => {
    const msg = await expectDenied(
      () => editor`select public.record_approval(${revisionId}, ${roleTech}, 'approved')`,
    );
    expect(msg).toMatch(/own document/i);
  });
});

describe('AND-logic gate (C1.1)', () => {
  it('stays in Review until every required role has approved', async () => {
    const after1 = (
      await tech`select public.record_approval(${revisionId}, ${roleTech}, 'approved') as state`
    )[0]!.state as string;
    expect(after1).toBe('review');
    expect(await stateOf(revisionId)).toBe('review');
  });

  it('advances to Approved when the last required role approves — incl. a viewer-approver', async () => {
    // reg is a VIEWER; only the DEFINER RPC lets their approval drive the
    // editor-gated review→approved transition.
    const after2 = (
      await reg`select public.record_approval(${revisionId}, ${roleReg}, 'approved') as state`
    )[0]!.state as string;
    expect(after2).toBe('approved');
    expect(await stateOf(revisionId)).toBe('approved');
  });
});

describe('rejection (C1.2 / C1.3)', () => {
  it('requires a reason to send back', async () => {
    await enterReview(2);
    const msg = await expectDenied(
      () => tech`select public.record_approval(${revisionId}, ${roleTech}, 'rejected')`,
    );
    expect(msg).toMatch(/reason is required/i);
  });

  it('one rejection returns the document to Draft with the reason recorded', async () => {
    const state = (
      await tech`select public.record_approval(${revisionId}, ${roleTech}, 'rejected', 'Fix the ratings table') as state`
    )[0]!.state as string;
    expect(state).toBe('draft');
    expect(await stateOf(revisionId)).toBe('draft');
    const rec = await editor`
      select reason, review_cycle from public.approval_records
      where revision_id = ${revisionId} and action = 'rejected' order by recorded_at desc limit 1
    `;
    expect(rec[0]!.reason).toBe('Fix the ratings table');
    expect(rec[0]!.review_cycle).toBe(2);
  });
});

describe('reset on rejection scopes by cycle (C1.3)', () => {
  it('approvals from earlier cycles do not count toward the new cycle', async () => {
    await enterReview(3);
    // reg approves in cycle 3 — tech's cycle-1 approval must NOT carry over.
    const afterReg = (
      await reg`select public.record_approval(${revisionId}, ${roleReg}, 'approved') as state`
    )[0]!.state as string;
    expect(afterReg).toBe('review');
    // tech must approve again this cycle for the gate to complete.
    const afterTech = (
      await tech`select public.record_approval(${revisionId}, ${roleTech}, 'approved') as state`
    )[0]!.state as string;
    expect(afterTech).toBe('approved');
  });
});

describe('append-only audit trail + RLS', () => {
  it('approval records cannot be updated or deleted (even by the owner)', async () => {
    await expectDenied(
      () => editor`update public.approval_records set reason = 'x' where revision_id = ${revisionId}`,
    );
    await expectDenied(
      () => editor`delete from public.approval_records where revision_id = ${revisionId}`,
    );
  });

  it('members read the trail; strangers see nothing', async () => {
    const seen = await tech`select id from public.approval_records where revision_id = ${revisionId}`;
    expect(seen.length).toBeGreaterThan(0);
    const hidden = await stranger`select id from public.approval_records where revision_id = ${revisionId}`;
    expect(hidden).toHaveLength(0);
  });

  it('a document not in review cannot be approved', async () => {
    // It is 'approved' now; record_approval refuses outside Review.
    const msg = await expectDenied(
      () => tech`select public.record_approval(${revisionId}, ${roleTech}, 'approved')`,
    );
    expect(msg).toMatch(/not in review/i);
  });
});
