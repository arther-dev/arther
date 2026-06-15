import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlockContent,
  BlockSource,
  BlockType,
  DegradationConfig,
  DocumentId,
  GenerationRunId,
  SpecFieldId,
} from '@arther/types';
import { rpcError } from './errors';
import { scopedServiceQuery, type WorkspaceScope } from './guard';

/**
 * G2.6 — commit a generation run into a Draft via the 0018 `commit_generation`
 * RPC: atomic document + revision + block tree + spec references, with
 * zero-hallucination resolution (each `specRefs.fieldId` is resolved to the
 * field's CURRENT version in the DB and rejected if unknown/valueless, G2.5).
 *
 * Service-role only (the RPC's EXECUTE is revoked from clients), so this takes
 * the SERVICE client under a workspace scope (guardrail 1). The app authorizes
 * `doc.generate` before reaching here.
 */
export interface GenerationCommitBlock {
  type: BlockType;
  source: BlockSource;
  content: BlockContent;
  degradation?: DegradationConfig;
  textContent?: string | null;
  /** Fields this block cites — resolved to current versions in the RPC. */
  specRefs?: { fieldId: SpecFieldId }[];
}

export async function commitGeneration(
  service: SupabaseClient,
  scope: WorkspaceScope,
  input: { runId: GenerationRunId; title: string; blocks: GenerationCommitBlock[] },
): Promise<DocumentId> {
  return scopedServiceQuery(scope, async () => {
    const blocks = input.blocks.map((block) => ({
      type: block.type,
      source: block.source,
      content: block.content,
      degradation: block.degradation ?? {},
      text_content: block.textContent ?? null,
      spec_refs: (block.specRefs ?? []).map((ref) => ({ field_id: ref.fieldId })),
    }));
    const { data, error } = await service.rpc('commit_generation', {
      p_run_id: input.runId,
      p_title: input.title,
      p_blocks: blocks,
    });
    if (error) throw rpcError('commitGeneration', error);
    return data as DocumentId;
  });
}
