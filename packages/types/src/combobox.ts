/**
 * F6 — searchable combobox value resolution. A native `<datalist>` shows option
 * labels, but the form needs the option *value*; this maps the typed/selected
 * label back to its value (case-insensitive, trimmed). No exact match → '' so the
 * form's required-value validation rejects an incomplete pick. Pure + tested.
 */
export interface ComboOption {
  value: string;
  label: string;
}

export function matchOptionValue(options: readonly ComboOption[], label: string): string {
  const needle = label.trim().toLowerCase();
  if (needle === '') return '';
  const hit = options.find((o) => o.label.trim().toLowerCase() === needle);
  return hit ? hit.value : '';
}
