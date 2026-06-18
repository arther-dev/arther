import Link from 'next/link';
import type { DocumentSnippetEmbed } from '@arther/db';
import { AcceptSourceButton } from './AcceptSourceButton';
import { KeepOverrideButton } from './KeepOverrideButton';

/**
 * R.3 — the snippet-embed override panel on the document page (§5.4/§5.6). For the
 * document owner: each live embed can be overridden (a document-local edit that
 * detaches it from the source); each overridden / source-changed embed can be
 * re-edited or have the source accepted (dropping the override). Live embeds with
 * no divergence still link out so the owner can start an override.
 */
const STATE_LABEL: Record<DocumentSnippetEmbed['state'], string> = {
  live: 'Follows the source',
  overridden: 'Overridden here',
  source_changed: 'Source changed since override',
};

export function SnippetEmbedsPanel({
  documentId,
  embeds,
}: {
  documentId: string;
  embeds: DocumentSnippetEmbed[];
}) {
  if (embeds.length === 0) return null;
  return (
    <section className="specs-form" aria-label="Snippet embeds">
      <h2 className="specs-subtitle">Snippet embeds</h2>
      <p className="specs-grid__meta">
        Embedded snippets follow their source library item. Override one to edit it just for this
        document; accept the source to drop the override and follow the snippet again.
      </p>
      <ul className="specs-form" style={{ listStyle: 'none', padding: 0 }}>
        {embeds.map((embed) => (
          <li
            key={embed.blockId}
            className="specs-release"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ fontWeight: 600 }}>{embed.libraryItemName}</span>
            <span className={`import-status import-status--${embed.state === 'live' ? 'draft' : 'review'}`}>
              {/* R.5 — a frozen copy of an archived source is static, not an override. */}
              {embed.sourceArchived ? 'Static copy (source archived)' : STATE_LABEL[embed.state]}
            </span>
            <span style={{ flex: 1 }} />
            <Link
              className="ui-btn ui-btn--ghost ui-btn--sm"
              href={`/documents/${documentId}/embeds/${embed.blockId}`}
            >
              {embed.state === 'live' ? 'Override' : 'Edit copy'}
            </Link>
            {/* Accept-source / keep-override re-link to or track the live source, which
                an archived (static) source no longer has — so suppress them there. */}
            {!embed.sourceArchived && embed.state === 'source_changed' ? (
              <KeepOverrideButton blockId={embed.blockId} />
            ) : null}
            {!embed.sourceArchived && embed.state !== 'live' ? (
              <AcceptSourceButton blockId={embed.blockId} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
