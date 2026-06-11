import type { HTMLAttributes } from 'react';

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={['ui-skeleton', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
