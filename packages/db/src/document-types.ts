import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, WorkspaceId } from '@arther/types';

/**
 * Document Types repository (Phase 2 G0.1) — thin, typed reads/mutations over
 * the user-JWT client (RLS active, ADR-010). A Document Type is the generation
 * schema (generator spec §3.4): built-ins (workspace_id null) are global and
 * read-only to clients — forkable, not editable; workspace types are
 * admin-writable. The fork copies the section schema + approval roles atomically
 * through the 0017 RPC; deletion is blocked while documents reference the type
 * (archive instead, §3.8), so the surface only ever archives.
 */

export interface DocumentTypeRow {
  id: string;
  workspace_id: WorkspaceId | null;
  name: string;
  description: string | null;
  built_in: boolean;
  forked_from: string | null;
  archived_at: string | null;
  /** Section count for the list view (nested PostgREST aggregate). */
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
  quality_overrides: unknown[];
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

const TYPE_COLUMNS =
  'id, workspace_id, name, description, built_in, forked_from, archived_at, document_type_sections(count)';

function mapType(row: Record<string, unknown>): DocumentTypeRow {
  // PostgREST returns the embedded aggregate as `[{ count: n }]`.
  const counts = row.document_type_sections as Array<{ count: number }> | undefined;
  return {
    id: row.id as string,
    workspace_id: (row.workspace_id as WorkspaceId | null) ?? null,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    built_in: row.built_in as boolean,
    forked_from: (row.forked_from as string | null) ?? null,
    archived_at: (row.archived_at as string | null) ?? null,
    section_count: counts?.[0]?.count ?? 0,
  };
}

/**
 * Built-ins (global, forkable) + this workspace's own types, non-archived. RLS
 * already scopes the read to `workspace_id is null or member`, but the explicit
 * filter keeps the intent legible and future-proofs multi-workspace.
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
    .order('built_in', { ascending: false })
    .order('name');
  if (error) throw new Error(`listDocumentTypes: ${error.message}`);
  return (data ?? []).map((r) => mapType(r as Record<string, unknown>));
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
    .order('archived_at', { ascending: false });
  if (error) throw new Error(`listArchivedDocumentTypes: ${error.message}`);
  return (data ?? []).map((r) => mapType(r as Record<string, unknown>));
}

/** One type with its ordered section schema + approval roles (the detail view). */
export async function getDocumentTypeDetail(
  client: SupabaseClient,
  id: string,
): Promise<DocumentTypeDetail | null> {
  const { data, error } = await client
    .from('document_types')
    .select(TYPE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getDocumentTypeDetail: ${error.message}`);
  if (!data) return null;

  const [sections, roles] = await Promise.all([
    client
      .from('document_type_sections')
      .select(
        'id, name, display_order, spec_field_categories, brief_fragment_keys, brief_required, default_block_types, quality_overrides',
      )
      .eq('document_type_id', id)
      .order('display_order'),
    client
      .from('document_type_approval_roles')
      .select('id, role_label, required, display_order')
      .eq('document_type_id', id)
      .order('display_order'),
  ]);
  if (sections.error) throw new Error(`getDocumentTypeDetail.sections: ${sections.error.message}`);
  if (roles.error) throw new Error(`getDocumentTypeDetail.roles: ${roles.error.message}`);

  return {
    ...mapType(data as Record<string, unknown>),
    sections: (sections.data ?? []) as DocumentTypeSectionRow[],
    approval_roles: (roles.data ?? []) as DocumentTypeApprovalRoleRow[],
  };
}

/** Create a workspace Document Type from scratch (no sections yet — added in G0.2). */
export async function createDocumentType(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; name: string; description?: string; createdBy: UserId },
): Promise<string> {
  const { data, error } = await client
    .from('document_types')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description ?? null,
      built_in: false,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createDocumentType: ${error.message}`);
  return data.id as string;
}

/** Rename / re-describe a workspace type (built-ins are RLS-blocked from writes). */
export async function updateDocumentType(
  client: SupabaseClient,
  input: { id: string; name: string; description?: string; updatedBy: UserId },
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
 * Fork a built-in (or any readable type) into an editable workspace copy,
 * carrying its section schema + approval roles (0017 RPC, atomic). Returns the
 * new type's id.
 */
export async function forkDocumentType(
  client: SupabaseClient,
  input: { sourceId: string; workspaceId: WorkspaceId },
): Promise<string> {
  const { data, error } = await client.rpc('fork_document_type', {
    p_source_id: input.sourceId,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw new Error(`forkDocumentType: ${error.message}`);
  return data as string;
}

/**
 * Archive / restore a workspace type. Archived types block new document creation
 * but leave existing documents untouched (§3.8). document_types carries
 * archived_at but no archived_by column (0004), so only updated_by is stamped.
 */
export async function setDocumentTypeArchived(
  client: SupabaseClient,
  input: { id: string; archived: boolean; userId: UserId },
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
