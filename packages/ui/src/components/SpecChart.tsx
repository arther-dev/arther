/**
 * Minimal line-chart primitive for table-field data (spec §5.5 "preview
 * chart"). Pure SVG, no dependencies; the Phase 2 Chart block renders through
 * this same component so the editor preview and published output match.
 * Structural props keep @arther/ui free of @arther/types: any table-shaped
 * value (columns with roles + numeric rows) plots.
 */

export interface SpecChartColumn {
  id: string;
  name: string;
  role: 'independent' | 'dependent' | 'series';
}

export interface SpecChartProps {
  columns: SpecChartColumn[];
  rows: Array<{ id: string; values: Record<string, number | null> }>;
  /** 'step' renders staircase segments; everything else draws straight lines. */
  interpolation?: 'linear' | 'spline' | 'step' | 'none';
  width?: number;
  height?: number;
  /** Axis labels default to the mapped columns' names. */
  className?: string;
}

const PALETTE = [
  'var(--chart-1, #7aa2f7)',
  'var(--chart-2, #9ece6a)',
  'var(--chart-3, #e0af68)',
  'var(--chart-4, #f7768e)',
  'var(--chart-5, #bb9af7)',
];

interface Point {
  x: number;
  y: number;
}

function pathFor(points: Point[], step: boolean): string {
  return points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      if (!step) return `L ${p.x} ${p.y}`;
      const prev = points[i - 1]!;
      return `L ${p.x} ${prev.y} L ${p.x} ${p.y}`;
    })
    .join(' ');
}

export function SpecChart({
  columns,
  rows,
  interpolation = 'linear',
  width = 320,
  height = 180,
  className,
}: SpecChartProps) {
  const xCol = columns.find((c) => c.role === 'independent');
  const yCol = columns.find((c) => c.role === 'dependent');
  const sCol = columns.find((c) => c.role === 'series');

  const pairs = !xCol || !yCol
    ? []
    : rows
        .map((r) => ({
          x: r.values[xCol.id],
          y: r.values[yCol.id],
          s: sCol ? r.values[sCol.id] : null,
        }))
        .filter((p): p is { x: number; y: number; s: number | null } =>
          Number.isFinite(p.x) && Number.isFinite(p.y),
        );

  if (!xCol || !yCol || pairs.length < 2) {
    return (
      <p className={['ui-chart__empty', className].filter(Boolean).join(' ')}>
        Add an independent and a dependent column with at least two numeric rows to preview.
      </p>
    );
  }

  const xs = pairs.map((p) => p.x);
  const ys = pairs.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys);
  const pad = 28;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;
  const sx = (x: number) => pad + (xMax === xMin ? 0 : ((x - xMin) / (xMax - xMin)) * plotW);
  const sy = (y: number) =>
    height - pad - (yMax === yMin ? 0 : ((y - yMin) / (yMax - yMin)) * plotH);

  const seriesKeys = sCol ? [...new Set(pairs.map((p) => p.s))] : [null];
  const series = seriesKeys.map((key, i) => {
    const points = pairs
      .filter((p) => (sCol ? p.s === key : true))
      .sort((a, b) => a.x - b.x)
      .map((p) => ({ x: sx(p.x), y: sy(p.y) }));
    return { key, points, color: PALETTE[i % PALETTE.length]! };
  });

  return (
    <figure className={['ui-chart', className].filter(Boolean).join(' ')}>
      <svg
        role="img"
        aria-label={`${yCol.name} vs ${xCol.name}${sCol ? ` by ${sCol.name}` : ''}`}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
      >
        {/* axes */}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="ui-chart__axis" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="ui-chart__axis" />
        {/* min/max ticks */}
        <text x={pad} y={height - pad + 14} className="ui-chart__tick">{xMin}</text>
        <text x={width - pad} y={height - pad + 14} textAnchor="end" className="ui-chart__tick">{xMax}</text>
        <text x={pad - 4} y={height - pad} textAnchor="end" className="ui-chart__tick">{yMin}</text>
        <text x={pad - 4} y={pad + 4} textAnchor="end" className="ui-chart__tick">{yMax}</text>
        {series.map((s) => (
          <g key={String(s.key)}>
            <path
              d={pathFor(s.points, interpolation === 'step')}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
            />
            {s.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2} fill={s.color} />
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="ui-chart__caption">
        {yCol.name} vs {xCol.name}
        {sCol ? ` · ${series.length} series by ${sCol.name}` : ''}
      </figcaption>
    </figure>
  );
}
