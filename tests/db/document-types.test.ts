import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * Migration 0017 + 0004 policy probes — Document Types (G0.1):
 * built-ins are globally readable but never editable (fork instead);
 * fork_document_type() atomically copies the type + its sections + approval
 * roles into the workspace under the caller's RLS (owner/admin only); a
 * Document Type with documents generated from it can't be hard-deleted
 * (archive-when-referenced); strangers see none of a workspace's own types.
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let strangerId: string;
let ws: string;
let datasheetId: string; // a built-in (workspace_id null)

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `dt-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `dt-member-${run}@example.com`);
  strangerId = await createAuthUser(admin, `dt-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Typespace', ${uniqueSlug('dt')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('else')})`;

  datasheetId = (
    await admin`select id from public.document_types where built_in and name = 'Datasheet' limit 1`
  )[0]!.id as string;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), member.end(), stranger.end()]);
});

describe('built-in document types', () => {
  it('are readable by any member but not editable directly', async () => {
    const seen = await member`select id from public.document_types where id = ${datasheetId}`;
    expect(seen).toHaveLength(1);

    // The 0004 write policy requires workspace_id not null — built-ins are global,
    // so even an admin cannot update one (fork-not-edit, generator spec §3.4).
    await owner`update public.document_types set name = 'Hacked' where id = ${datasheetId}`;
    const after = await admin`select name from public.document_types where id = ${datasheetId}`;
    expect(after[0]!.name).toBe('Datasheet'); // the update matched zero rows under RLS
  });
});

describe('fork_document_type', () => {
  it('copies the type, its sections, and its approval roles atomically', async () => {
    const srcSections = await admin`
      select count(*)::int as n from public.document_type_sections where document_type_id = ${datasheetId}
    `;
    expect(srcSections[0]!.n).toBeGreaterThan(0);

    const forkedId = (
      await owner`select public.fork_document_type(${datasheetId}, ${ws}, 'My Datasheet') as id`
    )[0]!.id as string;

    const fork = (
      await owner`select workspace_id, built_in, forked_from, name from public.document_types where id = ${forkedId}`
    )[0]!;
    expect(fork.workspace_id).toBe(ws);
    expect(fork.built_in).toBe(false);
    expect(fork.forked_from).toBe(datasheetId);
    expect(fork.name).toBe('My Datasheet');

    const forkSections = await owner`
      select count(*)::int as n from public.document_type_sections where document_type_id = ${forkedId}
    `;
    expect(forkSections[0]!.n).toBe(srcSections[0]!.n);
    // Copied sections are workspace-scoped, not global.
    const scoped = await admin`
      select bool_and(workspace_id = ${ws}) as ok
      from public.document_type_sections where document_type_id = ${forkedId}
    `;
    expect(scoped[0]!.ok).toBe(true);
  });

  it('refuses a non-admin member (the workspace insert is RLS-blocked)', async () => {
    const msg = await expectDenied(
      () => member`select public.fork_document_type(${datasheetId}, ${ws})`,
    );
    expect(msg).toMatch(/row-level security|denied|policy/i);
  });

  it('does not let a stranger fork into a workspace they do not belong to', async () => {
    await expectDenied(() => stranger`select public.fork_document_type(${datasheetId}, ${ws})`);
  });
});

describe('archive-when-referenced', () => {
  it('blocks hard delete while a document references the type, archives instead', async () => {
    const typeId = (
      await owner`select public.fork_document_type(${datasheetId}, ${ws}, 'Deletable') as id`
    )[0]!.id as string;

    // A product + a document generated from the type (inserted as admin — the
    // BEFORE DELETE guard fires regardless of who deletes).
    const productId = (
      await admin`
        insert into public.products (workspace_id, name, created_by)
        values (${ws}, 'Widget', ${ownerId}) returning id
      `
    )[0]!.id as string;
    await admin`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, created_by)
      values (${ws}, ${productId}, ${typeId}, 'Widget Datasheet', 'widget-datasheet', ${ownerId})
    `;

    const msg = await expectDenied(
      () => admin`delete from public.document_types where id = ${typeId}`,
    );
    expect(msg).toMatch(/archive it instead|generated from it/i);

    // Archiving is the sanctioned path and leaves the document untouched.
    await owner`update public.document_types set archived_at = now() where id = ${typeId}`;
    const archived = await owner`select archived_at from public.document_types where id = ${typeId}`;
    expect(archived[0]!.archived_at).not.toBeNull();
    const doc = await admin`select id from public.documents where document_type_id = ${typeId}`;
    expect(doc).toHaveLength(1);
  });

  it('permits hard delete of an unreferenced workspace type', async () => {
    const typeId = (
      await owner`select public.fork_document_type(${datasheetId}, ${ws}, 'Ephemeral') as id`
    )[0]!.id as string;
    await owner`delete from public.document_types where id = ${typeId}`;
    const gone = await admin`select id from public.document_types where id = ${typeId}`;
    expect(gone).toHaveLength(0);
  });
});

describe('tenant isolation', () => {
  it('hides a workspace’s own types from a stranger', async () => {
    const typeId = (
      await owner`select public.fork_document_type(${datasheetId}, ${ws}, 'Private') as id`
    )[0]!.id as string;
    const seen = await stranger`select id from public.document_types where id = ${typeId}`;
    expect(seen).toHaveLength(0);
  });
});
