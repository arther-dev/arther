'use client';

import { useState } from 'react';
import { CALLOUT_VARIANTS, TEXT_ALIGNMENTS, type BlockContent } from '@arther/types';

/**
 * G4.2 — the inspector's per-type property editors: a block's structural
 * attributes (the rich-text *content* is edited in the canvas via TipTap, G4.3).
 * Each change produces a new `BlockContent` and commits it through the same
 * editor-gated save path. This first slice covers the generated prose family
 * (section header, heading, callout, paragraph); the remaining block types'
 * editors (spec_table columns, chart config, media, accordion/wizard sections)
 * are added incrementally.
 *
 * Mounted with a `key` of the block id, so its local text state resets when the
 * selection changes.
 */
export function BlockProperties({
  content,
  onCommit,
}: {
  content: BlockContent;
  onCommit: (next: BlockContent) => void;
}) {
  if (content.type === 'section_header') {
    return (
      <TextProp label="Title" value={content.title} onCommit={(v) => onCommit({ ...content, title: v })} />
    );
  }
  if (content.type === 'heading') {
    return (
      <SelectProp
        label="Level"
        value={String(content.level)}
        options={[
          ['2', 'Heading 2'],
          ['3', 'Heading 3'],
        ]}
        onChange={(v) => onCommit({ ...content, level: Number(v) === 3 ? 3 : 2 })}
      />
    );
  }
  if (content.type === 'callout') {
    return (
      <>
        <SelectProp
          label="Style"
          value={content.variant}
          options={CALLOUT_VARIANTS.map((v) => [v, v] as [string, string])}
          onChange={(v) =>
            onCommit({ ...content, variant: v as (typeof CALLOUT_VARIANTS)[number] })
          }
        />
        <TextProp
          label="Title"
          value={content.title ?? ''}
          onCommit={(v) => onCommit({ ...content, title: v || undefined })}
        />
      </>
    );
  }
  if (content.type === 'paragraph') {
    return (
      <SelectProp
        label="Alignment"
        value={content.content.alignment}
        options={TEXT_ALIGNMENTS.map((a) => [a, a] as [string, string])}
        onChange={(v) =>
          onCommit({
            ...content,
            content: { ...content.content, alignment: v as (typeof TEXT_ALIGNMENTS)[number] },
          })
        }
      />
    );
  }
  return (
    <p className="specs-grid__meta">No editable properties for a {content.type} block yet.</p>
  );
}

/** Text property — commits on blur (per-keystroke save is debounced into G5). */
function TextProp({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="specs-form">
      {label}
      <input
        className="ui-field__input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
      />
    </label>
  );
}

function SelectProp({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="specs-form">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([val, lbl]) => (
          <option key={val} value={val}>
            {lbl}
          </option>
        ))}
      </select>
    </label>
  );
}
