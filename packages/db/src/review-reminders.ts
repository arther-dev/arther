import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeReviewReminders,
  summarizeReview,
  type DocumentRevisionId,
  type DocumentTypeId,
  type WorkspaceId,
} from '@arther/types';
import { listApprovalRoles } from './approval-roles';
import { listApprovalRecords } from './approvals';
import { listMembers } from './workspace';
import { dispatchNotification, membershipUserIds } from './notifications';

/**
 * C3.6 — the review due-date reminder job (collab spec §9.2). Run daily (Vercel
 * Cron → the secret-protected route). Selects in-review documents whose due date
 * is yesterday or today (UTC), resolves each one's still-pending approvers, and
 * lets the pure `computeReviewReminders` decide: remind the approvers on the due
 * date, escalate to the owner the day after. Dispatches `review_overdue` through
 * the unified system (so it honors each recipient's prefs + emails immediately).
 * Service-role (cron has no user JWT). Returns counts for the run.
 */
function one<T>(v: T | T[] | null | undefined): T {
  return Array.isArray(v) ? (v[0] as T) : (v as T);
}

export async function runReviewReminders(
  service: SupabaseClient,
  now: Date,
): Promise<{ dispatched: number; reviewsChecked: number }> {
  const dayMs = 86_400_000;
  const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const windowStart = new Date(startToday - dayMs).toISOString(); // start of yesterday
  const windowEnd = new Date(startToday + dayMs).toISOString(); // start of tomorrow

  const { data: revs, error } = await service
    .from('document_revisions')
    .select(
      'id, document_id, review_cycle, review_due_date, documents!inner(owner_id, title, document_type_id, workspace_id)',
    )
    .eq('state', 'review')
    .not('review_due_date', 'is', null)
    .gte('review_due_date', windowStart)
    .lt('review_due_date', windowEnd);
  if (error) throw new Error(`runReviewReminders: ${error.message}`);
  const rows = (revs ?? []) as Array<Record<string, unknown>>;

  let dispatched = 0;
  for (const rev of rows) {
    const doc = one(rev.documents) as {
      owner_id: string | null;
      title: string;
      document_type_id: string;
      workspace_id: string;
    };
    const [roles, records, members] = await Promise.all([
      listApprovalRoles(service, doc.document_type_id as DocumentTypeId),
      listApprovalRecords(service, rev.id as DocumentRevisionId),
      listMembers(service, doc.workspace_id as WorkspaceId),
    ]);

    const summary = summarizeReview({
      roles: roles.map((r) => ({ id: r.id, label: r.role_label, required: r.required })),
      records: records.map((r) => ({
        roleId: r.role_id ?? '',
        action: r.action,
        reviewCycle: r.review_cycle,
      })),
      cycle: rev.review_cycle as number,
    });
    const pendingRoleIds = new Set(
      summary.roles.filter((r) => r.status === 'pending').map((r) => r.roleId),
    );
    const pendingMembershipIds = roles
      .filter((r) => pendingRoleIds.has(r.id))
      .flatMap((r) => r.assignments.map((a) => a.workspace_member_id));
    const pendingApproverIds = await membershipUserIds(service, pendingMembershipIds);
    const nameByUser = new Map(members.map((m) => [m.user_id, m.name ?? m.email]));

    const reminders = computeReviewReminders(
      {
        documentId: rev.document_id as string,
        documentTitle: doc.title,
        ownerId: doc.owner_id,
        dueDate: rev.review_due_date as string,
        pendingApproverIds,
        pendingApproverNames: pendingApproverIds.map((id) => nameByUser.get(id) ?? 'Someone'),
      },
      now,
    );

    for (const reminder of reminders) {
      dispatched += await dispatchNotification(service, {
        workspaceId: doc.workspace_id as WorkspaceId,
        recipientIds: reminder.recipientIds,
        eventType: 'review_overdue',
        payload: reminder.payload,
      });
    }
  }

  return { dispatched, reviewsChecked: rows.length };
}
