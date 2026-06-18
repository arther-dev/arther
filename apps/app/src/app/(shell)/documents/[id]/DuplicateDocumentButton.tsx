'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@arther/ui';
import {
  duplicateDocumentAction,
  listDuplicateTargetsAction,
  type DuplicateTarget,
} from './lifecycle-actions';

/**
 * R.8 — duplicate this document into a new Draft, in the same product or another
 * one. The picker loads the workspace's products lazily; a cross-product copy
 * re-resolves spec references against the target (re-linking matched fields,
 * placeholdering the rest) and summarizes what became a placeholder before opening
 * the new draft. Editor-gated server-side; the control is shown to non-viewers.
 */
export function DuplicateDocumentButton({
  documentId,
  sourceProductId,
}: {
  documentId: string;
  sourceProductId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<DuplicateTarget[] | null>(null);
  const [productId, setProductId] = useState(sourceProductId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && targets === null) {
      setTargets(await listDuplicateTargetsAction());
    }
  }

  async function run() {
    setPending(true);
    setError(null);
    const crossProduct = productId !== sourceProductId;
    const res = await duplicateDocumentAction(documentId, crossProduct ? productId : undefined);
    if (!res.ok || !res.newDocumentId) {
      setPending(false);
      setError(res.error ?? 'Could not duplicate the document.');
      return;
    }
    if (crossProduct && res.placeholderNotes && res.placeholderNotes.length > 0) {
      window.alert(
        `Duplicated into the target product. ${res.placeholderNotes.length} reference${
          res.placeholderNotes.length === 1 ? '' : 's'
        } became a placeholder to fill: ${res.placeholderNotes.join(', ')}.`,
      );
    }
    router.push(`/documents/${res.newDocumentId}/edit`);
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <Button size="sm" variant="ghost" onClick={toggle} disabled={pending}>
        Duplicate
      </Button>
      {open ? (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <select
            aria-label="Target product"
            className="ui-field__input"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={pending || targets === null}
          >
            <option value={sourceProductId}>Same product</option>
            {(targets ?? [])
              .filter((t) => t.id !== sourceProductId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
          <Button size="sm" variant="primary" onClick={run} disabled={pending}>
            {pending ? 'Duplicating…' : 'Go'}
          </Button>
        </span>
      ) : null}
      {error ? <span className="ui-field__error">{error}</span> : null}
    </span>
  );
}
