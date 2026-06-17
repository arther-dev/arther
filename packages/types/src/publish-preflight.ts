import type { BlockContent } from './block-content';

/**
 * C4.1 — the publish pre-flight scan (collaboration spec §5.2 / architecture
 * §5.3). Pure so the app and any future pre-flight screen share one source.
 * **Blocking** issues stop the publish (a placeholder block has no content to
 * freeze); **advisory** issues are surfaced but don't block (the owner decides).
 *
 * The vacant-approval-role blocking case is already enforced upstream — a
 * document can't reach Approved (publishable) with a required role unassigned
 * (C1 §4.2 submit gate + the AND-logic gate), so it can't recur here.
 */
export interface PublishPreflightInput {
  blocks: { source: string; content: BlockContent }[];
  /** How many blocks reference spec values that changed since generation (G6.1). */
  staleBlockCount?: number;
}

export interface PublishPreflight {
  blocking: string[];
  advisory: string[];
  canPublish: boolean;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

export function computePublishPreflight(input: PublishPreflightInput): PublishPreflight {
  const blocking: string[] = [];
  const advisory: string[] = [];

  const placeholders = input.blocks.filter((b) => b.source === 'placeholder').length;
  if (placeholders > 0) {
    blocking.push(
      `${placeholders} placeholder ${plural(placeholders, 'block')} still ${plural(
        placeholders,
        'needs',
        'need',
      )} content — fill the brief fragment, then regenerate.`,
    );
  }

  const missingAlt = input.blocks.filter((b) => {
    const c = b.content as { alt_text?: unknown };
    return typeof c.alt_text === 'string' && c.alt_text.trim() === '';
  }).length;
  if (missingAlt > 0) {
    advisory.push(`${missingAlt} ${plural(missingAlt, 'image')} missing alt text.`);
  }

  const stale = input.staleBlockCount ?? 0;
  if (stale > 0) {
    advisory.push(
      `${stale} ${plural(stale, 'block')} reference spec values that changed since generation.`,
    );
  }

  return { blocking, advisory, canPublish: blocking.length === 0 };
}
