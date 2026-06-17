import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DocumentId,
  DocumentAccessMode,
  MagicLinkType,
  UserId,
  WorkspaceId,
} from '@arther/types';

/**
 * C7 — gated access. Magic links are lightweight, time-limited grants to a single
 * published document (NOT workspace accounts); the schema + audit triggers live
 * in migration 0008 (`magic_links`, `magic_link_access_logs`). Issuance runs
 * under the owner/editor's JWT (RLS: editors issue, the audit trigger attributes
 * the actor); validation + access logging run under the SERVICE client because
 * the portal visitor is anonymous (no JWT). Only the token hash is ever stored.
 */

export interface IssuedMagicLink {
  id: string;
}

/** C7.2 — issue an open magic link for a document (RLS: editor; audited). */
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
 * C7.2 — validate a presented token (already hashed) for a document: it must
 * exist, match the document, be unexpired and unrevoked. Service-role (the
 * visitor is anonymous). Returns the link, or null for any failure (no detail
 * leaked to the caller).
 */
export async function validateMagicLink(
  service: SupabaseClient,
  input: { documentId: DocumentId; tokenHash: string },
): Promise<ValidatedMagicLink | null> {
  const { data, error } = await service
    .from('magic_links')
    .select('id, workspace_id, document_id, expires_at, revoked_at')
    .eq('token_hash', input.tokenHash)
    .eq('document_id', input.documentId)
    .maybeSingle();
  if (error) throw new Error(`validateMagicLink: ${error.message}`);
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;
  return {
    id: data.id as string,
    workspaceId: data.workspace_id as WorkspaceId,
    documentId: data.document_id as DocumentId,
  };
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
 * C7.1 — set a document's portal access tier by writing `access_config` on its
 * live (non-archived) snapshots. Owner/admin only (RLS `snapshots_admin_update`);
 * the freeze guard permits `access_config` and the audit trigger logs the change.
 * Returns how many snapshots were updated (0 = the document isn't published).
 */
export async function setDocumentAccess(
  client: SupabaseClient,
  input: { documentId: DocumentId; access: DocumentAccessMode },
): Promise<number> {
  const { data, error } = await client
    .from('published_snapshots')
    .update({ access_config: { access: input.access } })
    .eq('document_id', input.documentId)
    .is('archived_at', null)
    .select('id');
  if (error) throw new Error(`setDocumentAccess: ${error.message}`);
  return (data ?? []).length;
}
