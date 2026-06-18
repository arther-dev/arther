import { describe, expect, it } from 'vitest';
import { buildFirstRunChecklist, FIRST_RUN_STEPS } from './onboarding';

describe('buildFirstRunChecklist (K.8)', () => {
  it('reflects each step’s done-state in order', () => {
    const { items } = buildFirstRunChecklist({
      product: true,
      brand_profile: false,
      document_type: true,
      teammate: false,
    });
    expect(items.map((i) => i.key)).toEqual(FIRST_RUN_STEPS.map((s) => s.key));
    expect(items.map((i) => i.done)).toEqual([true, false, true, false]);
  });

  it('counts the remaining steps and is incomplete while any is undone', () => {
    const r = buildFirstRunChecklist({
      product: true,
      brand_profile: false,
      document_type: false,
      teammate: false,
    });
    expect(r.remaining).toBe(3);
    expect(r.complete).toBe(false);
  });

  it('is complete (and collapses) only when every step is done', () => {
    const r = buildFirstRunChecklist({
      product: true,
      brand_profile: true,
      document_type: true,
      teammate: true,
    });
    expect(r.remaining).toBe(0);
    expect(r.complete).toBe(true);
  });

  it('every step carries a label, description, and in-app destination', () => {
    for (const step of FIRST_RUN_STEPS) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
      expect(step.href.startsWith('/')).toBe(true);
    }
  });
});
