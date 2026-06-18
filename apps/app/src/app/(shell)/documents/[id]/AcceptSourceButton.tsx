'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@arther/ui';
import { acceptSourceForEmbedAction } from './embeds/actions';

/**
 * R.3 — drop a snippet embed's override and follow the live source again (§5.6).
 * Document-owner gated server-side; refreshes the embeds panel on success.
 */
export function AcceptSourceButton({ blockId }: { blockId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const res = await acceptSourceForEmbedAction(blockId);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not accept the source.');
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={run} disabled={pending}>
        {pending ? 'Accepting…' : 'Accept source'}
      </Button>
      {error ? <span className="ui-field__error">{error}</span> : null}
    </>
  );
}
