'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@arther/ui';
import { duplicateDocumentAction } from './lifecycle-actions';

/**
 * R.8 — duplicate this document into a new Draft (same product) and open it in
 * the editor. Editor-gated server-side; the button is shown to non-viewers.
 */
export function DuplicateDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const res = await duplicateDocumentAction(documentId);
    if (!res.ok || !res.newDocumentId) {
      setPending(false);
      setError(res.error ?? 'Could not duplicate the document.');
      return;
    }
    router.push(`/documents/${res.newDocumentId}/edit`);
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={run} disabled={pending}>
        {pending ? 'Duplicating…' : 'Duplicate'}
      </Button>
      {error ? <span className="ui-field__error">{error}</span> : null}
    </>
  );
}
