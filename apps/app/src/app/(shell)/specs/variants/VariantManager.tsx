'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, TextField } from '@arther/ui';
import {
  createVariantAction,
  deleteVariantAction,
  setVariantDefaultAction,
} from './actions';

export interface VariantListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  deltaCount: number;
}

/**
 * V.1 — manage a product's variants: create, set the default (the base URL
 * redirects there), and delete. Editing each variant's deltas (the delta editor
 * with a live resolved-spec preview) is V.3 — for now each variant shows its
 * delta count. Editor-gated server-side.
 */
export function VariantManager({
  productId,
  variants,
}: {
  productId: string;
  variants: VariantListItem[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    const res = await createVariantAction(productId, name, description || undefined);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not create the variant.');
      return;
    }
    setName('');
    setDescription('');
    router.refresh();
  }

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const res = await action();
    if (!res.ok) {
      setError(res.error ?? 'Action failed.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="specs-content">
      <section className="specs-section">
        <h2 className="specs-section__title">New variant</h2>
        <div className="specs-form" style={{ maxWidth: 460 }}>
          <TextField
            id="variant-name"
            name="name"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="High-temperature model"
          />
          <TextField
            id="variant-desc"
            name="description"
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {error ? <p className="ui-field__error">{error}</p> : null}
          <Button size="sm" onClick={create} disabled={pending || name.trim().length === 0}>
            {pending ? 'Creating…' : 'Create variant'}
          </Button>
        </div>
      </section>

      <section className="specs-section">
        <h2 className="specs-section__title">Variants</h2>
        {variants.length === 0 ? (
          <p className="specs-grid__meta">
            No variants yet. A variant is a named set of departures from this base product’s spec.
          </p>
        ) : (
          <ul className="specs-form" aria-label="Variants">
            {variants.map((v) => (
              <li
                key={v.id}
                className="specs-release"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{ fontWeight: 600 }}>{v.name}</span>
                {v.isDefault ? <span className="import-status import-status--published">Default</span> : null}
                <span className="specs-grid__meta">
                  {v.deltaCount} delta{v.deltaCount === 1 ? '' : 's'} · /{v.slug}
                </span>
                <span style={{ flex: 1 }} />
                {!v.isDefault ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => run(() => setVariantDefaultAction(v.id))}
                  >
                    Make default
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Delete variant “${v.name}”? Its deltas are removed.`)) {
                      void run(() => deleteVariantAction(v.id));
                    }
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
