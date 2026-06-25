import { describe, expect, it } from 'vitest';
import {
  formatMergeSummary,
  mergeVariantGenerations,
  type VariantGenerationOutput,
} from './variant-merge';
import type { GenerationCommitBlock } from './generation-assembly';
import type { SpecFieldId } from './ids';

// --- Block builders ----------------------------------------------------------

function header(title: string): GenerationCommitBlock {
  return {
    type: 'section_header',
    source: 'structural',
    content: { type: 'section_header', title },
    textContent: title,
  };
}

/** A paragraph; `fieldIds` set the spec linkage (an inline token per id + specRefs). */
function para(text: string, fieldIds: string[] = []): GenerationCommitBlock {
  const nodes: { type: 'text' | 'spec_token'; [k: string]: unknown }[] = [
    { type: 'text', text, marks: [] },
  ];
  for (const fid of fieldIds) {
    nodes.push({
      type: 'spec_token',
      field_id: fid,
      field_version_id: `${fid}-v1`,
      display_value: `${fid}-val`,
      unit_id: null,
      product_id: 'p1',
      component_id: null,
    });
  }
  return {
    type: 'paragraph',
    source: fieldIds.length ? 'spec' : 'brief',
    content: { type: 'paragraph', content: { alignment: 'left', nodes: nodes as never } },
    textContent: text,
    specRefs: fieldIds.map((f) => ({ fieldId: f as SpecFieldId })),
  };
}

function out(variantId: string, blocks: GenerationCommitBlock[]): VariantGenerationOutput {
  return { variantId, blocks };
}

// --- Tests -------------------------------------------------------------------

describe('mergeVariantGenerations', () => {
  it('passes a single variant through as ALL-scoped with no conflicts', () => {
    // One variant ⇒ every block is "present in all variants" ⇒ ALL-scoped, shared.
    const r = mergeVariantGenerations([out('a', [header('Intro'), para('hello')])]);
    expect(r.conflicts).toHaveLength(0);
    expect(r.blocks.every((b) => b.scope.mode === 'ALL')).toBe(true);
    expect(r.blocks.map((b) => b.origin)).toEqual(['section-header', 'prose-shared']);
  });

  it('rule 1 — same spec linkage with DIFFERENT values merges to one shared block', () => {
    // Two variants cite the same field; the resolved value differs (vA vs vB) but
    // linkage is identical, so it is ONE shared block (the token rewrites per variant).
    const a = out('a', [header('Specs'), para('The coil draws ', ['voltage'])]);
    const b = out('b', [header('Specs'), para('The coil draws ', ['voltage'])]);
    const r = mergeVariantGenerations([a, b]);
    expect(r.conflicts).toHaveLength(0);
    const body = r.blocks.filter((x) => x.origin !== 'section-header');
    expect(body).toHaveLength(1);
    expect(body[0]!.origin).toBe('spec-shared');
    expect(body[0]!.scope).toEqual({ mode: 'ALL' });
  });

  it('rule 2 — equivalent unlinked prose (whitespace/case-insensitive) merges to one shared block', () => {
    const a = out('a', [para('Install   the Unit.')]);
    const b = out('b', [para('install the unit.')]);
    const r = mergeVariantGenerations([a, b]);
    expect(r.conflicts).toHaveLength(0);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0]!.origin).toBe('prose-shared');
    expect(r.blocks[0]!.scope).toEqual({ mode: 'ALL' });
  });

  it('conflict — differing unlinked prose keeps each variant version (MANUAL) and records a conflict', () => {
    const a = out('a', [header('Overview'), para('A sleek consumer finish.')]);
    const b = out('b', [header('Overview'), para('A rugged industrial housing.')]);
    const r = mergeVariantGenerations([a, b]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]!.sectionName).toBe('Overview');
    expect(r.conflicts[0]!.position).toBe(0);
    expect(r.conflicts[0]!.versions.map((v) => v.variantId)).toEqual(['a', 'b']);
    const conflictBlocks = r.blocks.filter((x) => x.origin === 'conflict');
    expect(conflictBlocks).toHaveLength(2);
    expect(conflictBlocks[0]!.scope).toEqual({ mode: 'MANUAL', variantIds: ['a'] });
    expect(conflictBlocks[1]!.scope).toEqual({ mode: 'MANUAL', variantIds: ['b'] });
  });

  it('rule 3 — a block present in only some variants is kept, scoped to those variants', () => {
    // Variant a has an extra spec-linked block (a swapped-in component's field).
    const a = out('a', [header('Specs'), para('shared', ['f1']), para('only-a', ['f2'])]);
    const b = out('b', [header('Specs'), para('shared', ['f1'])]);
    const r = mergeVariantGenerations([a, b]);
    expect(r.conflicts).toHaveLength(0);
    const shared = r.blocks.find((x) => x.origin === 'spec-shared');
    expect(shared?.scope).toEqual({ mode: 'ALL' });
    const specific = r.blocks.find((x) => x.origin === 'variant-specific');
    expect(specific?.scope).toEqual({ mode: 'MANUAL', variantIds: ['a'] });
  });

  it('a spec-linked block present in a subset shares the same linkage but stays MANUAL to that subset', () => {
    const a = out('a', [para('x', ['f9'])]);
    const b = out('b', [para('x', ['f9'])]);
    const c = out('c', []); // c didn't generate this block
    const r = mergeVariantGenerations([a, b, c]);
    const block = r.blocks.find((x) => x.origin === 'variant-specific');
    expect(block?.scope).toEqual({ mode: 'MANUAL', variantIds: ['a', 'b'] });
  });

  it('produces the summary the merge toast renders', () => {
    const a = out('a', [header('S'), para('same', ['f1']), para('intro A')]);
    const b = out('b', [header('S'), para('same', ['f1']), para('intro B')]);
    const r = mergeVariantGenerations([a, b]);
    // header + spec-shared = 2 shared; two conflict blocks (variant-specific origin is 'conflict', not counted as variantSpecific); 1 conflict.
    expect(r.summary.shared).toBe(2);
    expect(r.summary.conflicts).toBe(1);
    expect(formatMergeSummary(r.summary)).toContain('conflict');
  });

  it('is deterministic and order-stable across variant input order for shared blocks', () => {
    const a = out('a', [para('p', ['f1'])]);
    const b = out('b', [para('p', ['f1'])]);
    const r1 = mergeVariantGenerations([a, b]);
    const r2 = mergeVariantGenerations([b, a]);
    expect(r1.blocks.map((x) => x.origin)).toEqual(r2.blocks.map((x) => x.origin));
    expect(r1.summary).toEqual(r2.summary);
  });

  it('handles empty input', () => {
    const r = mergeVariantGenerations([]);
    expect(r.blocks).toHaveLength(0);
    expect(r.summary).toEqual({ shared: 0, variantSpecific: 0, conflicts: 0 });
  });

  it('formatMergeSummary omits the conflict clause when there are none', () => {
    expect(formatMergeSummary({ shared: 3, variantSpecific: 1, conflicts: 0 })).toBe(
      '3 blocks shared · 1 variant-specific',
    );
    expect(formatMergeSummary({ shared: 1, variantSpecific: 0, conflicts: 2 })).toBe(
      '1 block shared · 0 variant-specific · 2 conflicts need review',
    );
  });
});
