'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  isTerminalRunStatus,
  shouldOpenEditorOnCompletion,
  shouldPollRun,
  summarizeRunProgress,
} from '@arther/types';
import { getRunStatusAction, type RunStatusView } from './actions';

/**
 * G2.8 — the live generation-status surface. Renders a run's section-by-section
 * progress and, while the run is still running, polls `getRunStatusAction` so the
 * statuses advance without a manual refresh (the documented poll fallback; a
 * Supabase Realtime push can later kick the same refetch for instant updates).
 * When a run the user is *watching* finishes successfully, it opens straight into
 * the editor — "opens into the editor on completion". Revisiting an
 * already-finished run just shows the result, with the editor one click away.
 */
const POLL_MS = 2000;

const HEADING: Record<RunStatusView['status'], string> = {
  succeeded: 'Draft created',
  partial: 'Draft created — some sections need attention',
  failed: 'Generation failed',
  running: 'Generating…',
  queued: 'Generation queued',
  cancelled: 'Generation cancelled',
};

export function RunStatus({
  runId,
  productName,
  productHref,
  initial,
}: {
  runId: string;
  productName: string;
  productHref: string;
  initial: RunStatusView;
}) {
  const router = useRouter();
  const [view, setView] = useState<RunStatusView>(initial);
  // Were we watching a live run when the surface mounted? Only then do we open
  // the editor on completion — revisiting a finished run must not yank the user.
  const watchedRef = useRef(!isTerminalRunStatus(initial.status));

  useEffect(() => {
    if (shouldOpenEditorOnCompletion({ watched: watchedRef.current, status: view.status, documentId: view.documentId })) {
      router.push(`/documents/${view.documentId}/edit`);
      return;
    }
    if (!shouldPollRun(view.status)) return;

    let active = true;
    const id = setInterval(async () => {
      const next = await getRunStatusAction(runId);
      if (active && next) setView(next);
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [view.status, view.documentId, runId, router]);

  const progress = summarizeRunProgress(view.sections);
  const { status } = view;

  return (
    <main className="import-canvas">
      <h1 className="specs-title">{HEADING[status]}</h1>

      {status === 'queued' ? (
        <p className="ui-field__error">
          Generation isn’t provisioned in this environment — set ANTHROPIC_API_KEY (PROVISIONING.md)
          and generate again.
        </p>
      ) : status === 'failed' || status === 'cancelled' ? (
        <p className="ui-field__error">{view.error ?? 'Generation did not complete.'}</p>
      ) : (
        <p className="specs-grid__meta" aria-live="polite">
          {progress.byStatus.succeeded} of {progress.total} section
          {progress.total === 1 ? '' : 's'} generated for <strong>{productName}</strong> (
          {progress.percentComplete}%)
          {status === 'succeeded' || status === 'partial'
            ? ' — the draft is saved.'
            : status === 'running'
              ? '…'
              : '.'}
        </p>
      )}

      <ol className="specs-form" aria-label="Sections">
        {view.sections.map((s) => (
          <li key={s.id} className="specs-form--row">
            {s.name}
            <span className={`import-status import-status--${s.status}`}>{s.status}</span>
            {s.error ? <span className="specs-grid__meta">{s.error}</span> : null}
          </li>
        ))}
      </ol>

      {view.documentId ? (
        <p className="specs-form--row">
          <Link className="ui-btn ui-btn--primary" href={`/documents/${view.documentId}/edit`}>
            Open in editor
          </Link>
          <Link className="ui-btn ui-btn--ghost" href={`/documents/${view.documentId}`}>
            View document
          </Link>
        </p>
      ) : null}

      <p className="specs-grid__meta">
        <Link href={productHref}>← Back to {productName}</Link>
      </p>
    </main>
  );
}
