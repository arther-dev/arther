import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ApprovalAction,
  ApprovalRoleId,
  DocumentRevisionId,
  DocumentState,
  UserId,
} from '@arther/types';
import { rpcError } from './errors';

/**
 * Approval workflow repository (C1, migration 0019). The decision + state
 * transition is the `record_approval` RPC — atomic and DB-enforced (a document
 * can't reach Approved until every required role has approved at the current
 * cycle; one rejection returns it to Draft). The RPC self-authorizes (the caller
 * must be a member assigned to the role), so the app authorizes the seat-level
 * `doc.approve` and lets the RPC enforce the rest.
 */

export interface ApprovalRecordRow {
  id: string;
  revision_id: DocumentRevisionId;
  role_id: ApprovalRoleId | null;
  approver_id: UserId | null;
  action: ApprovalAction;
  reason: string | null;
  review_cycle: number;
  recorded_at: string;
}

const APPROVAL_COLUMNS =
  'id, revision_id, role_id, approver_id, action, reason, review_cycle, recorded_at';

/**
 * Record an approver's decision and advance the state machine atomically. Rule
 * violations the RPC raises (not an assigned approver, not in review, reason
 * required) surface as `DbRuleError` (the F8.5 typed-error pattern — the messages
 * are author-written and safe to show). Returns the document's resulting state.
 */
export async function recordApproval(
  client: SupabaseClient,
  input: {
    revisionId: DocumentRevisionId;
    roleId: ApprovalRoleId;
    action: 'approved' | 'rejected';
    reason?: string | null;
  },
): Promise<DocumentState> {
  const { data, error } = await client.rpc('record_approval', {
    p_revision_id: input.revisionId,
    p_role_id: input.roleId,
    p_action: input.action,
    p_reason: input.reason ?? null,
  });
  if (error) throw rpcError('recordApproval', error);
  return data as DocumentState;
}

/** Every approval decision on a revision (append-only; newest first), member-read. */
export async function listApprovalRecords(
  client: SupabaseClient,
  revisionId: DocumentRevisionId,
): Promise<ApprovalRecordRow[]> {
  const { data, error } = await client
    .from('approval_records')
    .select(APPROVAL_COLUMNS)
    .eq('revision_id', revisionId)
    .order('recorded_at', { ascending: false });
  if (error) throw new Error(`listApprovalRecords: ${error.message}`);
  return (data ?? []) as ApprovalRecordRow[];
}
