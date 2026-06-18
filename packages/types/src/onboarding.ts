/**
 * K.8 — the admin first-run checklist. A non-gating nudge that helps a new
 * workspace reach the state where Arther generates on-brand, reviewable docs:
 * a product to document, a brand profile + document type to generate against,
 * and a teammate to review. The step set + copy + destinations are pure data
 * here; the app supplies the done-state (cheap existence checks) and renders.
 * It collapses (hides) once every step is done.
 */

export const FIRST_RUN_STEPS = [
  {
    key: 'product',
    label: 'Add your first product',
    description: 'The product whose specs and documentation you’ll manage.',
    href: '/specs',
  },
  {
    key: 'brand_profile',
    label: 'Create a brand profile',
    description: 'Logo, palette, voice, and glossary applied when generating and publishing.',
    href: '/settings/brand-profiles',
  },
  {
    key: 'document_type',
    label: 'Configure a document type',
    description: 'What a kind of document contains and which spec data feeds it.',
    href: '/settings/document-types',
  },
  {
    key: 'teammate',
    label: 'Invite a teammate',
    description: 'Bring in co-authors and the reviewers who approve documents.',
    href: '/settings',
  },
] as const;

export type FirstRunStepKey = (typeof FIRST_RUN_STEPS)[number]['key'];

export interface FirstRunChecklistItem {
  key: FirstRunStepKey;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

/**
 * Assemble the checklist from each step's done-state. `complete` is true only
 * when every step is done — the signal for the surface to collapse the checklist.
 */
export function buildFirstRunChecklist(done: Record<FirstRunStepKey, boolean>): {
  items: FirstRunChecklistItem[];
  remaining: number;
  complete: boolean;
} {
  const items: FirstRunChecklistItem[] = FIRST_RUN_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    description: step.description,
    href: step.href,
    done: done[step.key],
  }));
  const remaining = items.filter((i) => !i.done).length;
  return { items, remaining, complete: remaining === 0 };
}
