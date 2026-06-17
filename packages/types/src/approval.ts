import { z } from 'zod';
import { transitionReasonSchema } from './document-lifecycle';

/**
 * C1 — the approval workflow contract (Collaboration & Review spec §3.3, §6).
 * The one pure source (ADR-012) for an approval record's shape and the AND-logic
 * review summary the `record_approval` RPC (migration 0019) enforces server-side
 * and the document header renders.
 */

/** The recorded decisions (migration 0007 approval_records.action CHECK). */
export const APPROVAL_ACTIONS = ['approved', 'rejected', 'owner_override'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];
export const approvalActionSchema = z.enum(APPROVAL_ACTIONS);

/** The two formal actions an approver can take in Review (spec §6.1). */
export const APPROVER_ACTIONS = ['approved', 'rejected'] as const;
export type ApproverAction = (typeof APPROVER_ACTIONS)[number];

/**
 * The approve / send-back action input. A `rejected` decision carries a
 * mandatory reason (spec §6.2); an `approved` decision needs none.
 */
export const recordApprovalSchema = z
  .object({
    roleId: z.string().uuid(),
    action: z.enum(APPROVER_ACTIONS),
    reason: z.string().optional(),
  })
  .refine((v) => v.action !== 'rejected' || transitionReasonSchema.safeParse(v.reason).success, {
    message: 'A reason is required to send a document back.',
    path: ['reason'],
  });
export type RecordApproval = z.infer<typeof recordApprovalSchema>;

// --- The reviewer status summary (spec §5.3) ---------------------------------

export type ReviewRoleStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewRoleState {
  roleId: string;
  label: string;
  required: boolean;
  status: ReviewRoleStatus;
}

export interface ReviewSummary {
  roles: ReviewRoleState[];
  /** How many required roles there are, and how many have approved this cycle. */
  requiredCount: number;
  approvedCount: number;
  /** AND-logic: every required role approved at the current cycle (spec §3.3). */
  complete: boolean;
}

/** A minimal approval record for the pure summary (decoupled from the row shape). */
export interface ApprovalRecordLike {
  roleId: string;
  action: ApprovalAction;
  reviewCycle: number;
}

/**
 * Per-role review status for the CURRENT cycle and whether the AND-logic gate is
 * satisfied. Only records at `cycle` count — earlier cycles' decisions (reset by
 * a rejection or a pull-back) are ignored, exactly as the `record_approval` RPC
 * evaluates the gate (so the UI and the DB never disagree).
 */
export function summarizeReview(input: {
  roles: { id: string; label: string; required: boolean }[];
  records: ApprovalRecordLike[];
  cycle: number;
}): ReviewSummary {
  const atCycle = input.records.filter((r) => r.reviewCycle === input.cycle);
  const roles: ReviewRoleState[] = input.roles.map((role) => {
    const forRole = atCycle.filter((r) => r.roleId === role.id);
    let status: ReviewRoleStatus = 'pending';
    if (forRole.some((r) => r.action === 'rejected')) status = 'rejected';
    else if (forRole.some((r) => r.action === 'approved' || r.action === 'owner_override'))
      status = 'approved';
    return { roleId: role.id, label: role.label, required: role.required, status };
  });
  const required = roles.filter((r) => r.required);
  const approvedCount = required.filter((r) => r.status === 'approved').length;
  return {
    roles,
    requiredCount: required.length,
    approvedCount,
    complete: required.length > 0 && approvedCount === required.length,
  };
}
