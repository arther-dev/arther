import type { ReactNode } from 'react';
import {
  blockPlainText,
  deriveSpecTableCells,
  type BlockContent,
  type SpecFieldResolution,
  type TableValue,
} from '@arther/types';
import { SpecChart } from '@arther/ui';
import { RichText } from './RichText';

/**
 * G4.4 — the one read-only renderer for the block tree. Editor preview, portal
 * SSR, and PDF all render through this. Prose, safety, containers, data
 * (spec_table + chart, with a `resolved` field map), media (image/video/gif/
 * hotspot_image), and the toc all render fully; only `snippet` (Content Reuse,
 * Phase 4) stays a labelled placeholder.
 *
 * C5.2 — the print degradation contract (ADR-008: the PDF is this same SSR HTML
 * printed through headless Chrome). In `print` mode the blocks that only make
 * sense interactively degrade to static, paper-friendly equivalents: a `video`
 * becomes its poster frame + the source URL (controls can't play on paper), and
 * an `accordion` renders every section expanded (nothing is hidden behind a
 * collapsed `<details>` in a printout). Every other block already prints as-is.
 */
export type BlockRenderMode = 'web' | 'print';

export interface BlockRendererProps {
  blocks: BlockContent[];
  /**
   * G4 live data blocks — field_id → current value, resolved server-side, for
   * spec_table rows. Absent (e.g. unprovisioned, or a not-yet-wired surface)
   * degrades those blocks to a labelled placeholder.
   */
  resolved?: SpecFieldResolution;
  /** Web (default) or the C5.2 print degradation profile (the PDF source). */
  mode?: BlockRenderMode;
}

/** A heading in the document, for the toc and the heading anchors it links to. */
interface TocHeading {
  anchorId: string;
  text: string;
  /** 1 = section header, 2 = H2, 3 = H3. */
  level: number;
}

const anchorFor = (index: number) => `br-block-${index}`;

/** Top-level section headers + headings, in document order (the toc source). */
function collectTocHeadings(blocks: BlockContent[]): TocHeading[] {
  const headings: TocHeading[] = [];
  blocks.forEach((content, i) => {
    if (content.type === 'section_header') {
      headings.push({ anchorId: anchorFor(i), text: content.title || 'Section', level: 1 });
    } else if (content.type === 'heading') {
      headings.push({ anchorId: anchorFor(i), text: blockPlainText(content) || 'Heading', level: content.level });
    }
  });
  return headings;
}

export function BlockRenderer({ blocks, resolved, mode = 'web' }: BlockRendererProps) {
  const headings = collectTocHeadings(blocks);
  return (
    <div className={mode === 'print' ? 'br-doc br-doc--print' : 'br-doc'}>
      {blocks.map((content, i) => (
        <Block key={i} content={content} resolved={resolved} index={i} headings={headings} mode={mode} />
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
        chartType={content.chart_type}
        xAxisLabel={content.x_axis_label}
        yAxisLabel={content.y_axis_label}
        showLegend={content.show_legend}
        showGrid={content.show_grid}
      />
    </div>
  );
}

function Toc({
  content,
  headings,
}: {
  content: Extract<BlockContent, { type: 'toc' }>;
  headings: TocHeading[];
}): ReactNode {
  // depth N includes headings down to level N (1 = section headers only).
  const items = headings.filter((h) => h.level <= content.depth);
  if (items.length === 0) return <Placeholder label={content.title ?? 'Table of contents'} />;
  return (
    <nav className="br-toc" aria-label={content.title ?? 'Table of contents'}>
      {content.title ? <p className="br-toc__title">{content.title}</p> : null}
      <ul>
        {items.map((h) => (
          <li key={h.anchorId} style={{ marginLeft: (h.level - 1) * 16 }}>
            <a href={`#${h.anchorId}`}>{h.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Block({
  content,
  resolved,
  index,
  headings = [],
  mode = 'web',
}: {
  content: BlockContent;
  resolved?: SpecFieldResolution;
  /** Top-level position — the toc anchor target for headings (omitted when nested). */
  index?: number;
  headings?: TocHeading[];
  mode?: BlockRenderMode;
}): ReactNode {
  const anchorId = index === undefined ? undefined : anchorFor(index);
  switch (content.type) {
    case 'section_header':
      return (
        <h2 id={anchorId} className="br-section-header">
          {content.title}
        </h2>
      );
    case 'heading': {
      const Tag = content.level === 2 ? 'h2' : 'h3';
      return (
        <Tag id={anchorId} className="br-heading" style={{ textAlign: content.content.alignment }}>
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
              <Block key={i} content={child} resolved={resolved} mode={mode} />
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
            // C5.2 — print expands every section so nothing hides behind a
            // collapsed <details> in the PDF.
            <details key={section.id} open={mode === 'print' ? true : section.default_open}>
              <summary>{section.title}</summary>
              {section.children.map((child, i) => (
                <Block key={i} content={child} resolved={resolved} mode={mode} />
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
                <Block key={i} content={child} resolved={resolved} mode={mode} />
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
      return <Toc content={content} headings={headings} />;
    case 'video':
      // C5.2 — a video can't play on paper: print degrades to the poster frame
      // (when present) plus the source URL, so the PDF shows a still + a link.
      if (mode === 'print') {
        return (
          <figure className="br-figure br-video--print">
            {content.thumbnail_url ? (
              <img src={content.thumbnail_url} alt={content.caption ? '' : 'Video'} />
            ) : null}
            <figcaption>
              {content.caption ? <RichText content={content.caption} /> : null}
              <span className="br-video__url">Video: {content.url}</span>
            </figcaption>
          </figure>
        );
      }
      return (
        <figure className="br-figure">
          <video className="br-video" src={content.url} poster={content.thumbnail_url} controls>
            <a href={content.url}>Watch video</a>
          </video>
          {content.caption ? (
            <figcaption>
              <RichText content={content.caption} />
            </figcaption>
          ) : null}
        </figure>
      );
    case 'gif':
      return (
        <figure className="br-figure">
          <img className="br-gif" src={content.url} alt={content.alt_text} />
          {content.caption ? (
            <figcaption>
              <RichText content={content.caption} />
            </figcaption>
          ) : null}
        </figure>
      );
    case 'hotspot_image':
      return (
        <figure className="br-figure br-hotspot">
          <div className="br-hotspot__frame" style={{ position: 'relative', display: 'inline-block' }}>
            <img src={content.url} alt={content.alt_text} />
            {content.pins.map((pin) => (
              <span
                key={pin.id}
                className="br-hotspot__pin"
                style={{
                  position: 'absolute',
                  left: `${pin.x_percent}%`,
                  top: `${pin.y_percent}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                aria-label={`${pin.number}: ${pin.label}`}
              >
                {pin.number}
              </span>
            ))}
          </div>
          {content.pins.length > 0 ? (
            <ol className="br-hotspot__legend">
              {content.pins.map((pin) => (
                <li key={pin.id} value={pin.number}>
                  {pin.label}
                </li>
              ))}
            </ol>
          ) : null}
          {content.caption ? (
            <figcaption>
              <RichText content={content.caption} />
            </figcaption>
          ) : null}
        </figure>
      );
    // Snippets are the Content Reuse feature (Phase 4); their content isn't
    // resolvable yet, so the labelled placeholder stays until that lands.
    case 'snippet':
      return <Placeholder label={`Snippet: ${content.snippet_name}`} />;
    default:
      return null;
  }
}
