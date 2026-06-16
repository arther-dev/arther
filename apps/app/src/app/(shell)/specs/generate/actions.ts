'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import { rateLimit } from '@arther/rate-limit';
import {
  buildFieldResolver,
  buildSectionPrompt,
  createAiGateway,
  generateDocument,
  type PromptField,
  type ResolverEntry,
  type SectionPlan,
} from '@arther/ai-gateway';
import {
  addBriefReference,
  addPlaceholderReference,
  commitGeneration,
  createGenerationRun,
  createServiceClient,
  getActiveWorkspace,
  getBrandProfile,
  getDocumentType,
  getEntityBrief,
  getGenerationRun,
  listUnits,
  loadDocumentTree,
  loadGenerationFields,
  membershipLookupFor,
  recordAnalyticsEvent,
  setGenerationRunStatus,
  setGenerationSectionStatus,
  type DocumentTypeDetail,
  type GenerationRunSectionRow,
} from '@arther/db';
import {
  formatFieldValue,
  type BrandProfileId,
  type DocumentTypeId,
  type GenerationRunId,
  type GenerationRunSectionId,
  type GenerationRunStatus,
  type GenerationSectionStatus,
  type ProductId,
  type UserId,
  type WorkspaceId,
} from '@arther/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface GenerateFormState {
  error?: string;
}

export interface RunStatusView {
  status: GenerationRunStatus;
  error: string | null;
  documentId: string | null;
  sections: { id: string; name: string; status: GenerationSectionStatus; error: string | null }[];
}

/**
 * G2.8 — the live read for the generation-status surface. The client polls this
 * (and re-reads it on a Realtime push, once that lands) while a run is running.
 * Reads through the user session under RLS, so a run outside the caller's
 * workspace simply isn't visible. A lean, serializable projection of the run +
 * its sections in display order.
 */
export async function getRunStatusAction(runId: string): Promise<RunStatusView | null> {
  if (!z.string().uuid().safeParse(runId).success) return null;
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const runData = await getGenerationRun(supabase, runId as GenerationRunId);
  if (!runData) return null;
  return {
    status: runData.run.status,
    error: runData.run.error ?? null,
    documentId: runData.run.document_id ?? null,
    sections: runData.sections.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      error: s.error ?? null,
    })),
  };
}

const schema = z.object({
  productId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  brandProfileId: z.string().uuid().optional().or(z.literal('')),
});

/**
 * G2 — confirm pre-flight and generate. Authorizes `doc.generate`, creates the
 * run (service client, G1.4), then runs the generator inline when the gateway is
 * provisioned: per section it injects the mapped fields + brief + brand, asks
 * Claude for grounded blocks, resolves every token (zero-hallucination), and
 * commits the assembled tree atomically (0018). Without `ANTHROPIC_API_KEY` the
 * run stays `queued` and degrades honestly. Inline until G1.2 Trigger.dev.
 */
export async function createGenerationRunAction(
  _prev: GenerateFormState,
  formData: FormData,
): Promise<GenerateFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Pick a product and a Document Type.' };

  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' };

  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.generate', { workspaceId: workspace.id }))) {
    return { error: 'Viewers can’t generate documents — ask for an Editor seat.' };
  }

  // G8.5 — cap generations per member; each run is a multi-section paid AI call.
  const throttle = await rateLimit('generation', user.id);
  if (!throttle.success) {
    return { error: `Too many generations in a short window — wait ${throttle.retryAfterSeconds}s and retry.` };
  }

  const type = await getDocumentType(supabase, parsed.data.documentTypeId as DocumentTypeId);
  if (!type || type.archived_at) return { error: 'That Document Type is unavailable.' };
  if (type.sections.length === 0) {
    return { error: 'That Document Type has no sections to generate yet.' };
  }

  const productId = parsed.data.productId as ProductId;
  const brandProfileId = parsed.data.brandProfileId || undefined;
  const scope = { workspaceId: workspace.id };

  let runId: string;
  try {
    const service = createServiceClient();
    const { run, sections } = await createGenerationRun(service, scope, {
      productId,
      documentTypeId: parsed.data.documentTypeId as DocumentTypeId,
      brandProfileId,
      kind: 'document',
      sections: type.sections.map((section) => ({
        name: section.name,
        documentTypeSectionId: section.id,
        displayOrder: section.display_order,
      })),
      requestedBy: user.id as UserId,
    });
    runId = run.id;

    const usage = { input: 0, output: 0 };
    const gateway = createAiGateway({
      apiKey: process.env.ANTHROPIC_API_KEY,
      onUsage: (u) => {
        usage.input += u.inputTokens;
        usage.output += u.outputTokens;
        console.info('[ai-gateway] generation', JSON.stringify(u));
      },
    });
    if (gateway.provisioned) {
      await runGenerationInline({
        supabase,
        service,
        gateway,
        usage,
        scope: scope as { workspaceId: WorkspaceId },
        runId: run.id as GenerationRunId,
        runSections: sections,
        type,
        productId,
        brandProfileId: brandProfileId as BrandProfileId | undefined,
        requestedBy: user.id as UserId,
      });
    }
  } catch (err) {
    return { error: err instanceof Error && err.name === 'EnvNotProvisionedError' ? 'Not configured in this environment yet.' : 'Could not generate the document.' };
  }

  redirect(
    `/specs/generate?product=${parsed.data.productId}&type=${parsed.data.documentTypeId}&run=${runId}`,
  );
}

/**
 * Run a queued run to a committed Draft (or partial/failed), inline. Section
 * statuses stream into `generation_run_sections` via the hooks; the assembled
 * blocks commit atomically at the end. Failures here flip the run to `failed`
 * rather than throwing past the action.
 */
async function runGenerationInline(ctx: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  gateway: ReturnType<typeof createAiGateway>;
  usage: { input: number; output: number };
  scope: { workspaceId: WorkspaceId };
  runId: GenerationRunId;
  runSections: GenerationRunSectionRow[];
  type: DocumentTypeDetail;
  productId: ProductId;
  brandProfileId?: BrandProfileId;
  requestedBy: UserId;
}): Promise<void> {
  const { supabase, service, gateway, usage, scope, runId, runSections, type, productId, brandProfileId, requestedBy } = ctx;

  try {
    await setGenerationRunStatus(service, scope, runId, { status: 'running' });

    const [product, fields, units, brief] = await Promise.all([
      supabase.from('products').select('name').eq('id', productId).maybeSingle(),
      loadGenerationFields(supabase, productId),
      listUnits(supabase, scope.workspaceId),
      getEntityBrief(supabase, 'product', productId),
    ]);
    const productName = (product.data?.name as string) ?? 'Product';
    const brand = brandProfileId ? await getBrandProfile(supabase, brandProfileId) : null;

    const unitSymbol = new Map(units.map((u) => [u.id, u.symbol]));
    const display = (f: (typeof fields)[number]) =>
      formatFieldValue(f.type, f.value, f.unit_id ? unitSymbol.get(f.unit_id) : undefined);

    // Only fields with a current version (a real value) are citable.
    const resolverEntries: ResolverEntry[] = fields
      .filter((f) => f.current_version_id !== null)
      .map((f) => ({
        fieldId: f.id,
        fieldVersionId: f.current_version_id as string,
        displayValue: display(f),
        unitId: f.unit_id,
        productId,
        componentId: f.component_id,
      }));
    const resolve = buildFieldResolver(resolverEntries);

    const sectionById = new Map(type.sections.map((s) => [s.id, s]));
    const briefFragments = brief.fragments.map((fr) => ({ key: fr.key, content: fr.content }));
    // G2.7 — brief keys with real content; a required key absent from this set
    // becomes a placeholder block.
    const populatedBriefKeys = new Set(
      brief.fragments.filter((fr) => fr.content.trim().length > 0).map((fr) => fr.key),
    );
    const plans: SectionPlan[] = runSections.map((rs) => {
      const dts = rs.document_type_section_id ? sectionById.get(rs.document_type_section_id) : undefined;
      const categories = new Set(dts?.spec_field_categories ?? []);
      const missingBriefKeys = dts?.brief_required
        ? (dts.brief_fragment_keys ?? []).filter((k) => !populatedBriefKeys.has(k))
        : [];
      const promptFields: PromptField[] = fields
        .filter((f) => categories.has(f.category))
        .map((f) => ({
          fieldId: f.id,
          name: f.name,
          category: f.category,
          value: display(f),
          owner: f.owner === 'component' ? (f.component_name ?? 'component') : 'product',
        }));
      return {
        sectionId: rs.id,
        name: rs.name,
        prompt: buildSectionPrompt({
          documentTypeName: type.name,
          productName,
          sectionName: rs.name,
          fields: promptFields,
          briefFragments,
          brandVoice: brand?.voice_descriptors ?? [],
          toneNotes: brand?.tone_notes ?? null,
        }),
        missingBriefKeys,
      };
    });

    const result = await generateDocument({
      gateway,
      resolve,
      sections: plans,
      onSectionStart: (sectionId) =>
        setGenerationSectionStatus(service, scope, sectionId as GenerationRunSectionId, {
          status: 'running',
        }),
      onSectionDone: (o) =>
        setGenerationSectionStatus(service, scope, o.sectionId as GenerationRunSectionId, {
          status: o.status,
          error: o.error ?? null,
        }),
    });

    if (result.blocks.length === 0) {
      await setGenerationRunStatus(service, scope, runId, {
        status: 'failed',
        error: 'No sections generated successfully.',
        inputTokens: usage.input,
        outputTokens: usage.output,
      });
      return;
    }

    const documentId = await commitGeneration(service, scope, {
      runId,
      title: `${productName} — ${type.name}`,
      blocks: result.blocks,
    });
    await setGenerationRunStatus(service, scope, runId, {
      status: result.status === 'partial' ? 'partial' : 'succeeded',
      inputTokens: usage.input,
      outputTokens: usage.output,
    });

    // G7.3 + G2.7 spines — record block→brief references and placeholder→brief
    // references (best-effort; never fails the generation). Committed blocks load
    // in the same order as result.blocks (commit inserts by array index), so
    // index → block id maps cleanly; we track the current section header for the
    // placeholder's section_name.
    try {
      const tree = await loadDocumentTree(service, documentId);
      const committed = tree?.blocks ?? [];
      const fragmentContent = new Map(brief.fragments.map((fr) => [fr.key, fr.content]));
      let currentSection: string | undefined;
      for (let i = 0; i < result.blocks.length && i < committed.length; i += 1) {
        const rb = result.blocks[i]!;
        if (rb.content.type === 'section_header') currentSection = rb.content.title;

        if (brief.briefId && rb.briefKey && fragmentContent.has(rb.briefKey)) {
          await addBriefReference(service, {
            workspaceId: scope.workspaceId,
            documentId,
            blockId: committed[i]!.id,
            briefId: brief.briefId,
            fragmentKey: rb.briefKey,
            contentSnapshot: fragmentContent.get(rb.briefKey) ?? undefined,
          });
        }
        if (rb.placeholderBriefKey) {
          await addPlaceholderReference(service, {
            workspaceId: scope.workspaceId,
            documentId,
            blockId: committed[i]!.id,
            entityType: 'product',
            entityId: productId,
            fragmentKey: rb.placeholderBriefKey,
            sectionName: currentSection,
          });
        }
      }
    } catch (e) {
      console.error('[refs] writing block_brief / placeholder references failed', e);
    }

    // G8.2 — metering hook (best-effort; never fails the generation).
    try {
      await recordAnalyticsEvent(service, scope, {
        eventType: 'document_generated',
        actorUserId: requestedBy,
        documentId,
        payload: {
          runId,
          productId,
          documentTypeId: type.id,
          status: result.status,
          inputTokens: usage.input,
          outputTokens: usage.output,
        },
      });
    } catch (e) {
      console.error('[analytics] document_generated failed', e);
    }
  } catch {
    await setGenerationRunStatus(service, scope, runId, {
      status: 'failed',
      error: 'Generation failed — see logs.',
    }).catch(() => {});
  }
}
