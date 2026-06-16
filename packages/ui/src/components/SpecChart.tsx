/**
 * Minimal chart primitive for table-field data (spec §5.5 "preview chart"). Pure
 * SVG, no dependencies; the Phase 2 Chart block renders through this same
 * component so the editor preview and published output match. Structural props
 * keep @arther/ui free of @arther/types: any table-shaped value (columns with
 * roles + numeric rows) plots. Supports the Chart block's configuration —
 * line / scatter / bar, axis-label overrides, legend, and a grid.
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
  /** Plot style (Chart block `chart_type`). Defaults to a line chart. */
  chartType?: 'line' | 'scatter' | 'bar';
  /** Axis-title overrides; default to the mapped columns' names. */
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** Show a series legend (only meaningful with a series column). */
  showLegend?: boolean;
  /** Draw light min/mid/max gridlines behind the data. */
  showGrid?: boolean;
  width?: number;
  height?: number;
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
  chartType = 'line',
  xAxisLabel,
  yAxisLabel,
  showLegend = false,
  showGrid = false,
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

  const xLabel = xAxisLabel || xCol.name;
  const yLabel = yAxisLabel || yCol.name;

  const xs = pairs.map((p) => p.x);
  const ys = pairs.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys);
  // Asymmetric padding leaves room for the y-axis title (left) + x-axis title (bottom).
  const padL = 38;
  const padR = 12;
  const padT = 12;
  const padB = 36;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const sx = (x: number) => padL + (xMax === xMin ? 0 : ((x - xMin) / (xMax - xMin)) * plotW);
  const sy = (y: number) => height - padB - (yMax === yMin ? 0 : ((y - yMin) / (yMax - yMin)) * plotH);
  const yMid = (yMin + yMax) / 2;
  const xMid = (xMin + xMax) / 2;
  const baseline = sy(0);
  const barW = Math.max(2, (plotW / pairs.length) * 0.6);

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
        aria-label={`${yLabel} vs ${xLabel}${sCol ? ` by ${sCol.name}` : ''}`}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
      >
        {showGrid ? (
          <g className="ui-chart__grid">
            {[yMin, yMid, yMax].map((y) => (
              <line key={`h${y}`} x1={padL} y1={sy(y)} x2={width - padR} y2={sy(y)} />
            ))}
            {[xMin, xMid, xMax].map((x) => (
              <line key={`v${x}`} x1={sx(x)} y1={padT} x2={sx(x)} y2={height - padB} />
            ))}
          </g>
        ) : null}

        {/* axes */}
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} className="ui-chart__axis" />
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} className="ui-chart__axis" />

        {/* min/max ticks */}
        <text x={padL} y={height - padB + 14} className="ui-chart__tick">{xMin}</text>
        <text x={width - padR} y={height - padB + 14} textAnchor="end" className="ui-chart__tick">{xMax}</text>
        <text x={padL - 4} y={height - padB} textAnchor="end" className="ui-chart__tick">{yMin}</text>
        <text x={padL - 4} y={padT + 4} textAnchor="end" className="ui-chart__tick">{yMax}</text>

        {/* axis titles */}
        <text x={padL + plotW / 2} y={height - 2} textAnchor="middle" className="ui-chart__axis-label">
          {xLabel}
        </text>
        <text
          x={10}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 10 ${padT + plotH / 2})`}
          className="ui-chart__axis-label"
        >
          {yLabel}
        </text>

        {series.map((s) => (
          <g key={String(s.key)}>
            {chartType === 'bar'
              ? s.points.map((p, i) => (
                  <rect
                    key={i}
                    x={p.x - barW / 2}
                    y={Math.min(p.y, baseline)}
                    width={barW}
                    height={Math.abs(p.y - baseline)}
                    fill={s.color}
                  />
                ))
              : null}
            {chartType === 'line' ? (
              <path d={pathFor(s.points, interpolation === 'step')} fill="none" stroke={s.color} strokeWidth={1.5} />
            ) : null}
            {chartType !== 'bar'
              ? s.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2} fill={s.color} />)
              : null}
          </g>
        ))}
      </svg>

      {showLegend && sCol && series.length > 0 ? (
        <ul className="ui-chart__legend">
          {series.map((s) => (
            <li key={String(s.key)}>
              <span className="ui-chart__swatch" style={{ background: s.color }} aria-hidden="true" />
              {String(s.key)}
            </li>
          ))}
        </ul>
      ) : null}

      <figcaption className="ui-chart__caption">
        {yLabel} vs {xLabel}
        {sCol ? ` · ${series.length} series by ${sCol.name}` : ''}
      </figcaption>
    </figure>
  );
}
