import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button-variants';
import { statusPillVariants } from './status-pill-variants';

describe('buttonVariants', () => {
  it('defaults to primary / md', () => {
    expect(buttonVariants({})).toBe('ui-btn ui-btn--primary');
  });

  it('composes the DS variant × size axes', () => {
    expect(buttonVariants({ variant: 'secondary', size: 'sm' })).toBe(
      'ui-btn ui-btn--secondary ui-btn--sm',
    );
    expect(buttonVariants({ variant: 'ghost' })).toBe('ui-btn ui-btn--ghost');
  });

  it('passes through caller classNames', () => {
    expect(buttonVariants({ className: 'extra' })).toContain('extra');
  });
});

describe('statusPillVariants', () => {
  it('covers the five DS status semantics', () => {
    for (const status of ['live', 'stale', 'review', 'draft', 'unpublished'] as const) {
      expect(statusPillVariants({ status })).toBe(`ui-status-pill ui-status-pill--${status}`);
    }
  });
});
