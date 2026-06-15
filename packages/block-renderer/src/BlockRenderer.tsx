import type { ReactNode } from 'react';
import type { BlockContent } from '@arther/types';
import { RichText } from './RichText';

/**
 * G4.4 — the one read-only renderer for the block tree. Editor preview, portal
 * SSR, and PDF all render through this (degradation contracts wire in at C5/C6).
 * Prose, safety, and container blocks render fully; data/media blocks
 * (spec_table, chart, image variants) render structurally with a labelled
 * placeholder until their live-value resolution lands.
 */
export interface BlockRendererProps {
  blocks: BlockContent[];
}

export function BlockRenderer({ blocks }: BlockRendererProps) {
  return (
    <div className="br-doc">
      {blocks.map((content, i) => (
        <Block key={i} content={content} />
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

function Block({ content }: { content: BlockContent }): ReactNode {
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
              <Block key={i} content={child} />
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
                <Block key={i} content={child} />
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
                <Block key={i} content={child} />
              ))}
            </li>
          ))}
        </ol>
      );
    case 'spec_table':
      return (
        <Placeholder
          label={`Specification table — ${content.rows.length} row${content.rows.length === 1 ? '' : 's'}`}
        />
      );
    case 'chart':
      return <Placeholder label={content.title ?? 'Chart'} />;
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
