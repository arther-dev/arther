'use client';

import { useState } from 'react';
import { matchOptionValue, type ComboOption } from '@arther/types';

/**
 * F6 — a searchable single-select over a native `<datalist>`: the browser
 * handles type-ahead filtering, keyboard, and a11y; a hidden input carries the
 * resolved option *value* for the form (empty until the typed label matches an
 * option exactly, so an incomplete pick fails the action's validation). Lighter
 * and more robust than a hand-rolled dropdown — ideal for long reference lists.
 */
export function Combobox({
  id,
  name,
  label,
  options,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  options: ComboOption[];
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const value = matchOptionValue(options, text);
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        list={`${id}-list`}
        className="ui-field__input"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
      />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o.value} value={o.label} />
        ))}
      </datalist>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
