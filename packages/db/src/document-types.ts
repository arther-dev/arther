import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentTypeId, UserId, WorkspaceId } from '@arther/types';

/**
 * Document Type repository (G0.1): thin, typed reads/mutations over the
 * user-JWT client — RLS is active on every call (ADR-010). Document Types are a
 * Settings surface, so the 0004 policies grant read to members and write to
 * owner/admin; built-ins (workspace_id null) are globally readable and never
 * writable (fork instead). Forking goes through the atomic 0017 RPC.
 */

export interface DocumentTypeRow {
  id: DocumentTypeId;
  /** null = built-in (Arther-maintained, forkable, not editable). */
  workspace_id: WorkspaceId | null;
  name: string;
  description: string | null;
  built_in: boolean;
  forked_from: DocumentTypeId | null;
  archived_at: string | null;
  /** Convenience count for the list UI (the section schema lives in 0004). */
  section_count: number;
}

const TYPE_FIELDS = 'id, workspace_id, name, description, built_in, forked_from, archived_at';

function mapType(row: Record<string, unknown>, sectionCount: number): DocumentTypeRow {
  return {
    id: row.id as DocumentTypeId,
    workspace_id: (row.workspace_id as WorkspaceId | null) ?? null,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    built_in: row.built_in as boolean,
    forked_from: (row.forked_from as DocumentTypeId | null) ?? null,
    archived_at: (row.archived_at as string | null) ?? null,
    section_count: sectionCount,
  };
}

/**
 * Every Document Type the workspace can use: the global built-ins (workspace_id
 * null) plus the workspace's own types. RLS already scopes the workspace rows;
 * the null filter would hide built-ins, so the read leans on the policy instead.
 */
export async function listDocumentTypes(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<DocumentTypeRow[]> {
  const { data, error } = await client
    .from('document_types')
    .select(`${TYPE_FIELDS}, document_type_sections(count)`)
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('built_in', { ascending: false })
    .order('name');
  if (error) throw new Error(`listDocumentTypes: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const counted = row.document_type_sections as Array<{ count: number }> | undefined;
    return mapType(row, counted?.[0]?.count ?? 0);
  });
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

export interface DocumentTypeDetail extends DocumentTypeRow {
  sections: DocumentTypeSectionRow[];
}

/** One type with its ordered sections — the detail panel (read-only until G0.2). */
export async function getDocumentTypeDetail(
  client: SupabaseClient,
  id: DocumentTypeId,
): Promise<DocumentTypeDetail | null> {
  const { data, error } = await client
    .from('document_types')
    .select(`${TYPE_FIELDS}, sections:document_type_sections(
        id, name, display_order, spec_field_categories, brief_fragment_keys,
        brief_required, default_block_types)`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getDocumentTypeDetail: ${error.message}`);
  if (!data) return null;
  const sections = ((data as Record<string, unknown>).sections as DocumentTypeSectionRow[]) ?? [];
  return {
    ...mapType(data as Record<string, unknown>, sections.length),
    sections: [...sections].sort((a, b) => a.display_order - b.display_order),
  };
}

/** Create a workspace Document Type from scratch (sections added in G0.2). */
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
 * Fork a built-in (or any readable) type into an editable workspace copy via the
 * atomic 0017 RPC — copies the type, its sections, and its approval roles.
 */
export async function forkDocumentType(
  client: SupabaseClient,
  input: { documentTypeId: DocumentTypeId; workspaceId: WorkspaceId; name?: string },
): Promise<DocumentTypeId> {
  const { data, error } = await client.rpc('fork_document_type', {
    p_document_type_id: input.documentTypeId,
    p_workspace_id: input.workspaceId,
    p_name: input.name ?? null,
  });
  if (error) throw new Error(`forkDocumentType: ${error.message}`);
  return data as DocumentTypeId;
}

/** Rename / re-describe a workspace type. Built-ins are RLS-blocked (fork first). */
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
 * Archive / restore a workspace type (invariant 7). An archived type blocks new
 * document creation but leaves documents generated from it untouched (generator
 * spec §3.8); hard delete stays DB-guarded (0017) — no UI path.
 */
export async function setDocumentTypeArchived(
  client: SupabaseClient,
  input: { id: DocumentTypeId; archived: boolean; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('document_types')
    .update({
      archived_at: input.archived ? new Date().toISOString() : null,
      updated_by: input.updatedBy,
    })
    .eq('id', input.id);
  if (error) throw new Error(`setDocumentTypeArchived: ${error.message}`);
}
