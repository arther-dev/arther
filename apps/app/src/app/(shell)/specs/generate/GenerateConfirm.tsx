'use client';

import { useActionState, useState } from 'react';
import { Button } from '@arther/ui';
import { createGenerationRunAction, type GenerateFormState } from './actions';

/**
 * The pre-flight confirmation: the author has seen completeness and chooses a
 * brand profile, then queues generation. Required-empty fields don't block —
 * they become placeholders (G2.7) — so the button is always available.
 *
 * V.5 — when the product has variants, the author can select one or more to
 * generate a variant-aware document: Arther fans out a generation per variant and
 * merges them on spec linkage (durable Trigger.dev runner). With none selected it
 * generates the base product document as before.
 */
export function GenerateConfirm({
  productId,
  documentTypeId,
  brands,
  variants = [],
}: {
  productId: string;
  documentTypeId: string;
  brands: { id: string; name: string; isDefault: boolean }[];
  variants?: { id: string; name: string; isDefault: boolean }[];
}) {
  const [state, action, pending] = useActionState<GenerateFormState, FormData>(
    createGenerationRunAction,
    {},
  );
  const [selectedCount, setSelectedCount] = useState(0);
  const defaultBrand = brands.find((b) => b.isDefault)?.id ?? brands[0]?.id;
  const label = pending
    ? 'Queueing…'
    : selectedCount > 0
      ? `Generate ${selectedCount} variant${selectedCount === 1 ? '' : 's'}`
      : 'Generate draft';
  return (
    <form
      action={action}
      className="specs-form"
      onChange={(e) => {
        const form = e.currentTarget;
        setSelectedCount(form.querySelectorAll('input[name="variantIds"]:checked').length);
      }}
    >
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
      {variants.length > 0 ? (
        <fieldset className="specs-form">
          <legend>Generate for variants (optional)</legend>
          <p className="specs-grid__meta">
            Select variants to generate a single variant-aware document — shared content is merged,
            variant-specific content is scoped automatically. Leave unchecked to generate the base
            product.
          </p>
          {variants.map((v) => (
            <label key={v.id} className="specs-form--row">
              <input type="checkbox" name="variantIds" value={v.id} />
              {v.name}
              {v.isDefault ? <span className="specs-grid__meta"> · default</span> : null}
            </label>
          ))}
        </fieldset>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {label}
      </Button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
