import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isEmailAllowed,
  magicLinkStatus,
  type DocumentAllowlist,
  type DocumentAccessMode,
  type DocumentId,
  type MagicLinkStatus,
  type MagicLinkType,
  type UserId,
  type WorkspaceId,
} from '@arther/types';

/**
 * C7 — gated access. Magic links are lightweight, time-limited grants to a single
 * published document (NOT workspace accounts); the schema + audit triggers live
 * in migration 0008 (`magic_links`, `magic_link_access_logs`). Issuance/revocation
 * run under the owner/editor's JWT (RLS: editors only; the audit trigger
 * attributes the actor); validation + access logging run under the SERVICE client
 * because the portal visitor is anonymous (no JWT). Only the token hash is stored.
 */

export interface IssuedMagicLink {
  id: string;
}

/** C7.2 — issue a magic link for a document (RLS: editor; audited). */
export async function issueMagicLink(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentId: DocumentId;
    email: string;
    type: MagicLinkType;
    tokenHash: string;
    expiresAt: string;
    createdBy: UserId;
  },
): Promise<IssuedMagicLink> {
  const { data, error } = await client
    .from('magic_links')
    .insert({
      workspace_id: input.workspaceId,
      document_id: input.documentId,
      email: input.email,
      token_hash: input.tokenHash,
      type: input.type,
      expires_at: input.expiresAt,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`issueMagicLink: ${error.message}`);
  return { id: data.id as string };
}

export interface ValidatedMagicLink {
  id: string;
  workspaceId: WorkspaceId;
  documentId: DocumentId;
}

/**
 * C7.2/C7.3 — validate a presented token (already hashed) for a document: it must
 * exist, match the document, be unexpired and unrevoked. For an `allowlist`-type
 * link, the link's email must *still* be on the document's current allowlist —
 * so removing an email/domain blocks new exchanges (C7.4), enforced here in the
 * one validation path rather than left to the caller. Service-role (the visitor
 * is anonymous). Returns the link, or null for any failure (no detail leaked).
 */
export async function validateMagicLink(
  service: SupabaseClient,
  input: { documentId: DocumentId; tokenHash: string },
): Promise<ValidatedMagicLink | null> {
  const { data, error } = await service
    .from('magic_links')
    .select('id, workspace_id, document_id, email, type, expires_at, revoked_at')
    .eq('token_hash', input.tokenHash)
    .eq('document_id', input.documentId)
    .maybeSingle();
  if (error) throw new Error(`validateMagicLink: ${error.message}`);
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;

  if (data.type === 'allowlist') {
    const accessConfig = await getLiveAccessConfig(service, data.document_id as string);
    if (!isEmailAllowed(accessConfig, data.email as string)) return null;
  }

  return {
    id: data.id as string,
    workspaceId: data.workspace_id as WorkspaceId,
    documentId: data.document_id as DocumentId,
  };
}

/** The access_config of a document's latest live snapshot (service-role read). */
async function getLiveAccessConfig(service: SupabaseClient, documentId: string): Promise<unknown> {
  const { data, error } = await service
    .from('published_snapshots')
    .select('access_config')
    .eq('document_id', documentId)
    .is('archived_at', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLiveAccessConfig: ${error.message}`);
  return data?.access_config ?? null;
}

/** C7.5 — append an access event (analytics + audit; the table is append-only). */
export async function logMagicLinkAccess(
  service: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    magicLinkId: string;
    documentId: DocumentId;
    ipHash: string | null;
  },
): Promise<void> {
  const { error } = await service.from('magic_link_access_logs').insert({
    workspace_id: input.workspaceId,
    magic_link_id: input.magicLinkId,
    document_id: input.documentId,
    ip_hash: input.ipHash,
  });
  if (error) throw new Error(`logMagicLinkAccess: ${error.message}`);
}

/**
 * C7.1/C7.3 — set a document's portal access tier by writing `access_config` on
 * its live (non-archived) snapshots. For the `allowlist` tier, the allowlist
 * (emails + domains) is stored alongside. Owner/admin only (RLS
 * `snapshots_admin_update`); the freeze guard permits `access_config` and the
 * audit trigger logs the change. Returns how many snapshots were updated
 * (0 = the document isn't published).
 */
export async function setDocumentAccess(
  client: SupabaseClient,
  input: { documentId: DocumentId; access: DocumentAccessMode; allowlist?: DocumentAllowlist },
): Promise<number> {
  const accessConfig: Record<string, unknown> = { access: input.access };
  if (input.access === 'allowlist') {
    accessConfig.allowlist = {
      emails: input.allowlist?.emails ?? [],
      domains: input.allowlist?.domains ?? [],
    };
  }
  const { data, error } = await client
    .from('published_snapshots')
    .update({ access_config: accessConfig })
    .eq('document_id', input.documentId)
    .is('archived_at', null)
    .select('id');
  if (error) throw new Error(`setDocumentAccess: ${error.message}`);
  return (data ?? []).length;
}

/**
 * C7.4 — revoke a magic link (RLS: editor; audited). Idempotent: only stamps
 * `revoked_at` when still null, so re-revoking is a no-op. Returns whether a link
 * was actually revoked. Active sessions are unaffected (they run to expiry — the
 * session cookie is self-contained); revocation blocks only new token exchanges.
 */
export async function revokeMagicLink(client: SupabaseClient, magicLinkId: string): Promise<boolean> {
  const { data, error } = await client
    .from('magic_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', magicLinkId)
    .is('revoked_at', null)
    .select('id');
  if (error) throw new Error(`revokeMagicLink: ${error.message}`);
  return (data ?? []).length > 0;
}

export interface MagicLinkSummary {
  id: string;
  email: string;
  type: MagicLinkType;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: MagicLinkStatus;
  accessCount: number;
}

/**
 * C7.4 — the issued magic links for a document (newest first), with derived
 * status and an access count, for the owner's revocation UI. Member-RLS read.
 */
export async function listDocumentMagicLinks(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<MagicLinkSummary[]> {
  const { data, error } = await client
    .from('magic_links')
    .select('id, email, type, created_at, expires_at, revoked_at')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listDocumentMagicLinks: ${error.message}`);
  const links = (data ?? []) as Array<Record<string, unknown>>;

  const counts = new Map<string, number>();
  if (links.length > 0) {
    const { data: logs, error: logErr } = await client
      .from('magic_link_access_logs')
      .select('magic_link_id')
      .eq('document_id', documentId);
    if (logErr) throw new Error(`listDocumentMagicLinks.logs: ${logErr.message}`);
    for (const row of (logs ?? []) as Array<{ magic_link_id: string | null }>) {
      if (row.magic_link_id) counts.set(row.magic_link_id, (counts.get(row.magic_link_id) ?? 0) + 1);
    }
  }

  return links.map((row) => ({
    id: row.id as string,
    email: row.email as string,
    type: row.type as MagicLinkType,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    revokedAt: (row.revoked_at as string | null) ?? null,
    status: magicLinkStatus({
      revokedAt: (row.revoked_at as string | null) ?? null,
      expiresAt: row.expires_at as string,
    }),
    accessCount: counts.get(row.id as string) ?? 0,
  }));
}
