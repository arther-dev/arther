import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * C7 probes — gated access (migration 0008 `magic_links`, `magic_link_access_logs`
 * + `published_snapshots.access_config`). A magic link is a time-limited, hashed,
 * single-document grant — never a workspace account. Under test:
 *   - C7.1: owner/admin set a doc's access tier (audited snapshot.access_config_changed);
 *   - C7.2: editors issue links (audited magic_link.issued); viewers cannot;
 *           token_hash is unique; the validation predicate respects expiry + revocation;
 *   - C7.4: revoking a link is audited (magic_link.revoked);
 *   - C7.5: the access log is append-only (no update / no delete).
 */

let admin: Sql;
let owner: Sql;
let editor: Sql;
let viewer: Sql;
let ownerId: string;
let editorId: string;
let viewerId: string;
let ws: string;
let documentId: string;
let snapshotId: string;

const blockTree = [{ type: 'paragraph', content: { alignment: 'left', nodes: [] } }];
const hash = (s: string) => `hash-${s}`; // a stand-in token hash; the column only needs uniqueness

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `ml-owner-${run}@example.com`);
  editorId = await createAuthUser(admin, `ml-editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `ml-viewer-${run}@example.com`);
  owner = await userClient(ownerId);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);

  ws = (await owner`select public.create_workspace('Gated Co', ${uniqueSlug('gated')}) as id`)[0]!
    .id as string;
  // 'member' is the write-capable role (private.is_workspace_editor); there is no
  // 'editor' role. `editor` here names the member who can issue links.
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${editorId}, 'member', ${ownerId}), (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;

  const productId = (
    await owner`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Vault V1', ${ownerId}) returning id
    `
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Vault Datasheet', 'vault', ${ownerId}, ${ownerId})
      returning id
    `
  )[0]!.id as string;
  const rev = (
    await owner`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'approved', ${ownerId}) returning id
    `
  )[0]!.id as string;
  snapshotId = (
    await admin`select public.publish_document(${rev}, ${ownerId}, ${admin.json(blockTree)}, '{}'::jsonb, 'vault') as id`
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await editor?.end();
  await viewer?.end();
  await admin?.end();
});

describe('access tiers (C7.1)', () => {
  it('owner sets a doc link-gated — audited, and the public predicate excludes it', async () => {
    await owner`
      update public.published_snapshots set access_config = '{"access":"link"}'::jsonb where id = ${snapshotId}
    `;
    const audit = await admin`
      select actor_id from public.audit_log
      where action = 'snapshot.access_config_changed' and resource_id = ${snapshotId}
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_id).toBe(ownerId);

    // The portal's public filter (access = 'public') now excludes the snapshot.
    const publicRows = await admin`
      select id from public.published_snapshots
      where id = ${snapshotId} and coalesce(access_config->>'access', 'public') = 'public'
    `;
    expect(publicRows).toHaveLength(0);
  });

  it('C7.3 — an allowlist tier stores emails/domains in access_config and audits the flip', async () => {
    await owner`
      update public.published_snapshots
      set access_config = '{"access":"allowlist","allowlist":{"emails":["alice@acme.com"],"domains":["partner.io"]}}'::jsonb
      where id = ${snapshotId}
    `;
    const row = (
      await admin`select access_config from public.published_snapshots where id = ${snapshotId}`
    )[0]!.access_config as { access: string; allowlist: { emails: string[]; domains: string[] } };
    expect(row.access).toBe('allowlist');
    expect(row.allowlist.emails).toContain('alice@acme.com');
    expect(row.allowlist.domains).toContain('partner.io');

    // Every access_config change (incl. the security-sensitive allowlist↔public
    // flip) is audited — there are now multiple change rows for this snapshot.
    const audit = await admin`
      select count(*)::int as n from public.audit_log
      where action = 'snapshot.access_config_changed' and resource_id = ${snapshotId}
    `;
    expect(audit[0]!.n).toBeGreaterThanOrEqual(2);
  });
});

describe('magic-link issuance (C7.2)', () => {
  it('an editor issues a link — audited magic_link.issued', async () => {
    const id = (
      await editor`
        insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at, created_by)
        values (${ws}, ${documentId}, 'guest@example.com', ${hash('a')}, 'open', now() + interval '7 days', ${editorId})
        returning id
      `
    )[0]!.id as string;
    const audit = await admin`
      select actor_id from public.audit_log where action = 'magic_link.issued' and resource_id = ${id}
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_id).toBe(editorId);
  });

  it('a viewer cannot issue a link (RLS: editors only)', async () => {
    await expectDenied(
      () => viewer`
        insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at)
        values (${ws}, ${documentId}, 'guest@example.com', ${hash('viewer')}, 'open', now() + interval '7 days')
      `,
    );
  });

  it('token_hash is unique (a hash collision is rejected)', async () => {
    await editor`
      insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at, created_by)
      values (${ws}, ${documentId}, 'g2@example.com', ${hash('dup')}, 'open', now() + interval '7 days', ${editorId})
    `;
    const msg = await expectDenied(
      () => editor`
        insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at, created_by)
        values (${ws}, ${documentId}, 'g3@example.com', ${hash('dup')}, 'open', now() + interval '7 days', ${editorId})
      `,
    );
    expect(msg).toMatch(/duplicate|unique/i);
  });

  it('the validation predicate respects expiry and revocation', async () => {
    // Valid, expired, and revoked links for the same document.
    await editor`
      insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at, created_by)
      values
        (${ws}, ${documentId}, 'valid@example.com',   ${hash('valid')},   'open', now() + interval '1 day', ${editorId}),
        (${ws}, ${documentId}, 'expired@example.com', ${hash('expired')}, 'open', now() - interval '1 day', ${editorId})
    `;
    const revokedId = (
      await editor`
        insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at, created_by)
        values (${ws}, ${documentId}, 'revoked@example.com', ${hash('revoked')}, 'open', now() + interval '1 day', ${editorId})
        returning id
      `
    )[0]!.id as string;
    await editor`update public.magic_links set revoked_at = now() where id = ${revokedId}`;

    const found = async (h: string) =>
      (
        await admin`
          select id from public.magic_links
          where token_hash = ${h} and document_id = ${documentId}
            and revoked_at is null and expires_at > now()
        `
      ).length;
    expect(await found(hash('valid'))).toBe(1);
    expect(await found(hash('expired'))).toBe(0);
    expect(await found(hash('revoked'))).toBe(0);
  });

  it('revoking a link is audited (magic_link.revoked)', async () => {
    const id = (
      await editor`
        insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at, created_by)
        values (${ws}, ${documentId}, 'rev2@example.com', ${hash('rev2')}, 'open', now() + interval '1 day', ${editorId})
        returning id
      `
    )[0]!.id as string;
    await editor`update public.magic_links set revoked_at = now() where id = ${id}`;
    const audit = await admin`
      select count(*)::int as n from public.audit_log where action = 'magic_link.revoked' and resource_id = ${id}
    `;
    expect(audit[0]!.n).toBe(1);
  });
});

describe('access log (C7.5)', () => {
  let linkId: string;
  let logId: string;

  it('records an access event', async () => {
    linkId = (
      await editor`
        insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at, created_by)
        values (${ws}, ${documentId}, 'log@example.com', ${hash('log')}, 'open', now() + interval '1 day', ${editorId})
        returning id
      `
    )[0]!.id as string;
    logId = (
      await admin`
        insert into public.magic_link_access_logs (workspace_id, magic_link_id, document_id, ip_hash)
        values (${ws}, ${linkId}, ${documentId}, 'ip-abc') returning id
      `
    )[0]!.id as string;
    expect(logId).toBeTruthy();
  });

  it('is append-only — no update, no delete (even for the service role)', async () => {
    expect(
      await expectDenied(() => admin`update public.magic_link_access_logs set ip_hash = 'x' where id = ${logId}`),
    ).toMatch(/append-only|immutable|cannot|prevent/i);
    expect(
      await expectDenied(() => admin`delete from public.magic_link_access_logs where id = ${logId}`),
    ).toMatch(/append-only|immutable|cannot|prevent/i);
  });
});
