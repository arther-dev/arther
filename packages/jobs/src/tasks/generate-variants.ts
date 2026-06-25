import { task } from '@trigger.dev/sdk';
import {
  buildFieldResolver,
  buildSectionPrompt,
  createAiGateway,
  generateDocument,
  type SectionPlan,
} from '@arther/ai-gateway';
import {
  commitGeneration,
  createServiceClient,
  getBrandProfile,
  getDocumentType,
  getEntityBrief,
  getGenerationRun,
  listUnits,
  loadDocumentTree,
  loadResolvedVariantSpec,
  setBlockVariantScope,
  setGenerationRunStatus,
  setGenerationSectionStatus,
} from '@arther/db';
import {
  mergeVariantGenerations,
  type BrandProfileId,
  type DocumentTypeId,
  type GenerationRunId,
  type GenerationRunSectionId,
  type UserId,
  type VariantId,
  type VariantGenerationOutput,
  type WorkspaceId,
} from '@arther/types';
import { variantPromptFields, variantResolverEntries } from '../variant-generation';

/**
 * V.5 — generate-per-variant + merge (Product Variants §4.3), as a durable
 * Trigger.dev task. The app authorizes + creates the `variant_set` run, then
 * triggers this; it runs on Trigger.dev's compute (long timeout + retries, never
 * the Vercel request budget). Each variant is generated INDEPENDENTLY against its
 * own resolved spec (the generator stays variant-agnostic), then the per-variant
 * block trees are merged deterministically on spec linkage
 * (`mergeVariantGenerations`) into ONE variant-aware document. Shared blocks scope
 * ALL; variant-specific blocks scope MANUAL; unlinked-prose differences surface as
 * conflicts (V.6). Service-role throughout (the async plane has no auth.uid()).
 *
 * v1 generates the variants sequentially inside one run; `batchTriggerAndWait`
 * fan-out to a per-variant subtask is the scale refinement (the merge is identical
 * either way — it's deterministic on the collected outputs).
 */
export interface GenerateVariantsPayload {
  runId: string;
  workspaceId: string;
  productId: string;
  documentTypeId: string;
  brandProfileId?: string | null;
  variantIds: string[];
  requestedBy: string;
}

export interface GenerateVariantsResult {
  documentId: string | null;
  status: 'succeeded' | 'partial' | 'failed';
  summary: { shared: number; variantSpecific: number; conflicts: number };
}

export const generateVariantsTask = task({
  id: 'generate-variants',
  run: async (payload: GenerateVariantsPayload): Promise<GenerateVariantsResult> => {
    const service = createServiceClient();
    const scope = { workspaceId: payload.workspaceId as WorkspaceId };
    const runId = payload.runId as GenerationRunId;
    const empty = { shared: 0, variantSpecific: 0, conflicts: 0 };

    try {
      await setGenerationRunStatus(service, scope, runId, { status: 'running' });

      const usage = { input: 0, output: 0 };
      const gateway = createAiGateway({
        apiKey: process.env.ANTHROPIC_API_KEY,
        onUsage: (u) => {
          usage.input += u.inputTokens;
          usage.output += u.outputTokens;
        },
      });
      if (!gateway.provisioned) {
        await setGenerationRunStatus(service, scope, runId, {
          status: 'failed',
          error: 'AI generation isn’t provisioned in this environment.',
        });
        return { documentId: null, status: 'failed', summary: empty };
      }

      const type = await getDocumentType(service, payload.documentTypeId as DocumentTypeId);
      if (!type || type.archived_at || type.sections.length === 0) {
        await setGenerationRunStatus(service, scope, runId, {
          status: 'failed',
          error: 'The Document Type is unavailable or has no sections.',
        });
        return { documentId: null, status: 'failed', summary: empty };
      }

      const [productRow, units, brief] = await Promise.all([
        service.from('products').select('name').eq('id', payload.productId).maybeSingle(),
        listUnits(service, scope.workspaceId),
        getEntityBrief(service, 'product', payload.productId),
      ]);
      const productName = (productRow.data?.name as string) ?? 'Product';
      const brand = payload.brandProfileId
        ? await getBrandProfile(service, payload.brandProfileId as BrandProfileId)
        : null;
      const unitMap = new Map<string, string>(units.map((u) => [u.id as string, u.symbol]));
      const unitSymbol = (id: string | null) => (id ? unitMap.get(id) : undefined);
      const briefFragments = brief.fragments.map((f) => ({ key: f.key, content: f.content }));

      // Generate each variant independently against its own resolved spec.
      const outputs: VariantGenerationOutput[] = [];
      for (const variantId of payload.variantIds) {
        const resolved = await loadResolvedVariantSpec(service, variantId as VariantId);
        if (!resolved) continue;
        const resolve = buildFieldResolver(
          variantResolverEntries(resolved.entries, payload.productId, unitSymbol),
        );
        const plans: SectionPlan[] = type.sections.map((s) => ({
          sectionId: `${variantId}:${s.id}`, // synthetic — per-variant runs aren't persisted
          name: s.name,
          prompt: buildSectionPrompt({
            documentTypeName: type.name,
            productName,
            sectionName: s.name,
            fields: variantPromptFields(resolved.entries, new Set(s.spec_field_categories), unitSymbol),
            briefFragments,
            brandVoice: brand?.voice_descriptors ?? [],
            toneNotes: brand?.tone_notes ?? null,
          }),
        }));
        const doc = await generateDocument({ gateway, resolve, sections: plans });
        outputs.push({ variantId, blocks: doc.blocks });
      }

      // Deterministic merge on spec linkage → one variant-aware document.
      const merge = mergeVariantGenerations(outputs);
      if (merge.blocks.length === 0) {
        await setGenerationRunStatus(service, scope, runId, {
          status: 'failed',
          error: 'No variant content was generated.',
          inputTokens: usage.input,
          outputTokens: usage.output,
        });
        return { documentId: null, status: 'failed', summary: merge.summary };
      }

      const documentId = await commitGeneration(service, scope, {
        runId,
        title: `${productName} — ${type.name} (variants)`,
        blocks: merge.blocks.map((b) => b.block),
      });

      // Apply the per-block variant visibility the merge decided (V.4): committed
      // blocks load in array order, so merged index → committed block id maps cleanly.
      const tree = await loadDocumentTree(service, documentId);
      const committed = tree?.blocks ?? [];
      for (let i = 0; i < merge.blocks.length && i < committed.length; i += 1) {
        const scopeDecision = merge.blocks[i]!.scope;
        if (scopeDecision.mode === 'MANUAL') {
          await setBlockVariantScope(service, {
            workspaceId: scope.workspaceId,
            blockId: committed[i]!.id,
            mode: 'MANUAL',
            variantIds: scopeDecision.variantIds,
            userId: payload.requestedBy as UserId,
          });
        }
      }

      // Tidy the run's section rows (created by the app for display) so the
      // status surface reads complete.
      const runData = await getGenerationRun(service, runId);
      for (const s of runData?.sections ?? []) {
        await setGenerationSectionStatus(service, scope, s.id as GenerationRunSectionId, {
          status: 'succeeded',
        });
      }

      const status = merge.conflicts.length > 0 ? 'partial' : 'succeeded';
      await setGenerationRunStatus(service, scope, runId, {
        status,
        inputTokens: usage.input,
        outputTokens: usage.output,
      });
      return { documentId, status, summary: merge.summary };
    } catch (err) {
      await setGenerationRunStatus(service, scope, runId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Variant generation failed.',
      }).catch(() => {});
      return { documentId: null, status: 'failed', summary: empty };
    }
  },
});
