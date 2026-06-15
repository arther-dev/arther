import { describe, expect, it } from 'vitest';
import { approvalRoleFormSchema, approvalRoleLabelSchema } from './approval-role';
import { TEXT_LIMITS } from './text';

describe('approval-role schema (G0.3)', () => {
  it('accepts a trimmed, non-empty label', () => {
    const parsed = approvalRoleLabelSchema.parse('  Engineering sign-off  ');
    expect(parsed).toBe('Engineering sign-off');
  });

  it('rejects an empty label', () => {
    expect(approvalRoleLabelSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects an oversized label (F8.5 bound)', () => {
    expect(approvalRoleLabelSchema.safeParse('x'.repeat(TEXT_LIMITS.name + 1)).success).toBe(
      false,
    );
  });

  it('parses the full form contract with the required flag', () => {
    const parsed = approvalRoleFormSchema.parse({ role_label: 'Compliance', required: false });
    expect(parsed).toEqual({ role_label: 'Compliance', required: false });
  });

  it('rejects a non-boolean required flag', () => {
    expect(
      approvalRoleFormSchema.safeParse({ role_label: 'QA', required: 'yes' }).success,
    ).toBe(false);
  });
});
