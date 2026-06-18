'use client';

import { useRouter } from 'next/navigation';

export interface VariantOption {
  id: string;
  name: string;
}

/**
 * V.8 — pick the two variants to compare. Navigates to `?a=&b=`, which re-renders
 * the server-side side-by-side. Read-only tool.
 */
export function ComparePicker({
  documentId,
  variants,
  a,
  b,
}: {
  documentId: string;
  variants: VariantOption[];
  a?: string;
  b?: string;
}) {
  const router = useRouter();
  const go = (next: { a?: string; b?: string }) => {
    const params = new URLSearchParams();
    const av = next.a ?? a;
    const bv = next.b ?? b;
    if (av) params.set('a', av);
    if (bv) params.set('b', bv);
    router.push(`/documents/${documentId}/compare?${params.toString()}`);
  };

  const select = (side: 'a' | 'b', value: string | undefined) => (
    <label className="ui-field" style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <span className="ui-field__label">Variant {side.toUpperCase()}</span>
      <select
        className="ui-field__input"
        value={value ?? ''}
        onChange={(e) => go({ [side]: e.target.value })}
      >
        <option value="">Choose…</option>
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="specs-form--row" style={{ gap: 12 }}>
      {select('a', a)}
      {select('b', b)}
    </div>
  );
}
