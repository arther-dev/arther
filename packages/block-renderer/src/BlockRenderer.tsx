import type { ReactNode } from 'react';
import {
  deriveSpecTableCells,
  type BlockContent,
  type SpecFieldResolution,
  type TableValue,
} from '@arther/types';
import { SpecChart } from '@arther/ui';
import { RichText } from './RichText';

/**
 * G4.4 — the one read-only renderer for the block tree. Editor preview, portal
 * SSR, and PDF all render through this (degradation contracts wire in at C5/C6).
 * Prose, safety, container, and (with a `resolved` field map) spec_table and
 * chart blocks render fully; the remaining media blocks (video/gif/hotspot/
 * snippet/toc) render structurally with a labelled placeholder for now.
 */
export interface BlockRendererProps {
  blocks: BlockContent[];
  /**
   * G4 live data blocks — field_id → current value, resolved server-side, for
   * spec_table rows. Absent (e.g. unprovisioned, or a not-yet-wired surface)
   * degrades those blocks to a labelled placeholder.
   */
  resolved?: SpecFieldResolution;
}

export function BlockRenderer({ blocks, resolved }: BlockRendererProps) {
  return (
    <div className="br-doc">
      {blocks.map((content, i) => (
        <Block key={i} content={content} resolved={resolved} />
      ))}
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="br-placeholder" role="note">
      {label}
    </div>
  );
}

function SpecTable({
  content,
  resolved,
}: {
  content: Extract<BlockContent, { type: 'spec_table' }>;
  resolved?: SpecFieldResolution;
}): ReactNode {
  // Without resolved field values there is nothing live to show — keep the
  // structural placeholder (the portal/PDF wire this in at C5/C6).
  if (!resolved) {
    return (
      <Placeholder
        label={`Specification table — ${content.rows.length} row${content.rows.length === 1 ? '' : 's'}`}
      />
    );
  }

  const cfg = content.column_config;
  const showValue = cfg.show_min || cfg.show_typical || cfg.show_max;
  const rows = content.rows
    .filter((r) => r.visible)
    .slice()
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <figure className="br-spec-table">
      {content.title ? <figcaption className="br-spec-table__title">{content.title}</figcaption> : null}
      <table>
        <thead>
          <tr>
            <th scope="col">Specification</th>
            {cfg.show_min ? <th scope="col">Min</th> : null}
            {cfg.show_typical || !showValue ? <th scope="col">Typical</th> : null}
            {cfg.show_max ? <th scope="col">Max</th> : null}
            {cfg.show_conditions ? <th scope="col">Conditions</th> : null}
            {cfg.show_source ? <th scope="col">Source</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const field = resolved[row.field_id];
            const cells = deriveSpecTableCells(
              field?.type ?? 'scalar',
              field?.value ?? null,
              field?.unitSymbol ?? null,
              cfg.decimal_places,
            );
            const name = row.display_label ?? field?.name ?? '(field)';
            return (
              <tr key={row.field_id}>
                <th scope="row">{name}</th>
                {cfg.show_min ? <td>{cells.min}</td> : null}
                {cfg.show_typical || !showValue ? <td>{cells.typical}</td> : null}
                {cfg.show_max ? <td>{cells.max}</td> : null}
                {cfg.show_conditions ? <td>—</td> : null}
                {cfg.show_source ? <td>{field?.ownerName ?? 'Product'}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </figure>
  );
}

function Chart({
  content,
  resolved,
}: {
  content: Extract<BlockContent, { type: 'chart' }>;
  resolved?: SpecFieldResolution;
}): ReactNode {
  const field = resolved?.[content.table_field_id];
  // The chart plots a table field's live value (spec §3.1); without it (no
  // resolution, missing field, or empty value) keep the labelled placeholder.
  if (!field || field.type !== 'table' || field.value == null) {
    return <Placeholder label={content.title ?? 'Chart'} />;
  }
  const table = field.value as TableValue;
  return (
    <div className="br-chart">
      {content.title ? <p className="br-chart__title">{content.title}</p> : null}
      <SpecChart
        columns={table.columns.map((c) => ({ id: c.id, name: c.name, role: c.role }))}
        rows={table.rows}
        interpolation={table.interpolation}
      />
    </div>
  );
}

function Block({
  content,
  resolved,
}: {
  content: BlockContent;
  resolved?: SpecFieldResolution;
}): ReactNode {
  switch (content.type) {
    case 'section_header':
      return <h2 className="br-section-header">{content.title}</h2>;
    case 'heading': {
      const Tag = content.level === 2 ? 'h2' : 'h3';
      return (
        <Tag className="br-heading" style={{ textAlign: content.content.alignment }}>
          <RichText content={content.content} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className="br-p" style={{ textAlign: content.content.alignment }}>
          <RichText content={content.content} />
        </p>
      );
    case 'callout':
      return (
        <aside className={`br-callout br-callout--${content.variant}`}>
          {content.title ? <strong className="br-callout__title">{content.title}</strong> : null}
          <RichText content={content.content} />
        </aside>
      );
    case 'code_block':
      return (
        <figure className="br-code">
          <pre>
            <code>{content.content}</code>
          </pre>
          {content.caption ? <figcaption>{content.caption}</figcaption> : null}
        </figure>
      );
    case 'warning':
    case 'caution':
    case 'note':
      return (
        <aside className={`br-safety br-safety--${content.type}`} role="note">
          {content.title ? <strong className="br-safety__title">{content.title}</strong> : null}
          <div className="br-safety__body">
            {content.children.map((child, i) => (
              <Block key={i} content={child} resolved={resolved} />
            ))}
          </div>
        </aside>
      );
    case 'divider':
      return <hr className="br-divider" />;
    case 'page_break':
      return <div className="br-page-break" aria-hidden="true" />;
    case 'image':
      return (
        <figure className="br-figure">
          <img src={content.url} alt={content.alt_text} />
          {content.caption ? (
            <figcaption>
              <RichText content={content.caption} />
            </figcaption>
          ) : null}
        </figure>
      );
    case 'accordion':
      return (
        <div className="br-accordion">
          {content.sections.map((section) => (
            <details key={section.id} open={section.default_open}>
              <summary>{section.title}</summary>
              {section.children.map((child, i) => (
                <Block key={i} content={child} resolved={resolved} />
              ))}
            </details>
          ))}
        </div>
      );
    case 'step_wizard':
      return (
        <ol className="br-wizard">
          {content.steps.map((step) => (
            <li key={step.id}>
              <h3 className="br-wizard__title">{step.title}</h3>
              {step.children.map((child, i) => (
                <Block key={i} content={child} resolved={resolved} />
              ))}
            </li>
          ))}
        </ol>
      );
    case 'spec_table':
      return <SpecTable content={content} resolved={resolved} />;
    case 'chart':
      return <Chart content={content} resolved={resolved} />;
    case 'toc':
      return <Placeholder label={content.title ?? 'Table of contents'} />;
    case 'video':
      return <Placeholder label="Video" />;
    case 'gif':
      return <Placeholder label="Animation" />;
    case 'hotspot_image':
      return <Placeholder label="Annotated image" />;
    case 'snippet':
      return <Placeholder label={content.snippet_name} />;
    default:
      return null;
  }
}
