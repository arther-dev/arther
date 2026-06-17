'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ReviewRoleStatus } from '@arther/types';
import {
  overrideApprovalAction,
  recordApprovalAction,
  type ApprovalResult,
} from './approval-actions';

export interface PanelRole {
  roleId: string;
  label: string;
  required: boolean;
  status: ReviewRoleStatus;
  assignees: string[];
  /** The signed-in member is assigned to this role and it's still pending. */
  canActAs: boolean;
}

const STATUS_LABEL: Record<ReviewRoleStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Sent back',
};

/**
 * C1.1/C1.2 — the reviewer status panel (spec §5.3) on a document in Review:
 * each required role with its status + assignees, and Approve / Send-back
 * controls for the roles the signed-in member can act on. The AND-logic gate is
 * enforced in the `record_approval` RPC — this is the surface over it.
 */
export function ApprovalPanel({
  documentId,
  revisionId,
  roles,
  approvedCount,
  requiredCount,
  canOverride,
}: {
  documentId: string;
  revisionId: string;
  roles: PanelRole[];
  approvedCount: number;
  requiredCount: number;
  /** The signed-in member is the document owner or a workspace admin (C1.5). */
  canOverride: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [overriding, setOverriding] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  function run(fn: () => Promise<ApprovalResult>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setRejecting(null);
        setReason('');
        setOverriding(null);
        setOverrideReason('');
        router.refresh();
      } else {
        setError(res.error ?? 'Something went wrong.');
      }
    });
  }

  return (
    <section className="approval-panel" aria-label="Reviewers">
      <header className="approval-panel__head">
        <h2 className="approval-panel__title">Reviewers</h2>
        <span className="specs-grid__meta">
          {approvedCount} of {requiredCount} required {requiredCount === 1 ? 'approval' : 'approvals'}
        </span>
      </header>
      <ul className="approval-panel__roles">
        {roles.map((role) => (
          <li key={role.roleId} className="approval-panel__role">
            <div className="approval-panel__role-head">
              <span className="approval-panel__role-label">
                {role.label}
                {role.required ? '' : ' (optional)'}
              </span>
              <span className={`import-status import-status--${role.status}`}>
                {STATUS_LABEL[role.status]}
              </span>
            </div>
            <p className="specs-grid__meta">
              {role.assignees.length > 0 ? role.assignees.join(', ') : 'No approver assigned'}
            </p>
            {role.canActAs ? (
              rejecting === role.roleId ? (
                <form
                  className="approval-panel__reject"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() =>
                      recordApprovalAction(documentId, revisionId, {
                        roleId: role.roleId,
                        action: 'rejected',
                        reason,
                      }),
                    );
                  }}
                >
                  <textarea
                    className="ui-field__input"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why are you sending this back? (required)"
                    aria-label="Reason for sending back"
                  />
                  <div className="approval-panel__actions">
                    <button
                      type="submit"
                      className="ui-btn ui-btn--danger"
                      disabled={pending || reason.trim() === ''}
                    >
                      Send back
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      disabled={pending}
                      onClick={() => {
                        setRejecting(null);
                        setReason('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="approval-panel__actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        recordApprovalAction(documentId, revisionId, {
                          roleId: role.roleId,
                          action: 'approved',
                        }),
                      )
                    }
                  >
                    Approve as {role.label}
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    disabled={pending}
                    onClick={() => {
                      setRejecting(role.roleId);
                      setReason('');
                      setError(null);
                    }}
                  >
                    Send back
                  </button>
                </div>
              )
            ) : null}

            {canOverride && role.status === 'pending' ? (
              overriding === role.roleId ? (
                <form
                  className="approval-panel__reject"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() =>
                      overrideApprovalAction(documentId, revisionId, {
                        roleId: role.roleId,
                        reason: overrideReason,
                      }),
                    );
                  }}
                >
                  <textarea
                    className="ui-field__input"
                    rows={2}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder={`Override reason — approving on behalf of ${role.label} (required)`}
                    aria-label="Override reason"
                  />
                  <div className="approval-panel__actions">
                    <button
                      type="submit"
                      className="ui-btn ui-btn--danger"
                      disabled={pending || overrideReason.trim() === ''}
                    >
                      Override approval
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      disabled={pending}
                      onClick={() => {
                        setOverriding(null);
                        setOverrideReason('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="approval-panel__actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    disabled={pending}
                    onClick={() => {
                      setOverriding(role.roleId);
                      setOverrideReason('');
                      setError(null);
                    }}
                  >
                    Override…
                  </button>
                </div>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {error && (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
