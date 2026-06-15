import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ApprovalRoleAssignmentId,
  ApprovalRoleId,
  DocumentTypeId,
  MembershipId,
  UserId,
  WorkspaceId,
} from '@arther/types';

/**
 * Approval roles repository (G0.3): the per-Document-Type reviewer config the
 * Phase 3 review machine consumes. Reads/writes ride the user-JWT client so the
 * 0004 RLS policies are active — built-in types (workspace_id null) expose their
 * roles read-only (the `dtar_write` policy requires `workspace_id is not null`),
 * so roles are edited on a workspace fork, never on a built-in. Assignments are
 * the admin-gated `approval_role_assignments` Settings surface (member read,
 * owner/admin write). One unique (role_id, workspace_member_id) per the schema.
 */

export interface ApprovalRoleAssignmentRow {
  id: ApprovalRoleAssignmentId;
  workspace_member_id: MembershipId;
}

export interface ApprovalRoleRow {
  id: ApprovalRoleId;
  document_type_id: DocumentTypeId;
  role_label: string;
  required: boolean;
  display_order: number;
  assignments: ApprovalRoleAssignmentRow[];
}

/** The named roles of one Document Type, in display order, each with its member assignments. */
export async function listApprovalRoles(
  client: SupabaseClient,
  documentTypeId: DocumentTypeId,
): Promise<ApprovalRoleRow[]> {
  const { data, error } = await client
    .from('document_type_approval_roles')
    .select(
      'id, document_type_id, role_label, required, display_order, approval_role_assignments(id, workspace_member_id)',
    )
    .eq('document_type_id', documentTypeId)
    .order('display_order');
  if (error) throw new Error(`listApprovalRoles: ${error.message}`);
  return (data ?? []).map((row) => {
    const { approval_role_assignments, ...rest } = row as ApprovalRoleRow & {
      approval_role_assignments: ApprovalRoleAssignmentRow[] | null;
    };
    return { ...rest, assignments: approval_role_assignments ?? [] };
  });
}

export async function createApprovalRole(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentTypeId: DocumentTypeId;
    label: string;
    required: boolean;
    displayOrder: number;
    createdBy: UserId;
  },
): Promise<ApprovalRoleId> {
  const { data, error } = await client
    .from('document_type_approval_roles')
    .insert({
      workspace_id: input.workspaceId,
      document_type_id: input.documentTypeId,
      role_label: input.label,
      required: input.required,
      display_order: input.displayOrder,
      created_by: input.createdBy,
      updated_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createApprovalRole: ${error.message}`);
  return data.id as ApprovalRoleId;
}

export async function updateApprovalRole(
  client: SupabaseClient,
  input: { id: ApprovalRoleId; label: string; required: boolean; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('document_type_approval_roles')
    .update({ role_label: input.label, required: input.required, updated_by: input.updatedBy })
    .eq('id', input.id);
  if (error) throw new Error(`updateApprovalRole: ${error.message}`);
}

/** Deleting a role cascades its assignments (FK on delete cascade, 0004). */
export async function deleteApprovalRole(
  client: SupabaseClient,
  id: ApprovalRoleId,
): Promise<void> {
  const { error } = await client.from('document_type_approval_roles').delete().eq('id', id);
  if (error) throw new Error(`deleteApprovalRole: ${error.message}`);
}

/** Assign a workspace member to a role. The (role_id, member_id) uniqueness makes re-assigns a no-op. */
export async function assignApprovalRole(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    roleId: ApprovalRoleId;
    workspaceMemberId: MembershipId;
    assignedBy: UserId;
  },
): Promise<void> {
  const { error } = await client.from('approval_role_assignments').upsert(
    {
      workspace_id: input.workspaceId,
      role_id: input.roleId,
      workspace_member_id: input.workspaceMemberId,
      assigned_by: input.assignedBy,
    },
    { onConflict: 'role_id,workspace_member_id', ignoreDuplicates: true },
  );
  if (error) throw new Error(`assignApprovalRole: ${error.message}`);
}

export async function unassignApprovalRole(
  client: SupabaseClient,
  input: { roleId: ApprovalRoleId; workspaceMemberId: MembershipId },
): Promise<void> {
  const { error } = await client
    .from('approval_role_assignments')
    .delete()
    .eq('role_id', input.roleId)
    .eq('workspace_member_id', input.workspaceMemberId);
  if (error) throw new Error(`unassignApprovalRole: ${error.message}`);
}
