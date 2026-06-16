import type { SupabaseClient } from '@supabase/supabase-js';
import { searchSnippet, type ComponentId, type DocumentId, type ProductId, type SpecFieldId, type WorkspaceId } from '@arther/types';

/**
 * G4.7 — workspace search across three scopes (the in-doc scope is the editor's
 * find/replace). All reads go through the user client under RLS, so results are
 * the caller's workspace only:
 *   • documents — full-text over block prose (`blocks.text_search`), narrowed to
 *     each document's current revision and non-archived documents;
 *   • spec values — spec fields by name;
 *   • library — components by name.
 * Each scope is capped; the page renders them grouped with deep links.
 */
export interface DocumentHit {
  documentId: DocumentId;
  title: string;
  productId: ProductId;
  snippet: string;
}
export interface SpecFieldHit {
  fieldId: SpecFieldId;
  name: string;
  category: string;
  productId: ProductId | null;
  componentId: ComponentId | null;
}
export interface ComponentHit {
  componentId: ComponentId;
  name: string;
  type: string;
}
export interface WorkspaceSearchResults {
  documents: DocumentHit[];
  specFields: SpecFieldHit[];
  components: ComponentHit[];
}

const EMPTY: WorkspaceSearchResults = { documents: [], specFields: [], components: [] };
const LIMIT = 20;

/** Escape PostgREST `ilike` wildcards in user input before the contains match. */
function ilikeTerm(query: string): string {
  return `%${query.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export async function searchWorkspace(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
  query: string,
): Promise<WorkspaceSearchResults> {
  const q = query.trim();
  if (q.length === 0) return EMPTY;
  const like = ilikeTerm(q);

  const [blockRes, fieldRes, componentRes] = await Promise.all([
    client
      .from('blocks')
      .select('document_id, revision_id, text_content')
      .eq('workspace_id', workspaceId)
      .textSearch('text_search', q, { type: 'websearch', config: 'english' })
      .limit(80),
    client
      .from('spec_fields')
      .select('id, name, category, product_id, component_id')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .ilike('name', like)
      .limit(LIMIT),
    client
      .from('components')
      .select('id, name, type')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .ilike('name', like)
      .limit(LIMIT),
  ]);

  if (blockRes.error) throw new Error(`searchWorkspace.blocks: ${blockRes.error.message}`);
  if (fieldRes.error) throw new Error(`searchWorkspace.fields: ${fieldRes.error.message}`);
  if (componentRes.error) throw new Error(`searchWorkspace.components: ${componentRes.error.message}`);

  // Resolve block hits to documents: keep only current-revision, non-archived
  // documents, one hit per document (the first, with a snippet).
  const blockHits = blockRes.data ?? [];
  const documentIds = [...new Set(blockHits.map((b) => b.document_id as string))];
  const documents: DocumentHit[] = [];
  if (documentIds.length > 0) {
    const { data: docs, error } = await client
      .from('documents')
      .select('id, title, product_id, current_revision_id')
      .in('id', documentIds)
      .is('archived_at', null);
    if (error) throw new Error(`searchWorkspace.documents: ${error.message}`);
    const byId = new Map((docs ?? []).map((d) => [d.id as string, d]));
    const seen = new Set<string>();
    for (const hit of blockHits) {
      const doc = byId.get(hit.document_id as string);
      if (!doc || hit.revision_id !== doc.current_revision_id) continue; // stale-revision match
      if (seen.has(doc.id as string)) continue;
      seen.add(doc.id as string);
      documents.push({
        documentId: doc.id as DocumentId,
        title: doc.title as string,
        productId: doc.product_id as ProductId,
        snippet: searchSnippet((hit.text_content as string | null) ?? '', q),
      });
      if (documents.length >= LIMIT) break;
    }
  }

  return {
    documents,
    specFields: (fieldRes.data ?? []).map((f) => ({
      fieldId: f.id as SpecFieldId,
      name: f.name as string,
      category: f.category as string,
      productId: (f.product_id as ProductId | null) ?? null,
      componentId: (f.component_id as ComponentId | null) ?? null,
    })),
    components: (componentRes.data ?? []).map((c) => ({
      componentId: c.id as ComponentId,
      name: c.name as string,
      type: c.type as string,
    })),
  };
}
