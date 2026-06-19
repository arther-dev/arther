'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  DOCUMENT_TRANSITION_LABELS,
  transitionActionsFor,
  type DocumentState,
} from '@arther/types';
import {
  createRevisionAction,
  publishDocumentAction,
  pullBackToDraftAction,
  pullBackToReviewAction,
  restoreToPortalAction,
  submitForReviewAction,
  unpublishDocumentAction,
  type LifecycleResult,
} from './lifecycle-actions';

/**
 * The document's portal visibility (C4.6), independent of the lifecycle state:
 * `live` = a current snapshot is served on the portal; `unpublished` = published
 * but its snapshots are archived (removed from the portal); `null` = never
 * published / not applicable.
 */
export type PortalVisibility = 'live' | 'unpublished' | null;

/**
 * C0.1/C0.2 — the document owner's lifecycle controls on the document header.
 * Buttons are derived from the pure transition map for the current state
 * (`transitionActionsFor(state, 'owner')`); each calls its server action, which
 * re-authorizes (canDo + ownership) and runs the guarded transition. C4.6 adds
 * the portal-visibility controls (unpublish / restore) — a snapshot operation
 * decoupled from the state machine. Rendered only when the viewer may manage the
 * document (computed server-side).
 */
export function DocumentLifecycle({
  documentId,
  state,
  portalVisibility = null,
}: {
  documentId: string;
  state: DocumentState;
  portalVisibility?: PortalVisibility;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const [brief, setBrief] = useState('');
  const [due, setDue] = useState('');

  const actions = transitionActionsFor(state, 'owner');

  function run(fn: () => Promise<LifecycleResult>, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setShowBrief(false);
        setBrief('');
        setDue('');
        router.refresh();
      } else {
        setError(result.error ?? 'Something went wrong.');
      }
    });
  }

  return (
    <div className="doc-lifecycle">
      <div className="doc-lifecycle__row">
        {actions.includes('submit_for_review') &&
          (showBrief ? null : (
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              disabled={pending}
              onClick={() => setShowBrief(true)}
              data-arther-spotlight="submit-for-review"
            >
              {DOCUMENT_TRANSITION_LABELS.submit_for_review}
            </button>
          ))}

        {actions.includes('pull_back_to_review') && (
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            disabled={pending}
            onClick={() => run(() => pullBackToReviewAction(documentId))}
          >
            {DOCUMENT_TRANSITION_LABELS.pull_back_to_review}
          </button>
        )}

        {actions.includes('pull_back_to_draft') && (
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            disabled={pending}
            onClick={() => run(() => pullBackToDraftAction(documentId))}
          >
            {DOCUMENT_TRANSITION_LABELS.pull_back_to_draft}
          </button>
        )}

        {actions.includes('publish') && (
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={pending}
            onClick={() =>
              run(
                () => publishDocumentAction(documentId),
                'Publish this document? The approved revision becomes the live snapshot.',
              )
            }
            data-arther-spotlight="publish-document"
          >
            {DOCUMENT_TRANSITION_LABELS.publish}
          </button>
        )}

        {actions.includes('create_revision') && (
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={pending}
            onClick={() =>
              run(
                () => createRevisionAction(documentId),
                'Start a new revision? The current published version stays live while you edit the copy.',
              )
            }
          >
            {DOCUMENT_TRANSITION_LABELS.create_revision}
          </button>
        )}

        {/* C4.6 — portal visibility, decoupled from the lifecycle state. */}
        {portalVisibility === 'live' && (
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            disabled={pending}
            onClick={() =>
              run(
                () => unpublishDocumentAction(documentId),
                'Unpublish from the portal? It will be removed from public view; the document and its history are kept and can be restored.',
              )
            }
          >
            Unpublish from portal
          </button>
        )}

        {portalVisibility === 'unpublished' && (
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={pending}
            onClick={() =>
              run(
                () => restoreToPortalAction(documentId),
                'Restore to the portal? The latest published version becomes public again.',
              )
            }
          >
            Restore to portal
          </button>
        )}
      </div>

      {showBrief && (
        <form
          className="doc-lifecycle__brief"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => submitForReviewAction(documentId, { reviewBrief: brief, reviewDueDate: due }));
          }}
        >
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="dl-brief">
              Message to reviewers (optional)
            </label>
            <textarea
              id="dl-brief"
              className="ui-field__input"
              rows={2}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What should reviewers focus on in this review?"
            />
          </div>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="dl-due">
              Due date (optional)
            </label>
            <input
              id="dl-due"
              className="ui-field__input"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div className="doc-lifecycle__row">
            <button type="submit" className="ui-btn ui-btn--primary" disabled={pending}>
              {pending ? 'Sending…' : 'Send for review'}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              disabled={pending}
              onClick={() => setShowBrief(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
