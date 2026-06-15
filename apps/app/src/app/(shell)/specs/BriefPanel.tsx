import Link from 'next/link';
import type { BriefFragmentRow, BriefKeyUsage } from '@arther/db';
import {
  briefGuidance,
  briefKeyLabel,
  orderBriefKeys,
  type BriefEntityType,
} from '@arther/types';
import { BriefFragmentForm } from './BriefForms';

/**
 * Product Brief surface (G0.6, generator spec §5.7). Lists every expected
 * fragment key with completeness; selecting one expands the plain-text editor
 * with its Arther-defined guidance and the Document Type sections that
 * reference it. Mirrors the spec graph — the same panel serves a product or a
 * component (a component's brief is shared by every product that references it).
 */
export function BriefPanel({
  entityType,
  entityId,
  fragments,
  keyUsage,
  expandedKey,
  basePath,
  editorNames,
}: {
  entityType: BriefEntityType;
  entityId: string;
  fragments: BriefFragmentRow[];
  keyUsage: BriefKeyUsage[];
  expandedKey?: string;
  /** Already carries the entity selector, e.g. `/specs?product=ID&tab=brief`. */
  basePath: string;
  editorNames: Map<string, string>;
}) {
  const present = new Map(fragments.map((f) => [f.key, f]));
  const keys = orderBriefKeys([...keyUsage.map((u) => u.key), ...present.keys()]);
  const usageFor = (key: string) => keyUsage.filter((u) => u.key === key);

  if (expandedKey) {
    const fragment = present.get(expandedKey) ?? null;
    const usage = usageFor(expandedKey);
    const guidance = briefGuidance(expandedKey);
    const editor = fragment?.updated_by ? editorNames.get(fragment.updated_by) : undefined;
    return (
      <section className="specs-section" aria-label={`Brief — ${briefKeyLabel(expandedKey)}`}>
        <header className="specs-form--row">
          <Link className="ui-btn ui-btn--ghost" href={basePath}>
            ← Back to brief
          </Link>
          <h2 className="specs-section__title">{briefKeyLabel(expandedKey)}</h2>
        </header>
        <div className="specs-brief__expanded">
          <div className="specs-brief__editor">
            <BriefFragmentForm
              entityType={entityType}
              entityId={entityId}
              fragmentKey={expandedKey}
              content={fragment?.content ?? ''}
            />
            {fragment ? (
              <p className="specs-grid__meta">
                Last edited {editor ? `${editor} · ` : ''}
                {new Date(fragment.updated_at).toLocaleDateString()}
              </p>
            ) : null}
          </div>
          <aside className="specs-brief__aside">
            <h3 className="specs-brief__aside-title">Referenced by</h3>
            {usage.length > 0 ? (
              <ul className="specs-brief__refs">
                {usage.map((u, i) => (
                  <li key={`${u.documentTypeName}-${u.sectionName}-${i}`}>
                    {u.documentTypeName}
                    <span className="specs-grid__meta">
                      {' '}
                      — {u.sectionName}
                      {u.required ? ' (required)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="specs-grid__meta">
                No Document Type section references this fragment yet.
              </p>
            )}
            {guidance ? (
              <>
                <h3 className="specs-brief__aside-title">Guidance</h3>
                <p className="specs-grid__meta">{guidance}</p>
              </>
            ) : null}
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="specs-section" aria-label="Product Brief">
      <h2 className="specs-section__title">Product Brief</h2>
      <p className="specs-grid__meta">
        Freeform narrative the document generator draws from — the context spec fields can’t
        capture. Fill the fragments your Document Types reference.
      </p>
      <ul className="specs-brief__list" aria-label="Brief fragments">
        {keys.map((key) => {
          const fragment = present.get(key);
          const refs = usageFor(key).length;
          const added = !!fragment && fragment.content.trim().length > 0;
          return (
            <li key={key} className="specs-brief__row">
              <Link
                className="specs-field-link"
                href={`${basePath}&fragment=${encodeURIComponent(key)}`}
              >
                <span aria-hidden="true" className="specs-brief__status">
                  {added ? '✓' : '○'}
                </span>{' '}
                {briefKeyLabel(key)}
              </Link>
              <span className="specs-grid__meta">
                {added ? 'added' : 'not yet added'}
                {refs > 0
                  ? ` · referenced by ${refs} section${refs > 1 ? 's' : ''}`
                  : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
