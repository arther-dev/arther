import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentTypeId, UserId, WorkspaceId } from '@arther/types';

/**
 * Document Type repository (G0.1): a Document Type *is* the generation schema
 * (generator spec §3.4) — it must exist before anything generates. Built-in
 * types are global (workspace_id null), world-readable and forkable but never
 * editable; a workspace owns its own and forked copies. Writes are admin-gated
 * by RLS (document_types_write — Settings surface); reads go over the user-JWT
 * client like the rest of the data layer (ADR-010).
 */

export interface DocumentTypeRow {
  id: DocumentTypeId;
  /** null = built-in (global, forkable, not editable). */
  workspace_id: WorkspaceId | null;
  name: string;
  description: string | null;
  built_in: boolean;
  /** Set on a workspace copy that was forked from a built-in. */
  forked_from: DocumentTypeId | null;
  archived_at: string | null;
  /** How many ordered sections this type carries (the data contract count). */
  section_count: number;
}

export interface DocumentTypeSectionRow {
  id: string;
  name: string;
  display_order: number;
  spec_field_categories: string[];
  brief_fragment_keys: string[];
  brief_required: boolean;
  default_block_types: string[];
}

export interface DocumentTypeApprovalRoleRow {
  id: string;
  role_label: string;
  required: boolean;
  display_order: number;
}

export interface DocumentTypeDetail extends DocumentTypeRow {
  sections: DocumentTypeSectionRow[];
  approval_roles: DocumentTypeApprovalRoleRow[];
}

/**
 * The Document Types a workspace can generate from: the global built-ins plus
 * its own (active) types. Built-ins stay listed regardless of archive state
 * (they're canonical); workspace types hide once archived.
 */
export async function listDocumentTypes(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<DocumentTypeRow[]> {
  const { data, error } = await client
    .from('document_types')
    .select(
      'id, workspace_id, name, description, built_in, forked_from, archived_at, document_type_sections(count)',
    )
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('built_in', { ascending: false })
    .order('name');
  if (error) throw new Error(`listDocumentTypes: ${error.message}`);
  return (data ?? []).map((row) => {
    const { document_type_sections, ...rest } = row as DocumentTypeRow & {
      document_type_sections: Array<{ count: number }>;
    };
    return { ...rest, section_count: document_type_sections?.[0]?.count ?? 0 };
  });
}

/** A single type with its ordered sections + approval roles (the detail view). */
export async function getDocumentType(
  client: SupabaseClient,
  typeId: DocumentTypeId,
): Promise<DocumentTypeDetail | null> {
  const { data, error } = await client
    .from('document_types')
    .select(
      `id, workspace_id, name, description, built_in, forked_from, archived_at,
       sections:document_type_sections(id, name, display_order, spec_field_categories, brief_fragment_keys, brief_required, default_block_types),
       approval_roles:document_type_approval_roles(id, role_label, required, display_order)`,
    )
    .eq('id', typeId)
    .maybeSingle();
  if (error) throw new Error(`getDocumentType: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as DocumentTypeDetail & {
    sections: DocumentTypeSectionRow[];
    approval_roles: DocumentTypeApprovalRoleRow[];
  };
  const sections = [...(row.sections ?? [])].sort((a, b) => a.display_order - b.display_order);
  const approval_roles = [...(row.approval_roles ?? [])].sort(
    (a, b) => a.display_order - b.display_order,
  );
  return {
    ...row,
    section_count: sections.length,
    sections,
    approval_roles,
  };
}

/**
 * Fork a built-in into an editable workspace copy (generator spec §3.4) — the
 * atomic type + sections + approval-roles copy via the 0017 RPC. The built-in
 * stays canonical. Returns the new workspace type's id.
 */
export async function forkDocumentType(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; sourceTypeId: DocumentTypeId },
): Promise<DocumentTypeId> {
  const { data, error } = await client.rpc('fork_document_type', {
    p_workspace_id: input.workspaceId,
    p_source_type_id: input.sourceTypeId,
  });
  if (error) throw new Error(`forkDocumentType: ${error.message}`);
  return data as DocumentTypeId;
}

/** Create a workspace Document Type from scratch (sections added later, G0.2). */
export async function createDocumentType(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    name: string;
    description: string | null;
    createdBy: UserId;
  },
): Promise<DocumentTypeId> {
  const { data, error } = await client
    .from('document_types')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description,
      created_by: input.createdBy,
      updated_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createDocumentType: ${error.message}`);
  return data.id as DocumentTypeId;
}

/**
 * Rename / re-describe a workspace type. Built-ins are not editable — RLS
 * (document_types_write requires a non-null workspace_id) denies any write to
 * a built-in even if this is reached, so no extra guard is needed here.
 */
export async function updateDocumentType(
  client: SupabaseClient,
  input: {
    typeId: DocumentTypeId;
    name: string;
    description: string | null;
    updatedBy: UserId;
  },
): Promise<void> {
  const { error } = await client
    .from('document_types')
    .update({ name: input.name, description: input.description, updated_by: input.updatedBy })
    .eq('id', input.typeId);
  if (error) throw new Error(`updateDocumentType: ${error.message}`);
}

/**
 * Archive / restore a workspace type. Archived types block new document
 * creation but never touch documents already generated from them (spec §3.8);
 * archive-over-delete (invariant 7). document_types carries archived_at but no
 * archived_by column.
 */
export async function setDocumentTypeArchived(
  client: SupabaseClient,
  input: { typeId: DocumentTypeId; archived: boolean; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('document_types')
    .update({
      archived_at: input.archived ? new Date().toISOString() : null,
      updated_by: input.updatedBy,
    })
    .eq('id', input.typeId);
  if (error) throw new Error(`setDocumentTypeArchived: ${error.message}`);
}
