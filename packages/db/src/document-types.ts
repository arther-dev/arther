import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentTypeId, UserId, WorkspaceId } from '@arther/types';

/**
 * Document Type repository (G0.1) — the generation schemas (migration 0004).
 * Thin, typed reads/mutations over the user-JWT client; RLS is active on every
 * call (ADR-010). Document Types are a Settings/admin surface: members read,
 * owners/admins write (0004 policies). Built-in types (workspace_id null) are
 * global and forkable-not-editable — the write policies reject any mutation of
 * a null-workspace row, so editing a built-in is impossible by construction;
 * forking goes through the atomic fork_document_type RPC (migration 0017).
 */

export interface DocumentTypeRow {
  id: DocumentTypeId;
  /** null = built-in (global, forkable, not editable). */
  workspace_id: WorkspaceId | null;
  name: string;
  description: string | null;
  built_in: boolean;
  /** Source built-in id when this is a fork. */
  forked_from: DocumentTypeId | null;
  archived_at: string | null;
  /** Number of sections in the type's schema (the data contract count). */
  section_count: number;
}

interface RawDocumentTypeRow {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  built_in: boolean;
  forked_from: string | null;
  archived_at: string | null;
  document_type_sections: { count: number }[];
}

const TYPE_COLUMNS =
  'id, workspace_id, name, description, built_in, forked_from, archived_at, document_type_sections(count)';

function toDocumentTypeRow(raw: RawDocumentTypeRow): DocumentTypeRow {
  return {
    id: raw.id as DocumentTypeId,
    workspace_id: (raw.workspace_id as WorkspaceId | null) ?? null,
    name: raw.name,
    description: raw.description,
    built_in: raw.built_in,
    forked_from: (raw.forked_from as DocumentTypeId | null) ?? null,
    archived_at: raw.archived_at,
    section_count: raw.document_type_sections?.[0]?.count ?? 0,
  };
}

/**
 * Active Document Types visible to the workspace: the global built-ins plus the
 * workspace's own (non-archived) types. RLS already scopes reads to
 * `workspace_id is null or member`, so the explicit predicate just drops other
 * tenants' rows the policy would let through if they were ever null-keyed.
 */
export async function listDocumentTypes(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<DocumentTypeRow[]> {
  const { data, error } = await client
    .from('document_types')
    .select(TYPE_COLUMNS)
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .is('archived_at', null)
    .order('built_in', { ascending: false }) // built-ins first
    .order('name');
  if (error) throw new Error(`listDocumentTypes: ${error.message}`);
  return ((data ?? []) as unknown as RawDocumentTypeRow[]).map(toDocumentTypeRow);
}

/** Archived workspace types for the restore disclosure (built-ins never archive). */
export async function listArchivedDocumentTypes(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<DocumentTypeRow[]> {
  const { data, error } = await client
    .from('document_types')
    .select(TYPE_COLUMNS)
    .eq('workspace_id', workspaceId)
    .not('archived_at', 'is', null)
    .order('name');
  if (error) throw new Error(`listArchivedDocumentTypes: ${error.message}`);
  return ((data ?? []) as unknown as RawDocumentTypeRow[]).map(toDocumentTypeRow);
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

/** A single Document Type with its ordered section schema + approval roles. */
export async function getDocumentType(
  client: SupabaseClient,
  id: DocumentTypeId,
): Promise<DocumentTypeDetail | null> {
  const { data, error } = await client
    .from('document_types')
    .select(TYPE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getDocumentType: ${error.message}`);
  if (!data) return null;

  const [sections, roles] = await Promise.all([
    client
      .from('document_type_sections')
      .select('id, name, display_order, spec_field_categories, brief_fragment_keys, brief_required, default_block_types')
      .eq('document_type_id', id)
      .order('display_order'),
    client
      .from('document_type_approval_roles')
      .select('id, role_label, required, display_order')
      .eq('document_type_id', id)
      .order('display_order'),
  ]);
  if (sections.error) throw new Error(`getDocumentType(sections): ${sections.error.message}`);
  if (roles.error) throw new Error(`getDocumentType(roles): ${roles.error.message}`);

  return {
    ...toDocumentTypeRow(data as unknown as RawDocumentTypeRow),
    sections: (sections.data ?? []) as DocumentTypeSectionRow[],
    approval_roles: (roles.data ?? []) as DocumentTypeApprovalRoleRow[],
  };
}

/** Create an empty workspace Document Type (sections added later, G0.2). */
export async function createDocumentType(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; name: string; description?: string; createdBy: UserId },
): Promise<DocumentTypeId> {
  const { data, error } = await client
    .from('document_types')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description ?? null,
      built_in: false,
      created_by: input.createdBy,
      updated_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createDocumentType: ${error.message}`);
  return data.id as DocumentTypeId;
}

/**
 * Fork a Document Type into an editable workspace copy — type + sections +
 * approval roles, atomically (migration 0017). A built-in can only be
 * customised through a fork; the same RPC clones a workspace type too.
 */
export async function forkDocumentType(
  client: SupabaseClient,
  input: { sourceId: DocumentTypeId; workspaceId: WorkspaceId },
): Promise<DocumentTypeId> {
  const { data, error } = await client.rpc('fork_document_type', {
    p_source_id: input.sourceId,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw new Error(`forkDocumentType: ${error.message}`);
  return data as DocumentTypeId;
}

/** Rename / re-describe a workspace type (RLS rejects built-ins by construction). */
export async function updateDocumentType(
  client: SupabaseClient,
  input: { id: DocumentTypeId; name: string; description?: string; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('document_types')
    .update({
      name: input.name,
      description: input.description ?? null,
      updated_by: input.updatedBy,
    })
    .eq('id', input.id);
  if (error) throw new Error(`updateDocumentType: ${error.message}`);
}

/**
 * Archive (or restore) a workspace Document Type. Archived types block new
 * document creation but leave existing documents untouched (spec §3.8). Soft
 * delete only — there is no hard-delete UI (invariant 7).
 */
export async function setDocumentTypeArchived(
  client: SupabaseClient,
  input: { id: DocumentTypeId; archived: boolean; userId: UserId },
): Promise<void> {
  const { error } = await client
    .from('document_types')
    .update({
      archived_at: input.archived ? new Date().toISOString() : null,
      updated_by: input.userId,
    })
    .eq('id', input.id);
  if (error) throw new Error(`setDocumentTypeArchived: ${error.message}`);
}
