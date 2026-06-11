import { cva, type VariantProps } from 'class-variance-authority';

/** Mirrors the DS Status pill semantic axis. Text label is mandatory — never color-only. */
export const statusPillVariants = cva('ui-status-pill', {
  variants: {
    status: {
      live: 'ui-status-pill--live',
      stale: 'ui-status-pill--stale',
      review: 'ui-status-pill--review',
      draft: 'ui-status-pill--draft',
      unpublished: 'ui-status-pill--unpublished',
    },
  },
});

export type StatusPillVariantProps = VariantProps<typeof statusPillVariants>;
