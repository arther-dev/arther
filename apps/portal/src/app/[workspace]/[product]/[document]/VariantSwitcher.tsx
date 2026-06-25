import Link from 'next/link';
import type { DocumentVariantIndex } from '@arther/db';
import { documentPath, variantPath } from '../../../../lib/portal-url';

/**
 * V.9 — the persistent variant switcher / picker. Rendered on the base document
 * page (where it doubles as the picker) and on every variant page, listing all
 * PUBLISHED variants as canonical links. The current page and the default variant
 * are marked. Hidden entirely when a document has no published variants, so a
 * single-variant-free document is unaffected. Presentational — the published set
 * is resolved server-side (`listDocumentPublishedVariants`).
 */
export function VariantSwitcher({
  workspaceSlug,
  productId,
  documentSlug,
  index,
  current,
}: {
  workspaceSlug: string;
  productId: string;
  documentSlug: string;
  index: DocumentVariantIndex;
  current: { kind: 'base' } | { kind: 'variant'; slug: string };
}) {
  if (index.variants.length === 0) return null;

  const baseCurrent = current.kind === 'base';
  return (
    <nav className="portal-variants" aria-label="Variants">
      <p className="portal-variants__label">Variants</p>
      <ul className="portal-variants__list">
        {index.baseAvailable ? (
          <li>
            <Link
              className="portal-variants__item"
              href={documentPath(workspaceSlug, productId, documentSlug)}
              aria-current={baseCurrent ? 'page' : undefined}
              data-current={baseCurrent ? '' : undefined}
            >
              Base
            </Link>
          </li>
        ) : null}
        {index.variants.map((v) => {
          const isCurrent = current.kind === 'variant' && current.slug === v.slug;
          return (
            <li key={v.variantId}>
              <Link
                className="portal-variants__item"
                href={variantPath(workspaceSlug, productId, documentSlug, v.slug)}
                aria-current={isCurrent ? 'page' : undefined}
                data-current={isCurrent ? '' : undefined}
              >
                {v.name}
                {v.isDefault ? <span className="portal-variants__default"> · default</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
