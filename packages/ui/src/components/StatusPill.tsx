import type { HTMLAttributes, ReactNode } from 'react';
import { statusPillVariants, type StatusPillVariantProps } from './status-pill-variants';

export interface StatusPillProps
  extends HTMLAttributes<HTMLSpanElement>,
    Required<Pick<StatusPillVariantProps, 'status'>> {
  /** Visible label — mandatory; status is never signalled by color alone. */
  children: ReactNode;
}

export function StatusPill({ status, className, children, ...rest }: StatusPillProps) {
  return (
    <span className={statusPillVariants({ status, className })} {...rest}>
      {children}
    </span>
  );
}
