'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { publishVariantAction, unpublishVariantAction } from './lifecycle-actions';

export interface VariantPublishRow {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  /** A live (non-archived) variant snapshot is on the portal. */
  published: boolean;
}

/**
 * V.9 (spec §5.5) — publish each product variant to the portal as its own page,
 * independent of the base document and of sibling variants. Shown on a published
 * document for the owner/admin. Each variant gets Publish / Update / Unpublish and
 * (when live + the portal origin is configured) a link to its canonical URL.
 */
export function VariantPublishPanel({
  documentId,
  variants,
  portalBase,
  workspaceSlug,
  productId,
  documentSlug,
}: {
  documentId: string;
  variants: VariantPublishRow[];
  portalBase: string | null;
  workspaceSlug: string;
  productId: string;
  documentSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (variants.length === 0) return null;

  const run = (variantId: string, action: 'publish' | 'unpublish') => {
    setError(null);
    setBusyId(variantId);
    startTransition(async () => {
      const result =
        action === 'publish'
          ? await publishVariantAction(documentId, variantId)
          : await unpublishVariantAction(documentId, variantId);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.');
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="specs-card" aria-label="Variants on the portal">
      <h2 className="specs-subtitle">Variants on the portal</h2>
      <p className="specs-grid__meta">
        Each variant publishes its own portal page from this document, resolved against the variant’s
        spec. Publishing or unpublishing a variant leaves the base document and other variants
        untouched.
      </p>
      {error ? (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="specs-list">
        {variants.map((v) => {
          const busy = pending && busyId === v.id;
          const portalUrl = portalBase
            ? `${portalBase.replace(/\/$/, '')}/${workspaceSlug}/${productId}/${documentSlug}/var/${v.slug}`
            : null;
          return (
            <li key={v.id} className="specs-form--row" style={{ alignItems: 'center', gap: 12 }}>
              <span>
                <strong>{v.name}</strong>
                {v.isDefault ? <span className="specs-grid__meta"> · default</span> : null}
              </span>
              <span
                className={`import-status import-status--${v.published ? 'published' : 'draft'}`}
              >
                {v.published ? 'Published' : 'Not published'}
              </span>
              <span style={{ flex: 1 }} />
              {v.published && portalUrl ? (
                <a href={portalUrl} target="_blank" rel="noreferrer">
                  View →
                </a>
              ) : null}
              <button
                type="button"
                className="ui-button"
                disabled={busy}
                onClick={() => run(v.id, 'publish')}
              >
                {busy ? '…' : v.published ? 'Update' : 'Publish'}
              </button>
              {v.published ? (
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  disabled={busy}
                  onClick={() => run(v.id, 'unpublish')}
                >
                  Unpublish
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
