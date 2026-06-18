'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@arther/ui';
import { rollbackSnippetAction } from '../actions';

/**
 * R.4 — restore a snippet to a prior version (§3.7). Records a new "Rolled back"
 * version and propagates to live embeds; overridden embeds get the source-changed
 * alert. Editor-gated server-side; confirms first since it changes live content.
 */
export function RestoreVersionButton({
  id,
  versionId,
  label,
}: {
  id: string;
  versionId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm(`Restore the version from ${label}? This becomes the snippet's current content.`)) {
      return;
    }
    setPending(true);
    setError(null);
    const res = await rollbackSnippetAction(id, versionId);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not restore that version.');
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={run} disabled={pending}>
        {pending ? 'Restoring…' : 'Restore'}
      </Button>
      {error ? <span className="ui-field__error">{error}</span> : null}
    </>
  );
}
