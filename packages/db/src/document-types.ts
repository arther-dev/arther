import type { SupabaseClient } from '@supabase/supabase-js';
import { rpcError } from './errors';
import type { DocumentTypeId, UserId, WorkspaceId } from '@arther/types';

/**
 * Document Types repository (G0.1): the generation schema. Built-in types are
 * global (workspace_id null), forkable but not editable — the 0004 RLS write
 * policy blocks any mutation of a workspace_id-null row, so a workspace
 * customises a fork instead. All reads/writes go through the user-JWT client
 * with RLS active (ADR-010); fork is the one atomic multi-table op and runs
 * through the 0017 invoker-rights RPC.
 */

export interface DocumentTypeRow {
  id: DocumentTypeId;
  /** null = built-in (global, read-only). */
  workspace_id: WorkspaceId | null;
  name: string;
  description: string | null;
  built_in: boolean;
  /** Source built-in id when this is a workspace fork. */
  forked_from: DocumentTypeId | null;
  archived_at: string | null;
  /** Sections defining this type's data contract — the schema's shape. */
  section_count: number;
}

const TYPE_COLUMNS =
  'id, workspace_id, name, description, built_in, forked_from, archived_at, document_type_sections(count)';

function mapRow(row: unknown): DocumentTypeRow {
  const { document_type_sections, ...rest } = row as DocumentTypeRow & {
    document_type_sections: Array<{ count: number }>;
  };
  return { ...rest, section_count: document_type_sections?.[0]?.count ?? 0 };
}

/**
 * The picker list: every built-in (workspace_id null) plus the workspace's own
 * types, non-archived, built-ins first then alphabetical. The 0004 read policy
 * already scopes this to built-ins + the caller's workspace; the explicit
 * filter keeps the query intent visible.
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
  return (data ?? []).map(mapRow);
}

/** Archived workspace types for the restore disclosure. */
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
  return (data ?? []).map(mapRow);
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

/** A type's ordered section schema — read-only here (editing lands in G0.2). */
export async function listDocumentTypeSections(
  client: SupabaseClient,
  typeId: DocumentTypeId,
): Promise<DocumentTypeSectionRow[]> {
  const { data, error } = await client
    .from('document_type_sections')
    .select(
      'id, name, display_order, spec_field_categories, brief_fragment_keys, brief_required, default_block_types',
    )
    .eq('document_type_id', typeId)
    .order('display_order');
  if (error) throw new Error(`listDocumentTypeSections: ${error.message}`);
  return (data ?? []) as DocumentTypeSectionRow[];
}

/** Create a workspace Document Type from scratch (admin-gated by RLS). */
export async function createDocumentType(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    name: string;
    description?: string;
    createdBy: UserId;
  },
): Promise<DocumentTypeId> {
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
  return data.id as DocumentTypeId;
}

/** Rename / re-describe a workspace type (built-ins are RLS-blocked). */
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
 * Fork a built-in into an editable workspace copy — atomic over type +
 * sections + approval roles via the 0017 RPC (invoker rights, so the admin
 * write policy governs). Returns the new type's id.
 */
export async function forkDocumentType(
  client: SupabaseClient,
  input: { typeId: DocumentTypeId; workspaceId: WorkspaceId },
): Promise<DocumentTypeId> {
  const { data, error } = await client.rpc('fork_document_type', {
    p_type_id: input.typeId,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw rpcError('forkDocumentType', error);
  return data as DocumentTypeId;
}

/**
 * Soft archive / restore a workspace type. Archived types block new document
 * creation but leave existing documents untouched (generator spec §3.8); hard
 * delete stays DB-guarded once documents reference the type (G3.4).
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
