import type { SupabaseClient } from '@supabase/supabase-js';
import { rpcError } from './errors';
import type {
  BlockType,
  DocumentTypeId,
  DocumentTypeSectionId,
  DocumentTypeSectionInput,
  UserId,
  WorkspaceId,
} from '@arther/types';

/**
 * Document Types repository (G0.1/G0.2): the generation-schema config surface.
 * Reads/writes ride the user-JWT client so RLS is active — the 0004 policies
 * make built-ins (workspace_id null) globally readable and gate every write to
 * owner/admin (Settings surface). Forking is atomic via the 0017 RPC; sections
 * are plain admin-gated writes. Section contracts are validated against the
 * @arther/types Zod schema BEFORE any write (ADR-012, one schema source).
 */

export interface DocumentTypeRow {
  id: DocumentTypeId;
  /** null for the global built-ins (forkable, not editable). */
  workspace_id: WorkspaceId | null;
  name: string;
  description: string | null;
  built_in: boolean;
  forked_from: DocumentTypeId | null;
  archived_at: string | null;
  section_count: number;
}

export interface DocumentTypeSectionRow {
  id: DocumentTypeSectionId;
  document_type_id: DocumentTypeId;
  name: string;
  display_order: number;
  spec_field_categories: string[];
  brief_fragment_keys: string[];
  brief_required: boolean;
  default_block_types: BlockType[];
}

export interface DocumentTypeDetail extends Omit<DocumentTypeRow, 'section_count'> {
  sections: DocumentTypeSectionRow[];
}

/** Built-ins (workspace_id null) + this workspace's types; built-ins first, then by name. */
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

const SECTION_COLUMNS =
  'id, document_type_id, name, display_order, spec_field_categories, brief_fragment_keys, brief_required, default_block_types';

export async function getDocumentType(
  client: SupabaseClient,
  id: DocumentTypeId,
): Promise<DocumentTypeDetail | null> {
  const { data, error } = await client
    .from('document_types')
    .select('id, workspace_id, name, description, built_in, forked_from, archived_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getDocumentType: ${error.message}`);
  if (!data) return null;
  const { data: sections, error: sectionsError } = await client
    .from('document_type_sections')
    .select(SECTION_COLUMNS)
    .eq('document_type_id', id)
    .order('display_order');
  if (sectionsError) throw new Error(`getDocumentType sections: ${sectionsError.message}`);
  return {
    ...(data as Omit<DocumentTypeRow, 'section_count'>),
    sections: (sections ?? []) as DocumentTypeSectionRow[],
  };
}

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
 * Fork a built-in (or duplicate a workspace type) into an editable workspace
 * copy — atomic via the 0017 RPC (row + sections + approval roles). The source
 * built-in stays canonical (§3.4).
 */
export async function forkDocumentType(
  client: SupabaseClient,
  input: { sourceId: DocumentTypeId; workspaceId: WorkspaceId },
): Promise<DocumentTypeId> {
  const { data, error } = await client.rpc('fork_document_type', {
    p_source_id: input.sourceId,
    p_workspace_id: input.workspaceId,
  });
  if (error) throw rpcError('forkDocumentType', error);
  return data as DocumentTypeId;
}

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
 * Archive (or restore) a workspace Document Type. Archived types block NEW
 * document creation but never touch existing documents (§3.8) — so archive,
 * not delete, is the lifecycle action even once documents reference a type.
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

export async function createSection(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentTypeId: DocumentTypeId;
    section: DocumentTypeSectionInput;
    displayOrder: number;
    createdBy: UserId;
  },
): Promise<DocumentTypeSectionId> {
  const { data, error } = await client
    .from('document_type_sections')
    .insert({
      workspace_id: input.workspaceId,
      document_type_id: input.documentTypeId,
      name: input.section.name,
      display_order: input.displayOrder,
      spec_field_categories: input.section.spec_field_categories,
      brief_fragment_keys: input.section.brief_fragment_keys,
      brief_required: input.section.brief_required,
      default_block_types: input.section.default_block_types,
      created_by: input.createdBy,
      updated_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createSection: ${error.message}`);
  return data.id as DocumentTypeSectionId;
}

export async function updateSection(
  client: SupabaseClient,
  input: { id: DocumentTypeSectionId; section: DocumentTypeSectionInput; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('document_type_sections')
    .update({
      name: input.section.name,
      spec_field_categories: input.section.spec_field_categories,
      brief_fragment_keys: input.section.brief_fragment_keys,
      brief_required: input.section.brief_required,
      default_block_types: input.section.default_block_types,
      updated_by: input.updatedBy,
    })
    .eq('id', input.id);
  if (error) throw new Error(`updateSection: ${error.message}`);
}

export async function deleteSection(
  client: SupabaseClient,
  id: DocumentTypeSectionId,
): Promise<void> {
  const { error } = await client.from('document_type_sections').delete().eq('id', id);
  if (error) throw new Error(`deleteSection: ${error.message}`);
}

/**
 * Rewrite display_order to match the given section order (1-based). Used by the
 * move-up/down affordance — the action reads current order, swaps neighbours,
 * and submits the full order. Each update is admin-gated by RLS.
 */
export async function reorderSections(
  client: SupabaseClient,
  input: { orderedSectionIds: DocumentTypeSectionId[]; updatedBy: UserId },
): Promise<void> {
  for (let i = 0; i < input.orderedSectionIds.length; i++) {
    const { error } = await client
      .from('document_type_sections')
      .update({ display_order: i + 1, updated_by: input.updatedBy })
      .eq('id', input.orderedSectionIds[i]!);
    if (error) throw new Error(`reorderSections: ${error.message}`);
  }
}
