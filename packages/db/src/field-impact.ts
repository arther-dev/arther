import type { SupabaseClient } from '@supabase/supabase-js';
import type { FieldChangeImpact, SpecFieldId } from '@arther/types';

const TITLE_CAP = 5;

/**
 * G6.6 — the blast radius of a global value change to one spec field: the
 * distinct documents (and the blocks within them) whose prose cites the field
 * via `block_spec_references`. Reads under RLS (members see their workspace's
 * references; the same member-read policy G6.1 staleness reads through, so the
 * G3 `documents-blocks` probe already covers the isolation). Archived documents
 * are excluded — a change can't meaningfully "affect" a document no one is
 * working on. Powers the pre-commit confirm in the spec editor.
 */
export async function getFieldChangeImpact(
  client: SupabaseClient,
  fieldId: SpecFieldId,
): Promise<FieldChangeImpact> {
  const { data, error } = await client
    .from('block_spec_references')
    .select('block_id, document_id, documents!inner(id, title, archived_at)')
    .eq('field_id', fieldId);
  if (error) throw new Error(`getFieldChangeImpact: ${error.message}`);

  const docTitles = new Map<string, string>(); // document id -> title
  const blocks = new Set<string>();
  for (const row of (data ?? []) as Array<{
    block_id: string;
    document_id: string;
    documents:
      | { id: string; title: string; archived_at: string | null }
      | Array<{ id: string; title: string; archived_at: string | null }>;
  }>) {
    const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents;
    if (!doc || doc.archived_at) continue;
    docTitles.set(doc.id, doc.title);
    blocks.add(row.block_id);
  }

  const titles = [...docTitles.values()];
  return {
    documentCount: docTitles.size,
    blockCount: blocks.size,
    documentTitles: titles.slice(0, TITLE_CAP),
    more: Math.max(0, titles.length - TITLE_CAP),
  };
}
