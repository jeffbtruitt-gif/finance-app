/**
 * FanChart — Phase 7.
 *
 * Inline-SVG multi-rate line chart. Renders one polyline per rate with a
 * legend on the right. Used by the Retire page to show 6 trajectories
 * (2/4/6/8/10/12%).
 *
 * Same lightweight philosophy as Sparkline (Phase 5) and WaterfallChart
 * (Phase 6): for a single chart on a single page, ~150 lines of SVG is
 * dramatically cheaper than Highcharts. We'll bring Highcharts in if we
 * grow to 3+ chart types or need interactive tooltips. For now: hover a
 * line to see its rate via a native title; values appear in the legend
 * with the end balance.
 */

import { fmtUsd } from '@/lib/money';
import type { FanChartSeries } from '@/features/retire/fanChart';

interface FanChartProps {
  series: FanChartSeries;
  /** Optional caption shown above the chart. */
  caption?: string;
  /** Extra className passed to wrapping div. */
  className?: string;
  /** Width of the chart area in viewBox units. Default 720. */
  width?: number;
  /** Height of the chart area in viewBox units. Default 280. */
  height?: number;
}

const PAD_LEFT = 60;
const PAD_RIGHT = 140;
const PAD_TOP = 24;
const PAD_BOTTOM = 36;

// Design-system palette: cool → warm progression so the high-growth lines
// stand out warm-and-bright against the conservative navy lines.
const RATE_COLORS = [
  '#8fa1cc', // navy-300   — 2%
  '#3b559a', // navy-500   — 4%
  '#243460', // navy-700   — 6%
  '#1e7e5a', // pos        — 8%
  '#c9a84c', // gold-500   — 10%
  '#a07830', // gold-600   — 12%
];

export function FanChart({
  series,
  caption,
  className,
  width = 720,
  height = 280,
}: FanChartProps) {
  const { rates, points } = series;
  const innerW = width - PAD_LEFT - PAD_RIGHT;
  const innerH = height - PAD_TOP - PAD_BOTTOM;

  if (points.length === 0) {
    return (
      <div className={className}>
        {caption && (
          <div className="mb-2 text-h4 text-navy-800">{caption}</div>
        )}
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">
          No projection data.
        </div>
      </div>
    );
  }

  // Y range: 0 to max across all rates and points.
  let yMax = 0;
  for (const p of points) {
    for (const v of p.byRate.values()) {
      if (v > yMax) yMax = v;
    }
  }
  if (yMax === 0) yMax = 1;
  // Round yMax up to a "nice" tick.
  const niceMax = niceCeil(yMax);

  const xStart = points[0].year;
  const xEnd = points[points.length - 1].year;
  const xRange = Math.max(1, xEnd - xStart);

  const xToPx = (year: number) =>
    PAD_LEFT + ((year - xStart) / xRange) * innerW;
  const yToPx = (val: number) =>
    PAD_TOP + (1 - val / niceMax) * innerH;

  // 5 horizontal grid lines.
  const ticks = 5;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => (niceMax * i) / ticks);

  return (
    <div className={className}>
      {caption && (
        <div className="mb-2 text-h4 text-navy-800">{caption}</div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Multi-rate retirement balance projection"
      >
        {/* Y-axis grid + labels */}
        {tickValues.map((tv, i) => {
          const y = yToPx(tv);
          return (
            <g key={`tick-${i}`}>
              <line
                x1={PAD_LEFT}
                x2={PAD_LEFT + innerW}
                y1={y}
                y2={y}
                stroke="#e8ecf5"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 6}
                y={y + 3}
                fontSize={10}
                textAnchor="end"
                fill="#717889"
              >
                {compactDollar(tv)}
              </text>
            </g>
          );
        })}

        {/* X axis baseline (above x labels) */}
        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT + innerW}
          y1={PAD_TOP + innerH}
          y2={PAD_TOP + innerH}
          stroke="#bfcae3"
          strokeWidth={1}
        />

        {/* X labels: ~6 evenly-spaced years */}
        {xTickYears(xStart, xEnd, 6).map((year, i) => {
          const x = xToPx(year);
          return (
            <text
              key={`xt-${i}`}
              x={x}
              y={PAD_TOP + innerH + 14}
              fontSize={10}
              textAnchor="middle"
              fill="#717889"
            >
              {year}
            </text>
          );
        })}

        {/* One polyline per rate */}
        {rates.map((rate, ri) => {
          const color = RATE_COLORS[ri % RATE_COLORS.length];
          const d = points
            .map((p, i) => {
              const v = p.byRate.get(rate) ?? 0;
              const x = xToPx(p.year);
              const y = yToPx(v);
              return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <path
              key={`line-${rate}`}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={2}
            >
              <title>{`${(rate * 100).toFixed(0)}% growth`}</title>
            </path>
          );
        })}

        {/* Legend on the right */}
        {rates.map((rate, ri) => {
          const color = RATE_COLORS[ri % RATE_COLORS.length];
          const lastPoint = points[points.length - 1];
          const lastValue = lastPoint?.byRate.get(rate) ?? 0;
          const y = PAD_TOP + 8 + ri * 18;
          const x = PAD_LEFT + innerW + 12;
          return (
            <g key={`leg-${rate}`}>
              <rect x={x} y={y - 8} width={10} height={3} fill={color} />
              <text x={x + 16} y={y - 2} fontSize={10} fill="#0d1527" fontWeight={600}>
                {(rate * 100).toFixed(0)}%
              </text>
              <text
                x={x + 46}
                y={y - 2}
                fontSize={10}
                fill="#545b6e"
              >
                {fmtUsd(lastValue)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const scaled = v / base;
  let nice: number;
  if (scaled <= 1) nice = 1;
  else if (scaled <= 2) nice = 2;
  else if (scaled <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function compactDollar(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function xTickYears(start: number, end: number, count: number): number[] {
  const span = end - start;
  if (span <= 0) return [start];
  const step = Math.max(1, Math.round(span / count));
  const out: number[] = [];
  for (let y = start; y <= end; y += step) out.push(y);
  if (out[out.length - 1] !== end) out.push(end);
  return out;
}
