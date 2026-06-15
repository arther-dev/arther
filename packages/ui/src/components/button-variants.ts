import { cva, type VariantProps } from 'class-variance-authority';

/** Mirrors the DS Button variant axes (Variant × Size); state via CSS pseudo-classes. */
export const buttonVariants = cva('ui-btn', {
  variants: {
    variant: {
      primary: 'ui-btn--primary',
      secondary: 'ui-btn--secondary',
      ghost: 'ui-btn--ghost',
      danger: 'ui-btn--danger',
    },
    size: {
      md: '',
      sm: 'ui-btn--sm',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
