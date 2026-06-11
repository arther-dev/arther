import type { InputHTMLAttributes } from 'react';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Persistent visible label — placeholders are examples only (a11y audit U1). */
  label: string;
  id: string;
  /** Inline error text, announced via aria-describedby (never color-only). */
  error?: string;
  /** Helper text below the field when there is no error. */
  hint?: string;
}

/**
 * DS Text field atom. Resting boundary = border/input (Handoff 01 §2.3);
 * the DS component has no built-in label, so this pairs it with a real
 * <label for> and wires error text through aria-describedby (§11.4).
 */
export function TextField({ label, id, error, hint, className, ...rest }: TextFieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')}>
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`ui-field__input${error ? ' ui-field__input--error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error ? (
        <p className="ui-field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="ui-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
