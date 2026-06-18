import type { DocumentConsumption } from '@arther/db';

/**
 * A.5 — the per-document consumption panel. Surfaces the portal events the C9.6
 * metering writes (views, unique anonymous visitors, downloads) for a published
 * document; identified viewers (distinct magic-link recipients) show only for a
 * gated publication, where that identity exists. Read-only and best-effort —
 * counts are SQL aggregates over the append-only events store.
 */
export function DocumentAnalytics({
  consumption,
  gated,
}: {
  consumption: DocumentConsumption;
  gated: boolean;
}) {
  const stats: Array<{ label: string; value: number }> = [
    { label: 'Views', value: consumption.views },
    { label: 'Unique visitors', value: consumption.uniqueVisitors },
    { label: 'Downloads', value: consumption.downloads },
  ];
  if (gated) {
    stats.push({ label: 'Identified viewers', value: consumption.identifiedViewers });
  }

  return (
    <section className="specs-section" aria-label="Portal analytics">
      <h2 className="specs-section__title">Portal analytics</h2>
      <dl className="specs-form" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="specs-grid__meta">{s.label}</dt>
            <dd style={{ margin: 0, fontSize: 22, fontWeight: 650 }}>{s.value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <p className="specs-grid__meta">
        Consumption on the published portal. Views count each open; unique visitors and identified
        viewers de-duplicate by anonymous session and magic-link recipient.
      </p>
    </section>
  );
}
