import type { HTMLAttributes } from 'react';

export function Divider({ className, ...rest }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={['ui-divider', className].filter(Boolean).join(' ')} {...rest} />;
}
