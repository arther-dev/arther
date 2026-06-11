import type { ButtonHTMLAttributes } from 'react';
import { buttonVariants, type ButtonVariantProps } from './button-variants';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {}

export function Button({ variant, size, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonVariants({ variant, size, className })} {...rest} />;
}
