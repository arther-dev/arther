'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@arther/ui';
import { keepOverrideForEmbedAction } from './embeds/actions';

/**
 * R.3b — acknowledge a `source_changed` embed without adopting the new source:
 * keep the document-local override and re-anchor to the current source version so
 * it only re-flags on the next edit. Document-owner gated server-side.
 */
export function KeepOverrideButton({ blockId }: { blockId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const res = await keepOverrideForEmbedAction(blockId);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not keep the override.');
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={run} disabled={pending}>
        {pending ? 'Keeping…' : 'Keep override'}
      </Button>
      {error ? <span className="ui-field__error">{error}</span> : null}
    </>
  );
}
