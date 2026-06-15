import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, WorkspaceId } from '@arther/types';

/**
 * Document Type repository (G0.1 / G0.2): the generation schema — built-in
 * (workspace_id null, forkable, not editable) and workspace types, each
 * carrying an ordered section data contract (categories → section). Thin, typed
 * calls over the user-JWT client; RLS is active (ADR-010): built-ins read by
 * all, workspace types/sections written by owner/admin only (0004 policies).
 * Forking copies a type + sections + approval roles atomically via the 0017
 * RPC (multi-row copy can't be atomic over PostgREST from the client).
 */

export interface DocumentTypeSectionRow {
  id: string;
  document_type_id: string;
  name: string;
  display_order: number;
  /** Spec field categories that feed this section (category names). */
  spec_field_categories: string[];
  brief_fragment_keys: string[];
  brief_required: boolean;
  default_block_types: string[];
}

export interface DocumentTypeRow {
  id: string;
  /** null = built-in (global, forkable, not editable). */
  workspace_id: WorkspaceId | null;
  name: string;
  description: string | null;
  built_in: boolean;
  /** Source type id when this is a fork (0004). */
  forked_from: string | null;
  archived_at: string | null;
  sections: DocumentTypeSectionRow[];
}

const SECTION_COLS =
  'id, document_type_id, name, display_order, spec_field_categories, brief_fragment_keys, brief_required, default_block_types';

function toSection(row: Record<string, unknown>): DocumentTypeSectionRow {
  return {
    id: row.id as string,
    document_type_id: row.document_type_id as string,
    name: row.name as string,
    display_order: row.display_order as number,
    spec_field_categories: (row.spec_field_categories as string[] | null) ?? [],
    brief_fragment_keys: (row.brief_fragment_keys as string[] | null) ?? [],
    brief_required: Boolean(row.brief_required),
    default_block_types: (row.default_block_types as string[] | null) ?? [],
  };
}

/**
 * All Document Types visible to the workspace: the global built-ins plus this
 * workspace's own (archived excluded), each with its ordered section schema.
 * RLS already scopes the read; the workspace_id filter keeps other tenants out
 * even if a policy regressed (defence in depth).
 */
export async function listDocumentTypes(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<DocumentTypeRow[]> {
  const { data: types, error } = await client
    .from('document_types')
    .select('id, workspace_id, name, description, built_in, forked_from, archived_at')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .is('archived_at', null)
    .order('built_in', { ascending: false })
    .order('name');
  if (error) throw new Error(`listDocumentTypes: ${error.message}`);

  const ids = (types ?? []).map((t) => (t as { id: string }).id);
  const sectionsByType = new Map<string, DocumentTypeSectionRow[]>();
  if (ids.length > 0) {
    const { data: sections, error: secErr } = await client
      .from('document_type_sections')
      .select(SECTION_COLS)
      .in('document_type_id', ids)
      .order('display_order');
    if (secErr) throw new Error(`listDocumentTypes(sections): ${secErr.message}`);
    for (const raw of sections ?? []) {
      const s = toSection(raw as Record<string, unknown>);
      const list = sectionsByType.get(s.document_type_id) ?? [];
      list.push(s);
      sectionsByType.set(s.document_type_id, list);
    }
  }

  return (types ?? []).map((t) => {
    const row = t as Record<string, unknown>;
    return {
      id: row.id as string,
      workspace_id: (row.workspace_id as WorkspaceId | null) ?? null,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      built_in: Boolean(row.built_in),
      forked_from: (row.forked_from as string | null) ?? null,
      archived_at: (row.archived_at as string | null) ?? null,
      sections: sectionsByType.get(row.id as string) ?? [],
    };
  });
}

export async function createDocumentType(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; name: string; description?: string | null; createdBy: UserId },
): Promise<string> {
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
  return data.id as string;
}

/** Atomic copy of a type + sections + approval roles into the workspace (0017). */
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

export async function updateDocumentType(
  client: SupabaseClient,
  input: { id: string; name: string; description?: string | null; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('document_types')
    .update({ name: input.name, description: input.description ?? null, updated_by: input.updatedBy })
    .eq('id', input.id);
  if (error) throw new Error(`updateDocumentType: ${error.message}`);
}

/** Archive-when-referenced (invariant 7): existing documents keep their type. */
export async function archiveDocumentType(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from('document_types')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`archiveDocumentType: ${error.message}`);
}

export async function createSection(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentTypeId: string;
    name: string;
    displayOrder: number;
    specFieldCategories: string[];
    briefRequired: boolean;
    createdBy: UserId;
  },
): Promise<string> {
  const { data, error } = await client
    .from('document_type_sections')
    .insert({
      workspace_id: input.workspaceId,
      document_type_id: input.documentTypeId,
      name: input.name,
      display_order: input.displayOrder,
      spec_field_categories: input.specFieldCategories,
      brief_required: input.briefRequired,
      created_by: input.createdBy,
      updated_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createSection: ${error.message}`);
  return data.id as string;
}

export async function updateSection(
  client: SupabaseClient,
  input: {
    id: string;
    name: string;
    specFieldCategories: string[];
    briefRequired: boolean;
    updatedBy: UserId;
  },
): Promise<void> {
  const { error } = await client
    .from('document_type_sections')
    .update({
      name: input.name,
      spec_field_categories: input.specFieldCategories,
      brief_required: input.briefRequired,
      updated_by: input.updatedBy,
    })
    .eq('id', input.id);
  if (error) throw new Error(`updateSection: ${error.message}`);
}

export async function deleteSection(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('document_type_sections').delete().eq('id', id);
  if (error) throw new Error(`deleteSection: ${error.message}`);
}

/**
 * Persist a new section order. display_order is cosmetic ordering, so the
 * per-row updates need not be transactional — a partial failure only leaves a
 * stale order, never inconsistent data; the next reorder fixes it.
 */
export async function reorderSections(
  client: SupabaseClient,
  input: { orderedIds: string[]; updatedBy: UserId },
): Promise<void> {
  for (let i = 0; i < input.orderedIds.length; i += 1) {
    const { error } = await client
      .from('document_type_sections')
      .update({ display_order: i + 1, updated_by: input.updatedBy })
      .eq('id', input.orderedIds[i]!);
    if (error) throw new Error(`reorderSections: ${error.message}`);
  }
}
