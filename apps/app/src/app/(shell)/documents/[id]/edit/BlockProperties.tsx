'use client';

import { useState } from 'react';
import {
  CALLOUT_VARIANTS,
  CHART_TYPES,
  IMAGE_WIDTHS,
  SPEC_TABLE_UNIT_PREFERENCES,
  TEXT_ALIGNMENTS,
  type BlockContent,
} from '@arther/types';

/**
 * G4.2 — the inspector's per-type property editors: a block's structural
 * attributes (the rich-text *content* is edited in the canvas via TipTap, G4.3).
 * Each change produces a new `BlockContent` and commits it through the same
 * editor-gated save path (re-validated by `blockContentSchema`).
 *
 * Covers the prose family + the leaf data/media types (spec_table column config,
 * chart config, toc, code, image/video/gif/hotspot). Container section/step
 * management (accordion, step wizard, safety children) and the field/source
 * pickers (spec_table rows, chart table field) are follow-up slices.
 *
 * Mounted with a `key` of the block id, so local text state resets on selection.
 */
export function BlockProperties({
  content,
  onCommit,
}: {
  content: BlockContent;
  onCommit: (next: BlockContent) => void;
}) {
  switch (content.type) {
    case 'section_header':
      return <TextProp label="Title" value={content.title} onCommit={(v) => onCommit({ ...content, title: v })} />;

    case 'heading':
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

    case 'callout':
      return (
        <>
          <SelectProp
            label="Style"
            value={content.variant}
            options={CALLOUT_VARIANTS.map((v) => [v, v] as [string, string])}
            onChange={(v) => onCommit({ ...content, variant: v as (typeof CALLOUT_VARIANTS)[number] })}
          />
          <TextProp
            label="Title"
            value={content.title ?? ''}
            onCommit={(v) => onCommit({ ...content, title: v || undefined })}
          />
        </>
      );

    case 'paragraph':
      return (
        <SelectProp
          label="Alignment"
          value={content.content.alignment}
          options={TEXT_ALIGNMENTS.map((a) => [a, a] as [string, string])}
          onChange={(v) =>
            onCommit({ ...content, content: { ...content.content, alignment: v as (typeof TEXT_ALIGNMENTS)[number] } })
          }
        />
      );

    case 'toc':
      return (
        <>
          <TextProp
            label="Title"
            value={content.title ?? ''}
            onCommit={(v) => onCommit({ ...content, title: v || undefined })}
          />
          <SelectProp
            label="Depth"
            value={String(content.depth)}
            options={[
              ['1', 'Section headers'],
              ['2', '+ H2 headings'],
              ['3', '+ H3 headings'],
            ]}
            onChange={(v) => onCommit({ ...content, depth: (Number(v) || 1) as 1 | 2 | 3 })}
          />
        </>
      );

    case 'code_block':
      return (
        <>
          <TextProp
            label="Language"
            value={content.language ?? ''}
            onCommit={(v) => onCommit({ ...content, language: v || undefined })}
          />
          <TextProp
            label="Caption"
            value={content.caption ?? ''}
            onCommit={(v) => onCommit({ ...content, caption: v || undefined })}
          />
          <TextAreaProp label="Code" value={content.content} onCommit={(v) => onCommit({ ...content, content: v })} />
        </>
      );

    case 'image':
      return (
        <>
          <TextProp label="Image URL" value={content.url} onCommit={(v) => onCommit({ ...content, url: v })} />
          <TextProp label="Alt text" value={content.alt_text} onCommit={(v) => onCommit({ ...content, alt_text: v })} />
          <SelectProp
            label="Width"
            value={content.width}
            options={IMAGE_WIDTHS.map((w) => [w, w] as [string, string])}
            onChange={(v) => onCommit({ ...content, width: v as (typeof IMAGE_WIDTHS)[number] })}
          />
        </>
      );

    case 'video':
      return (
        <>
          <TextProp label="Video URL" value={content.url} onCommit={(v) => onCommit({ ...content, url: v })} />
          <TextProp
            label="Thumbnail URL"
            value={content.thumbnail_url ?? ''}
            onCommit={(v) => onCommit({ ...content, thumbnail_url: v || undefined })}
          />
          <BoolProp label="Autoplay" value={content.autoplay} onChange={(v) => onCommit({ ...content, autoplay: v })} />
        </>
      );

    case 'gif':
      return (
        <>
          <TextProp label="GIF URL" value={content.url} onCommit={(v) => onCommit({ ...content, url: v })} />
          <TextProp label="Alt text" value={content.alt_text} onCommit={(v) => onCommit({ ...content, alt_text: v })} />
        </>
      );

    case 'hotspot_image':
      return (
        <>
          <TextProp label="Image URL" value={content.url} onCommit={(v) => onCommit({ ...content, url: v })} />
          <TextProp label="Alt text" value={content.alt_text} onCommit={(v) => onCommit({ ...content, alt_text: v })} />
          <p className="specs-grid__meta">{content.pins.length} pin{content.pins.length === 1 ? '' : 's'}.</p>
        </>
      );

    case 'spec_table': {
      const cfg = content.column_config;
      const setCfg = (patch: Partial<typeof cfg>) =>
        onCommit({ ...content, column_config: { ...cfg, ...patch } });
      return (
        <>
          <TextProp
            label="Title"
            value={content.title ?? ''}
            onCommit={(v) => onCommit({ ...content, title: v || undefined })}
          />
          <BoolProp label="Show min" value={cfg.show_min} onChange={(v) => setCfg({ show_min: v })} />
          <BoolProp label="Show typical" value={cfg.show_typical} onChange={(v) => setCfg({ show_typical: v })} />
          <BoolProp label="Show max" value={cfg.show_max} onChange={(v) => setCfg({ show_max: v })} />
          <BoolProp label="Show conditions" value={cfg.show_conditions} onChange={(v) => setCfg({ show_conditions: v })} />
          <BoolProp label="Show source" value={cfg.show_source} onChange={(v) => setCfg({ show_source: v })} />
          <SelectProp
            label="Units"
            value={cfg.unit_preference}
            options={SPEC_TABLE_UNIT_PREFERENCES.map((u) => [u, u] as [string, string])}
            onChange={(v) => setCfg({ unit_preference: v as (typeof SPEC_TABLE_UNIT_PREFERENCES)[number] })}
          />
          <NumberProp
            label="Decimal places"
            value={cfg.decimal_places ?? null}
            onCommit={(v) => setCfg({ decimal_places: v ?? undefined })}
          />
        </>
      );
    }

    case 'chart':
      return (
        <>
          <TextProp
            label="Title"
            value={content.title ?? ''}
            onCommit={(v) => onCommit({ ...content, title: v || undefined })}
          />
          <SelectProp
            label="Type"
            value={content.chart_type}
            options={CHART_TYPES.map((t) => [t, t] as [string, string])}
            onChange={(v) => onCommit({ ...content, chart_type: v as (typeof CHART_TYPES)[number] })}
          />
          <TextProp
            label="X-axis label"
            value={content.x_axis_label ?? ''}
            onCommit={(v) => onCommit({ ...content, x_axis_label: v || undefined })}
          />
          <TextProp
            label="Y-axis label"
            value={content.y_axis_label ?? ''}
            onCommit={(v) => onCommit({ ...content, y_axis_label: v || undefined })}
          />
          <BoolProp label="Legend" value={content.show_legend} onChange={(v) => onCommit({ ...content, show_legend: v })} />
          <BoolProp label="Grid" value={content.show_grid} onChange={(v) => onCommit({ ...content, show_grid: v })} />
        </>
      );

    default:
      return <p className="specs-grid__meta">No editable properties for a {content.type} block yet.</p>;
  }
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

/** Multiline text — commits on blur. */
function TextAreaProp({
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
      <textarea
        className="specs-textarea"
        rows={6}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
      />
    </label>
  );
}

/** Optional integer — empty clears it. Commits on blur. */
function NumberProp({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  return (
    <label className="specs-form">
      {label}
      <input
        className="ui-field__input"
        type="number"
        min={0}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim() === '' ? null : Math.max(0, Math.trunc(Number(draft)));
          if ((next ?? null) !== (value ?? null) && (next === null || Number.isFinite(next))) onCommit(next);
        }}
      />
    </label>
  );
}

function BoolProp({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="specs-form--row" style={{ gap: 6 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
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
