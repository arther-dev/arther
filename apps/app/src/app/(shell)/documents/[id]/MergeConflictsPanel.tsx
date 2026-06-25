'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BlockRenderer } from '@arther/block-renderer';
import { Button } from '@arther/ui';
import type { BlockContent } from '@arther/types';
import { resolveConflictKeepBothAction } from './merge-conflict-actions';

export interface MergeConflictVersionView {
  variantId: string;
  variantName: string;
  content: BlockContent | null;
}

export interface MergeConflictView {
  id: string;
  sectionName: string;
  blocking: boolean;
  versions: MergeConflictVersionView[];
}

/**
 * V.6 — the merge-conflict review surface (Product Variants §4.8). Lists each
 * unlinked-prose conflict the variant merge couldn't auto-resolve, with every
 * variant's version side-by-side. Path A (AI-generated) conflicts are non-blocking
 * — the author resolves at leisure; Path B (a manually-edited block) is flagged as
 * blocking publication. v1 resolution: Keep both (each variant keeps its version);
 * writing a single shared version is done in the editor.
 */
export function MergeConflictsPanel({
  documentId,
  conflicts,
  editorHref,
}: {
  documentId: string;
  conflicts: MergeConflictView[];
  editorHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (conflicts.length === 0) return null;

  const keepBoth = (conflictId: string) => {
    setError(null);
    setBusyId(conflictId);
    startTransition(async () => {
      const result = await resolveConflictKeepBothAction(documentId, conflictId);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.');
        return;
      }
      router.refresh();
    });
  };

  const blockingCount = conflicts.filter((c) => c.blocking).length;
  return (
    <section className="specs-card" aria-label="Merge conflicts">
      <h2 className="specs-subtitle">Merge conflicts ({conflicts.length})</h2>
      <p className="specs-grid__meta">
        Variants generated different content for these blocks and there’s no spec field to merge on.
        {blockingCount > 0
          ? ` ${blockingCount} must be resolved before this document can be published.`
          : ' These don’t block publishing — resolve them when you’re ready.'}{' '}
        To write one shared version, edit it in the <Link href={editorHref}>document editor</Link>.
      </p>
      {error ? (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="specs-list">
        {conflicts.map((c) => (
          <li key={c.id} className="specs-section">
            <p className="specs-grid__meta">
              {c.sectionName ? <strong>{c.sectionName}</strong> : <strong>Document</strong>}
              {c.blocking ? <span className="ui-field__error"> · blocks publishing</span> : null}
            </p>
            <div className="merge-conflict__versions">
              {c.versions.map((v) => (
                <div key={v.variantId} className="merge-conflict__version">
                  <p className="portal-header__eyebrow">{v.variantName}</p>
                  <div className="br-document">
                    {v.content ? (
                      <BlockRenderer blocks={[v.content]} resolved={{}} />
                    ) : (
                      <p className="specs-grid__meta">(version unavailable)</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={pending && busyId === c.id}
              onClick={() => keepBoth(c.id)}
            >
              {pending && busyId === c.id ? 'Resolving…' : 'Keep both'}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
