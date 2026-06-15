'use client';

import { useActionState } from 'react';
import { Button } from '@arther/ui';
import { createGenerationRunAction, type GenerateFormState } from './actions';

/**
 * The pre-flight confirmation: the author has seen completeness and chooses a
 * brand profile, then queues generation. Required-empty fields don't block —
 * they become placeholders (G2.7) — so the button is always available.
 */
export function GenerateConfirm({
  productId,
  documentTypeId,
  brands,
}: {
  productId: string;
  documentTypeId: string;
  brands: { id: string; name: string; isDefault: boolean }[];
}) {
  const [state, action, pending] = useActionState<GenerateFormState, FormData>(
    createGenerationRunAction,
    {},
  );
  const defaultBrand = brands.find((b) => b.isDefault)?.id ?? brands[0]?.id;
  return (
    <form action={action} className="specs-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="documentTypeId" value={documentTypeId} />
      {brands.length > 0 ? (
        <label className="specs-form--row">
          Brand profile
          <select name="brandProfileId" defaultValue={defaultBrand} aria-label="Brand profile">
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Queueing…' : 'Generate draft'}
      </Button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
