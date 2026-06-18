'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BLOCK_VARIANT_SCOPE_LABELS,
  BLOCK_VARIANT_SCOPE_MODES,
  type BlockVariantScopeMode,
} from '@arther/types';
import { Button } from '@arther/ui';
import { setBlockVariantScopeAction } from './actions';

export interface ScopeBlock {
  id: string;
  label: string;
  type: string;
  mode: BlockVariantScopeMode;
  variantIds: string[];
  derivedComponentId: string | null;
}
export interface NamedRef {
  id: string;
  name: string;
}

/**
 * V.4 — set each block's variant scope (§3.4): ALL (default), DERIVED (shown only
 * where a chosen component exists in the variant), or MANUAL (shown only for
 * picked variants). Saved per row; the document's "Preview as variant" hides the
 * blocks a variant scopes out. Editor-gated server-side.
 */
function BlockRow({
  documentId,
  block,
  variants,
  components,
}: {
  documentId: string;
  block: ScopeBlock;
  variants: NamedRef[];
  components: NamedRef[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<BlockVariantScopeMode>(block.mode);
  const [variantIds, setVariantIds] = useState<string[]>(block.variantIds);
  const [derived, setDerived] = useState<string>(block.derivedComponentId ?? '');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggleVariant = (id: string) =>
    setVariantIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));

  async function save() {
    setPending(true);
    setMsg(null);
    const res = await setBlockVariantScopeAction(
      documentId,
      block.id,
      mode,
      mode === 'MANUAL' ? variantIds : [],
      mode === 'DERIVED' ? derived || null : null,
    );
    setPending(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Could not save.');
      return;
    }
    setMsg('Saved.');
    router.refresh();
  }

  return (
    <li className="specs-release" style={{ display: 'block' }}>
      <div className="specs-form--row" style={{ gap: 8, alignItems: 'center' }}>
        <span className="specs-release__tag">{block.type}</span>
        <span>{block.label}</span>
        <span style={{ flex: 1 }} />
        <select
          aria-label={`Scope for ${block.label}`}
          className="ui-field__input"
          value={mode}
          onChange={(e) => setMode(e.target.value as BlockVariantScopeMode)}
        >
          {BLOCK_VARIANT_SCOPE_MODES.map((m) => (
            <option key={m} value={m}>
              {BLOCK_VARIANT_SCOPE_LABELS[m]}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {msg ? <span className="specs-grid__meta">{msg}</span> : null}
      </div>
      {mode === 'DERIVED' ? (
        <div className="specs-form--row" style={{ gap: 6, marginTop: 4 }}>
          <span className="specs-grid__meta">Shown where this component exists:</span>
          <select className="ui-field__input" value={derived} onChange={(e) => setDerived(e.target.value)}>
            <option value="">Choose a component…</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {mode === 'MANUAL' ? (
        <fieldset className="specs-checks" style={{ marginTop: 4 }}>
          <legend className="ui-field__label">Shown only for</legend>
          {variants.map((v) => (
            <label key={v.id} className="specs-checks__item">
              <input
                type="checkbox"
                checked={variantIds.includes(v.id)}
                onChange={() => toggleVariant(v.id)}
              />
              {v.name}
            </label>
          ))}
        </fieldset>
      ) : null}
    </li>
  );
}

export function VariantScopeManager({
  documentId,
  blocks,
  variants,
  components,
}: {
  documentId: string;
  blocks: ScopeBlock[];
  variants: NamedRef[];
  components: NamedRef[];
}) {
  return (
    <ul className="specs-form" aria-label="Block variant scopes">
      {blocks.map((b) => (
        <BlockRow key={b.id} documentId={documentId} block={b} variants={variants} components={components} />
      ))}
    </ul>
  );
}
