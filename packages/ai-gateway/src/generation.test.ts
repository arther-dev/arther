import { describe, expect, it, vi } from 'vitest';
import type { GeneratedSection } from '@arther/types';
import type { AiGateway } from './index';
import {
  buildFieldResolver,
  buildSectionPrompt,
  generateDocument,
  generateSection,
  regenerateBlock,
  type SectionPlan,
} from './generation';

const resolve = buildFieldResolver([
  { fieldId: 'F1', fieldVersionId: 'V1', displayValue: '36 V', unitId: 'U1', productId: 'P1', componentId: 'C1' },
]);

const plan = (sectionId: string): SectionPlan => ({
  sectionId,
  name: 'Electrical',
  prompt: { system: 'sys', user: 'usr' },
});

/** A gateway whose one `structured` call returns a canned section (or throws). */
const mockGateway = (impl: () => Promise<GeneratedSection>): Pick<AiGateway, 'structured'> =>
  ({ structured: impl as never }) as Pick<AiGateway, 'structured'>;

const sectionWith = (fieldId: string): GeneratedSection => ({
  section_name: 'Electrical',
  blocks: [
    {
      block_type: 'paragraph',
      source: 'spec',
      block: {
        type: 'paragraph',
        content: {
          alignment: 'left',
          nodes: [
            { type: 'text', text: 'Rated at ', marks: [] },
            { type: 'spec_token', field_id: fieldId, product_id: 'P1', component_id: 'C1' },
          ],
        },
      },
    },
  ],
});

describe('buildFieldResolver', () => {
  it('resolves known fields and returns null for unknown', () => {
    expect(resolve('F1')).toMatchObject({ fieldVersionId: 'V1', displayValue: '36 V' });
    expect(resolve('F404')).toBeNull();
  });
});

describe('buildSectionPrompt', () => {
  it('lists citable fields by id and forbids inventing values', () => {
    const { system, user } = buildSectionPrompt({
      documentTypeName: 'Datasheet',
      productName: 'Servo S2',
      sectionName: 'Electrical',
      fields: [{ fieldId: 'F1', name: 'Rated voltage', category: 'Electrical', value: '36 V', owner: 'product' }],
      briefFragments: [{ key: 'overview', content: 'A precision servo.' }],
      brandVoice: ['confident', 'precise'],
      toneNotes: null,
      qualityNotes: ['Keep sections under 200 words'],
    });
    expect(system).toMatch(/never write the number, unit, or value as plain text/i);
    expect(user).toContain('[F1] product · Rated voltage (Electrical): 36 V');
    expect(user).toContain('A precision servo.');
    expect(user).toContain('confident, precise');
  });
});

describe('generateSection', () => {
  it('resolves a section the model returns into grounded blocks', async () => {
    const outcome = await generateSection(mockGateway(async () => sectionWith('F1')), plan('S1'), resolve);
    expect(outcome.status).toBe('succeeded');
    expect(outcome.blocks).toHaveLength(1);
    expect(outcome.blocks[0]!.specRefs).toEqual([{ fieldId: 'F1' }]);
  });

  it('fails the section when a cited field does not resolve (zero-hallucination)', async () => {
    const outcome = await generateSection(mockGateway(async () => sectionWith('F404')), plan('S1'), resolve);
    expect(outcome.status).toBe('failed');
    expect(outcome.unresolvedFieldIds).toEqual(['F404']);
    expect(outcome.blocks).toEqual([]);
  });

  it('fails the section when the gateway throws', async () => {
    const outcome = await generateSection(
      mockGateway(async () => {
        throw new Error('model unavailable');
      }),
      plan('S1'),
      resolve,
    );
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toContain('model unavailable');
  });
});

describe('generateDocument', () => {
  it('runs sections in order, prepends a header to each success, and reports partial', async () => {
    const onSectionStart = vi.fn();
    const onSectionDone = vi.fn();
    let call = 0;
    const gateway = mockGateway(async () => {
      call += 1;
      return call === 1 ? sectionWith('F1') : sectionWith('F404'); // 2nd section hallucinates
    });
    const result = await generateDocument({
      gateway,
      resolve,
      sections: [plan('S1'), plan('S2')],
      onSectionStart,
      onSectionDone,
    });
    expect(result.status).toBe('partial');
    // First section: header + its paragraph. Second produced nothing.
    expect(result.blocks.map((b) => b.type)).toEqual(['section_header', 'paragraph']);
    expect(result.outcomes.map((o) => o.status)).toEqual(['succeeded', 'failed']);
    expect(onSectionStart).toHaveBeenCalledTimes(2);
    expect(onSectionDone).toHaveBeenCalledTimes(2);
  });

  it('reports failed when no section succeeds', async () => {
    const result = await generateDocument({
      gateway: mockGateway(async () => sectionWith('F404')),
      resolve,
      sections: [plan('S1')],
    });
    expect(result.status).toBe('failed');
    expect(result.blocks).toEqual([]);
  });
});

describe('buildSectionPrompt — single-block focus (G7.1)', () => {
  it('targets one block and includes its current text', () => {
    const { system, user } = buildSectionPrompt({
      documentTypeName: 'Datasheet',
      productName: 'Servo S2',
      sectionName: 'Electrical',
      fields: [{ fieldId: 'F1', name: 'Rated voltage', category: 'Electrical', value: '36 V', owner: 'product' }],
      briefFragments: [],
      focus: { blockType: 'paragraph', currentText: 'The servo is rated at 36 V.' },
    });
    expect(system).toMatch(/Rewrite ONLY the single paragraph block/i);
    expect(system).not.toMatch(/Author blocks only for this section/i);
    expect(user).toContain('Block to rewrite (a paragraph) — current text:');
    expect(user).toContain('The servo is rated at 36 V.');
  });
});

describe('regenerateBlock (G7.1)', () => {
  const regenPlan = { blockType: 'paragraph' as const, prompt: { system: 'sys', user: 'usr' } };

  it('returns a grounded replacement block of the target type', async () => {
    const outcome = await regenerateBlock(mockGateway(async () => sectionWith('F1')), regenPlan, resolve);
    expect(outcome.status).toBe('succeeded');
    expect(outcome.block?.type).toBe('paragraph');
    expect(outcome.block?.specRefs).toEqual([{ fieldId: 'F1' }]);
  });

  it('fails (no block) when a cited field does not resolve (zero-hallucination)', async () => {
    const outcome = await regenerateBlock(mockGateway(async () => sectionWith('F404')), regenPlan, resolve);
    expect(outcome.status).toBe('failed');
    expect(outcome.block).toBeUndefined();
    expect(outcome.unresolvedFieldIds).toEqual(['F404']);
  });

  it('fails when the gateway throws', async () => {
    const outcome = await regenerateBlock(
      mockGateway(async () => {
        throw new Error('model unavailable');
      }),
      regenPlan,
      resolve,
    );
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toContain('model unavailable');
  });
});
