import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getSpecField,
  listFieldComments,
  listFieldVersions,
  listUsersByIds,
  type UnitRow,
} from '@arther/db';
import { formatFieldValue, type SpecFieldId, type UserId } from '@arther/types';
import { ArchiveToggle, CommentForm } from './DetailForms';
import type { ComponentOption } from './FieldValueEditor';

/**
 * Field detail + history (F6.1's third panel content): the F6.5 unified
 * chronological feed — value changes and comments interleaved, each comment
 * carrying its "at this comment" value snapshot (F5.8) — plus the F5.10
 * archive lifecycle for the field. Server-rendered; selected via ?field=.
 */
export async function FieldDetail({
  supabase,
  fieldId,
  units,
  components,
  closeHref,
}: {
  supabase: SupabaseClient;
  fieldId: SpecFieldId;
  units: UnitRow[];
  components: ComponentOption[];
  closeHref: string;
}) {
  const field = await getSpecField(supabase, fieldId);
  if (!field) return null;

  const [versions, comments] = await Promise.all([
    listFieldVersions(supabase, fieldId),
    listFieldComments(supabase, fieldId),
  ]);
  const people = await listUsersByIds(supabase, [
    ...versions.map((v) => v.changed_by),
    ...comments.map((c) => c.author_id),
  ].filter((id): id is UserId => id !== null));
  const who = (id: UserId | null) =>
    id ? (people.get(id)?.name ?? people.get(id)?.email ?? 'someone') : 'someone';

  const symbolFor = (value: unknown) => {
    const unitId =
      value && typeof value === 'object' && 'unit_id' in value
        ? ((value as { unit_id?: string }).unit_id ?? field.unit_id)
        : field.unit_id;
    return units.find((u) => u.id === unitId)?.symbol;
  };
  const fmt = (value: unknown) =>
    formatFieldValue(field.type, (value ?? null) as never, symbolFor(value));

  const referencedName =
    field.type === 'reference' && field.value
      ? components.find((c) => c.id === (field.value as { component_id: string }).component_id)
          ?.name
      : undefined;

  // F6.5: one chronological feed, newest first.
  const feed = [
    ...versions.map((v) => ({
      kind: 'version' as const,
      at: v.changed_at,
      body: `${fmt(v.value)}${v.note ? ` — ${v.note}` : ''}`,
      author: who(v.changed_by),
    })),
    ...comments.map((c) => ({
      kind: 'comment' as const,
      at: c.created_at,
      body: c.body,
      context: c.value_snapshot !== null ? fmt(c.value_snapshot) : null,
      author: who(c.author_id),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <section className="specs-section specs-detail" id="field-detail" aria-label={`${field.name} detail`}>
      <header className="specs-form--row">
        <h2 className="specs-section__title">{field.name}</h2>
        <span className="specs-grid__meta">
          {field.type} · {field.category}
        </span>
        {field.archived_at ? <span className="specs-override-chip">Archived</span> : null}
        <ArchiveToggle
          entity="spec_fields"
          id={field.id}
          archived={field.archived_at !== null}
          label={field.name}
        />
        <Link href={closeHref} className="specs-value-button">
          Close
        </Link>
      </header>
      <p>
        Current:{' '}
        {referencedName ? (
          <Link href="/specs/library" className="specs-value-button">
            → {referencedName}
          </Link>
        ) : (
          <strong>{fmt(field.value)}</strong>
        )}
      </p>

      <CommentForm fieldId={field.id} />

      {feed.length === 0 ? (
        <p className="specs-grid__meta">No history yet — the first value change or comment starts the feed.</p>
      ) : (
        <ol className="specs-feed" aria-label="Version and comment history">
          {feed.map((item, i) => (
            <li key={i} className="specs-feed__item">
              <span className="specs-grid__meta">
                {new Date(item.at).toLocaleString()} · {item.author}
              </span>
              {item.kind === 'version' ? (
                <p className="specs-feed__body">
                  <span className="specs-override-chip">Value</span> {item.body}
                </p>
              ) : (
                <p className="specs-feed__body">
                  {item.body}
                  {item.context ? (
                    <span className="specs-grid__meta"> · at this comment: {item.context}</span>
                  ) : null}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
