import {
  generatedSectionSchema,
  resolveGeneratedSection,
  type FieldResolver,
  type GeneratedSection,
  type GenerationCommitBlock,
  type ResolvedField,
} from '@arther/types';
import type { AiGateway } from './index';

/**
 * G2.2 — the generation call shapes (the gateway's own note: "Phase 2 generation
 * adds its call shapes here, not a second client"). Per section: build the
 * prompt, force the model to return a `GeneratedSection` through the one tool,
 * then resolve its `field_id`-only tokens against the live spec graph
 * (`resolveGeneratedSection`, G2.5). A section whose tokens don't all resolve is
 * a zero-hallucination failure — it produces no blocks and is reported, so the
 * run is `partial` and the section can be retried (G2.6).
 *
 * Everything is injected (the gateway, the resolver, per-section hooks), so the
 * orchestrator is exhaustively unit-testable without a real model or DB. The app
 * supplies the real gateway + a resolver built from current field versions, and
 * hooks that persist `generation_run_sections` status (G1.4); after this returns
 * it commits the accumulated blocks via `commitGeneration` (0018).
 */

export interface ResolverEntry {
  fieldId: string;
  fieldVersionId: string;
  displayValue: string;
  unitId: string | null;
  productId: string;
  componentId: string | null;
}

/** Map field ids to their resolved current version — the `FieldResolver` the assembler calls. */
export function buildFieldResolver(entries: ReadonlyArray<ResolverEntry>): FieldResolver {
  const byId = new Map<string, ResolvedField>(
    entries.map((e) => [
      e.fieldId,
      {
        fieldVersionId: e.fieldVersionId,
        displayValue: e.displayValue,
        unitId: e.unitId,
        productId: e.productId,
        componentId: e.componentId,
      },
    ]),
  );
  return (fieldId) => byId.get(fieldId) ?? null;
}

export interface PromptField {
  fieldId: string;
  name: string;
  category: string;
  /** Current value, formatted, or '—' if empty. */
  value: string;
  /** 'product' or the owning component's name. */
  owner: string;
}

export interface SectionPromptInput {
  documentTypeName: string;
  productName: string;
  sectionName: string;
  fields: PromptField[];
  briefFragments: { key: string; content: string }[];
  brandVoice?: string[];
  toneNotes?: string | null;
  qualityNotes?: string[];
}

/** Build the system + user prompt for one section (the slot-filler injection, §5.1). */
export function buildSectionPrompt(input: SectionPromptInput): { system: string; user: string } {
  const system = [
    "You are Arther's documentation generator. You write ONE section of a technical document and return only structured blocks through the record_result tool.",
    'Rules:',
    "- Ground every specification value in the provided spec fields. To state a value, emit an inline spec_token referencing the field's id — never write the number, unit, or value as plain text.",
    "- If a value isn't in the provided fields, do not state it. Never invent or estimate values.",
    '- Use the product brief for narrative and context, not for specification values.',
    '- Match the brand voice; keep prose clear and technical.',
    `- Author blocks only for this section: ${input.sectionName}.`,
  ].join('\n');

  const fieldLines = input.fields.length
    ? input.fields.map((f) => `- [${f.fieldId}] ${f.owner} · ${f.name} (${f.category}): ${f.value}`).join('\n')
    : '(no spec fields mapped to this section)';
  const briefLines = input.briefFragments.length
    ? input.briefFragments.map((b) => `### ${b.key}\n${b.content}`).join('\n\n')
    : '(no brief fragments)';

  const user = [
    `Document type: ${input.documentTypeName}`,
    `Product: ${input.productName}`,
    `Section: ${input.sectionName}`,
    '',
    'Available spec fields (cite by id with a spec_token):',
    fieldLines,
    '',
    'Product brief:',
    briefLines,
    '',
    `Brand voice: ${input.brandVoice?.length ? input.brandVoice.join(', ') : '—'}`,
    ...(input.toneNotes ? [`Tone: ${input.toneNotes}`] : []),
    '',
    'Editorial constraints:',
    input.qualityNotes?.length ? input.qualityNotes.map((q) => `- ${q}`).join('\n') : '(none)',
  ].join('\n');

  return { system, user };
}

export interface SectionPlan {
  /** generation_run_sections.id */
  sectionId: string;
  name: string;
  prompt: { system: string; user: string };
}

export interface SectionOutcome {
  sectionId: string;
  status: 'succeeded' | 'failed';
  blocks: GenerationCommitBlock[];
  unresolvedFieldIds: string[];
  error?: string;
}

/** Generate one section: structured call → resolve → zero-hallucination gate. */
export async function generateSection(
  gateway: Pick<AiGateway, 'structured'>,
  plan: SectionPlan,
  resolve: FieldResolver,
): Promise<SectionOutcome> {
  let section: GeneratedSection;
  try {
    section = await gateway.structured({
      schema: generatedSectionSchema,
      system: plan.prompt.system,
      user: plan.prompt.user,
    });
  } catch (err) {
    return {
      sectionId: plan.sectionId,
      status: 'failed',
      blocks: [],
      unresolvedFieldIds: [],
      error: err instanceof Error ? err.message : 'generation failed',
    };
  }

  const { blocks, unresolvedFieldIds } = resolveGeneratedSection(section, resolve);
  if (unresolvedFieldIds.length > 0) {
    return {
      sectionId: plan.sectionId,
      status: 'failed',
      blocks: [],
      unresolvedFieldIds,
      error: `references unresolved fields: ${unresolvedFieldIds.join(', ')}`,
    };
  }
  return { sectionId: plan.sectionId, status: 'succeeded', blocks, unresolvedFieldIds: [] };
}

function sectionHeaderBlock(name: string): GenerationCommitBlock {
  return {
    type: 'section_header',
    source: 'structural',
    content: { type: 'section_header', title: name },
    textContent: name,
  };
}

export interface GenerateDocumentDeps {
  gateway: Pick<AiGateway, 'structured'>;
  resolve: FieldResolver;
  sections: SectionPlan[];
  onSectionStart?: (sectionId: string) => Promise<void> | void;
  onSectionDone?: (outcome: SectionOutcome) => Promise<void> | void;
}

export interface GeneratedDocument {
  blocks: GenerationCommitBlock[];
  outcomes: SectionOutcome[];
  status: 'succeeded' | 'partial' | 'failed';
}

/**
 * Run every section in order, prepending a section header to each that
 * succeeds, and report the run status. `partial` = some sections succeeded;
 * `failed` = none did. The caller persists per-section status via the hooks and
 * commits `blocks` when at least one section succeeded.
 */
export async function generateDocument(deps: GenerateDocumentDeps): Promise<GeneratedDocument> {
  const blocks: GenerationCommitBlock[] = [];
  const outcomes: SectionOutcome[] = [];
  for (const plan of deps.sections) {
    await deps.onSectionStart?.(plan.sectionId);
    const outcome = await generateSection(deps.gateway, plan, deps.resolve);
    if (outcome.status === 'succeeded') {
      blocks.push(sectionHeaderBlock(plan.name), ...outcome.blocks);
    }
    outcomes.push(outcome);
    await deps.onSectionDone?.(outcome);
  }
  const succeeded = outcomes.filter((o) => o.status === 'succeeded').length;
  const status = succeeded === outcomes.length ? 'succeeded' : succeeded === 0 ? 'failed' : 'partial';
  return { blocks, outcomes, status };
}
