import type { SupabaseClient } from '@supabase/supabase-js';
import {
  summarizeSeats,
  type UserId,
  type WorkspaceId,
  type WorkspaceRole,
  type WorkspaceSeatSummary,
} from '@arther/types';

/**
 * Workspace-admin repository (F4): members, invitations, ownership — thin,
 * typed calls over the user-JWT client (RLS active, ADR-010). Owner-row
 * invariants live in the 0014 trigger; ownership transfer and invitation
 * acceptance go through the 0014 definer RPCs.
 */

export interface MemberRow {
  id: string;
  user_id: UserId;
  role: WorkspaceRole;
  joined_at: string;
  /**
   * H.4 — the role→seat transition timestamp the (post-launch) billing UI reads
   * for proration: the 0002 `workspace_members_set_updated_at` trigger bumps it on
   * every role change, so a change that crosses the Editor/Viewer boundary is
   * timestamped (billing spec §6).
   */
  updated_at: string;
  name: string | null;
  email: string;
}

export async function listMembers(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<MemberRow[]> {
  const { data, error } = await client
    .from('workspace_members')
    .select(
      'id, user_id, role, joined_at, updated_at, users!workspace_members_user_id_fkey(name, email)',
    )
    .eq('workspace_id', workspaceId)
    .order('joined_at');
  if (error) throw new Error(`listMembers: ${error.message}`);
  return (data ?? []).map((row) => {
    const u = (row as Record<string, unknown>).users as { name: string | null; email: string };
    return {
      id: (row as { id: string }).id,
      user_id: (row as { user_id: string }).user_id as UserId,
      role: (row as { role: WorkspaceRole }).role,
      joined_at: (row as { joined_at: string }).joined_at,
      updated_at: (row as { updated_at: string }).updated_at,
      name: u?.name ?? null,
      email: u?.email ?? '',
    };
  });
}

/**
 * H.4 — current Editor/Viewer seat counts for the workspace (billing spec §6
 * "seat count tracking"). RLS-scoped to members; the seat tier follows the role
 * (owner/admin/member = paid Editor, viewer = free), so this is computed, not
 * stored. The role→seat transition timestamp lives on each member's `updated_at`.
 */
export async function getWorkspaceSeatSummary(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<WorkspaceSeatSummary> {
  const { data, error } = await client
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`getWorkspaceSeatSummary: ${error.message}`);
  return summarizeSeats((data ?? []).map((r) => (r as { role: WorkspaceRole }).role));
}

/** Role changes take effect immediately (F4.2); owner moves only via transfer. */
export async function updateMemberRole(
  client: SupabaseClient,
  input: { memberId: string; role: 'admin' | 'member' | 'viewer'; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('workspace_members')
    .update({ role: input.role, updated_by: input.updatedBy })
    .eq('id', input.memberId);
  if (error) throw new Error(`updateMemberRole: ${error.message}`);
}

/** The 0014 trigger blocks removing the owner until ownership is transferred. */
export async function removeMember(client: SupabaseClient, memberId: string): Promise<void> {
  const { error } = await client.from('workspace_members').delete().eq('id', memberId);
  if (error) throw new Error(`removeMember: ${error.message}`);
}

/** Atomic owner→admin + member→owner + workspaces.owner_id (0014 RPC). */
export async function transferOwnership(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; newOwnerUserId: UserId },
): Promise<void> {
  const { error } = await client.rpc('transfer_workspace_ownership', {
    p_workspace_id: input.workspaceId,
    p_new_owner: input.newOwnerUserId,
  });
  if (error) throw new Error(`transferOwnership: ${error.message}`);
}

export async function updateWorkspaceName(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; name: string; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('workspaces')
    .update({ name: input.name, updated_by: input.updatedBy })
    .eq('id', input.workspaceId);
  if (error) throw new Error(`updateWorkspaceName: ${error.message}`);
}

/** F4.5 — set (or, with null, clear) the workspace logo URL. Owner/admin-gated. */
export async function updateWorkspaceLogo(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; logoUrl: string | null; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('workspaces')
    .update({ logo_url: input.logoUrl, updated_by: input.updatedBy })
    .eq('id', input.workspaceId);
  if (error) throw new Error(`updateWorkspaceLogo: ${error.message}`);
}

export interface InvitationRow {
  id: string;
  email: string;
  role: 'admin' | 'member';
  invited_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export async function listInvitations(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<InvitationRow[]> {
  const { data, error } = await client
    .from('workspace_invitations')
    .select('id, email, role, invited_at, expires_at, accepted_at, revoked_at')
    .eq('workspace_id', workspaceId)
    .order('invited_at', { ascending: false });
  if (error) throw new Error(`listInvitations: ${error.message}`);
  return (data ?? []) as InvitationRow[];
}

/** 7-day expiry is the 0002 column default; the id doubles as the link token. */
export async function createInvitation(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; email: string; role: 'admin' | 'member'; invitedBy: UserId },
): Promise<string> {
  const { data, error } = await client
    .from('workspace_invitations')
    .insert({
      workspace_id: input.workspaceId,
      email: input.email,
      role: input.role,
      invited_by: input.invitedBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createInvitation: ${error.message}`);
  return data.id as string;
}

export async function revokeInvitation(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from('workspace_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`revokeInvitation: ${error.message}`);
}

export interface InvitationLookup {
  workspace_name: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

/** Definer RPC: the invitee is not a member yet, so RLS would hide the row. */
export async function getInvitation(
  client: SupabaseClient,
  invitationId: string,
): Promise<InvitationLookup | null> {
  const { data, error } = await client.rpc('get_workspace_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw new Error(`getInvitation: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as InvitationLookup | undefined) ?? null;
}

/** Email + expiry + revocation checked in the 0014 RPC; returns the workspace id. */
export async function acceptInvitation(
  client: SupabaseClient,
  invitationId: string,
): Promise<WorkspaceId> {
  const { data, error } = await client.rpc('accept_workspace_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw new Error(`acceptInvitation: ${error.message}`);
  return data as WorkspaceId;
}

/**
 * Workspace deletion (F8.7) — soft delete with a 14-day grace period. The 0002
 * RPC is owner-only and sets deleted_at/purge_after; the tenancy helpers then
 * hide the tenant from every member at once (data model §10). Reversible via
 * cancelWorkspaceDeletion() until the grace period expires; the
 * purge_deleted_workspaces job hard-deletes after.
 */
export async function requestWorkspaceDeletion(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<void> {
  const { error } = await client.rpc('request_workspace_deletion', {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(`requestWorkspaceDeletion: ${error.message}`);
}

/** Owner-only (0002 RPC); restores a workspace still inside its grace window. */
export async function cancelWorkspaceDeletion(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<void> {
  const { error } = await client.rpc('cancel_workspace_deletion', {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(`cancelWorkspaceDeletion: ${error.message}`);
}

export interface PendingWorkspaceDeletion {
  id: WorkspaceId;
  name: string;
  slug: string;
  purge_after: string;
  /** The caller's role — only the owner sees the restore control. */
  role: WorkspaceRole;
}

/**
 * The caller's pending-deletion workspace, if any (0016 definer read). A
 * soft-deleted workspace is hidden from every RLS path, so the Settings restore
 * banner needs this definer lookup to surface it at all.
 */
export async function getPendingWorkspaceDeletion(
  client: SupabaseClient,
): Promise<PendingWorkspaceDeletion | null> {
  const { data, error } = await client.rpc('get_pending_workspace_deletion');
  if (error) throw new Error(`getPendingWorkspaceDeletion: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as PendingWorkspaceDeletion | undefined) ?? null;
}
