import { describe, expect, it } from 'vitest';
import type { GeneratedBlock, GeneratedSection } from './block-content';
import { resolveGeneratedSection, type FieldResolver } from './generation-assembly';

const resolve: FieldResolver = (fieldId) => {
  if (fieldId === 'F1')
    return { fieldVersionId: 'V1', displayValue: '36 V', unitId: 'U1', productId: 'P1', componentId: 'C1' };
  if (fieldId === 'Fbool')
    return { fieldVersionId: 'Vb', displayValue: 'Yes', unitId: null, productId: 'P1', componentId: 'C1' };
  return null;
};

const textNode = (text: string) => ({ type: 'text' as const, text, marks: [] });
const tokenNode = (fieldId: string) => ({
  type: 'spec_token' as const,
  field_id: fieldId,
  product_id: 'P1',
  component_id: 'C1',
});

const section = (...blocks: GeneratedBlock[]): GeneratedSection => ({ section_name: 'Specs', blocks });

const paragraph = (fieldId: string, source: GeneratedBlock['source'] = 'spec'): GeneratedBlock => ({
  block_type: 'paragraph',
  source,
  block: { type: 'paragraph', content: { alignment: 'left', nodes: [textNode('Voltage: '), tokenNode(fieldId)] } },
});

const specTable = (...fieldIds: string[]): GeneratedBlock => ({
  block_type: 'spec_table',
  source: 'spec',
  block: {
    type: 'spec_table',
    product_id: 'P1',
    column_config: {
      show_min: false,
      show_typical: true,
      show_max: false,
      show_conditions: false,
      show_source: false,
      unit_preference: 'metric',
    },
    rows: fieldIds.map((fieldId, i) => ({ field_id: fieldId, component_id: 'C1', display_order: i, visible: true })),
  },
});

const warning = (fieldId: string): GeneratedBlock => ({
  block_type: 'warning',
  source: 'spec',
  block: {
    type: 'warning',
    children: [{ type: 'paragraph', content: { alignment: 'left', nodes: [textNode('Do not exceed '), tokenNode(fieldId)] } }],
  },
});

describe('resolveGeneratedSection', () => {
  it('resolves an inline spec token to a full grounded token', () => {
    const out = resolveGeneratedSection(section(paragraph('F1')), resolve);
    expect(out.unresolvedFieldIds).toEqual([]);
    const block = out.blocks[0]!;
    expect(block.type).toBe('paragraph');
    expect(block.source).toBe('spec');
    expect(block.specRefs).toEqual([{ fieldId: 'F1' }]);
    if (block.content.type !== 'paragraph') throw new Error('expected a paragraph');
    const token = block.content.content.nodes.find((n) => n.type === 'spec_token');
    expect(token).toMatchObject({ field_id: 'F1', field_version_id: 'V1', display_value: '36 V', unit_id: 'U1' });
    expect(block.textContent).toContain('36 V');
  });

  it('drops an unresolvable token and reports it (zero-hallucination)', () => {
    const out = resolveGeneratedSection(section(paragraph('F2')), resolve);
    expect(out.unresolvedFieldIds).toEqual(['F2']);
    const block = out.blocks[0]!;
    if (block.content.type !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.content.content.nodes.some((n) => n.type === 'spec_token')).toBe(false);
    expect(block.specRefs).toEqual([]);
  });

  it('collects spec_table row references and flags an unresolvable row', () => {
    const out = resolveGeneratedSection(section(specTable('F1', 'F2')), resolve);
    expect(out.unresolvedFieldIds).toEqual(['F2']);
    expect(out.blocks[0]!.type).toBe('spec_table');
    expect(out.blocks[0]!.specRefs).toEqual([{ fieldId: 'F1' }]);
  });

  it('resolves tokens nested in a safety block and preserves source', () => {
    const out = resolveGeneratedSection(section(warning('F1')), resolve);
    expect(out.unresolvedFieldIds).toEqual([]);
    const block = out.blocks[0]!;
    expect(block.type).toBe('warning');
    expect(block.source).toBe('spec');
    expect(block.specRefs).toEqual([{ fieldId: 'F1' }]);
    expect(block.textContent).toContain('36 V');
  });

  it('carries a null unit_id for unitless fields', () => {
    const out = resolveGeneratedSection(section(paragraph('Fbool')), resolve);
    const block = out.blocks[0]!;
    if (block.content.type !== 'paragraph') throw new Error('expected a paragraph');
    const token = block.content.content.nodes.find((n) => n.type === 'spec_token');
    expect(token).toMatchObject({ unit_id: null, display_value: 'Yes' });
  });

  it('carries brief_key for brief-sourced blocks, null otherwise (G7.3 spine)', () => {
    const briefBlock: GeneratedBlock = {
      block_type: 'paragraph',
      source: 'brief',
      brief_key: 'overview',
      block: { type: 'paragraph', content: { alignment: 'left', nodes: [textNode('A precision servo.')] } },
    };
    const out = resolveGeneratedSection(section(briefBlock, paragraph('F1')), resolve);
    expect(out.blocks[0]!.briefKey).toBe('overview'); // brief-sourced → attributed
    expect(out.blocks[1]!.briefKey).toBeNull(); // spec-sourced → not attributed
  });
});
