/**
 * LineChart — Phase 7.
 *
 * Inline-SVG single-series line chart with optional shaded "below zero"
 * region. Used by the College page to show one kid's balance trajectory.
 *
 * Same SVG-only philosophy as Sparkline / WaterfallChart / FanChart.
 * Sparkline is for inline strips next to a number; LineChart is for
 * a labeled standalone chart with axes.
 *
 * Visual format matches the design system trend charts (dashboard net worth):
 * navy stroke, gradient fill under the line, horizontal grid only, DS type
 * for titles when using title + subtitle.
 */

import { useId } from 'react';
import { fmtUsd } from '@/lib/money';

export interface LineChartPoint {
  x: number; // typically year
  y: number; // balance
}

interface LineChartProps {
  points: LineChartPoint[];
  /**
   * Primary heading — use with `subtitle` for the standard DS block
   * (`text-label` uppercase + `text-caption`), same family as Net Worth trend.
   */
  title?: string;
  /** Secondary line under `title`. */
  subtitle?: string;
  /** Single heading (legacy). Prefer `title` + `subtitle`. */
  caption?: string;
  /** Color of the line. Defaults to navy-700 (design system). */
  color?: string;
  /** Color of the "below zero" shaded fill. Defaults to neg-soft. */
  belowZeroColor?: string;
  /** Gradient fill under the line (dashboard / Sparkline pattern). Default true. */
  area?: boolean;
  /** Width in viewBox units. */
  width?: number;
  /** Height in viewBox units. */
  height?: number;
  className?: string;
  /** When set, x-axis tick labels use this instead of the raw x number
   *  (useful for ordinal months: x = 0..n-1, label = "Apr 2026"). */
  formatX?: (x: number) => string;
}

const PAD_LEFT = 60;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

export function LineChart({
  points,
  title,
  subtitle,
  caption,
  color = '#243460',
  belowZeroColor = '#fbeae7',
  area = true,
  width = 640,
  height = 220,
  className,
  formatX,
}: LineChartProps) {
  const gradId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const innerW = width - PAD_LEFT - PAD_RIGHT;
  const innerH = height - PAD_TOP - PAD_BOTTOM;

  const header =
    title != null && title !== '' ? (
      <div className="mb-3">
        <div className="text-label uppercase text-gray-500">{title}</div>
        {subtitle != null && subtitle !== '' && (
          <div className="mt-0.5 text-caption text-gray-500">{subtitle}</div>
        )}
      </div>
    ) : caption ? (
      <div className="mb-3 text-h4 text-navy-800">{caption}</div>
    ) : null;

  if (points.length === 0) {
    return (
      <div className={className}>
        {header}
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">
          No data.
        </div>
      </div>
    );
  }

  let yMin = 0;
  let yMax = 0;
  for (const p of points) {
    if (p.y > yMax) yMax = p.y;
    if (p.y < yMin) yMin = p.y;
  }
  // Always include 0 in range. Symmetrize a bit if there's a negative tail.
  if (yMax === yMin) yMax = yMin + 1;
  const niceMax = niceCeil(Math.max(1, yMax));
  const niceMin = yMin < 0 ? -niceCeil(-yMin) : 0;
  const yRange = niceMax - niceMin;

  const xStart = points[0].x;
  const xEnd = points[points.length - 1].x;
  const xRange = Math.max(1, xEnd - xStart);

  const xToPx = (x: number) => PAD_LEFT + ((x - xStart) / xRange) * innerW;
  const yToPx = (y: number) =>
    PAD_TOP + ((niceMax - y) / yRange) * innerH;

  const ticks = 4;
  const tickValues = Array.from(
    { length: ticks + 1 },
    (_, i) => niceMax - (yRange * i) / ticks,
  );

  const linePath = points
    .map((p, i) => {
      const x = xToPx(p.x);
      const y = yToPx(p.y);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const firstX = xToPx(points[0].x);
  const lastX = xToPx(points[points.length - 1].x);
  const bottomY = PAD_TOP + innerH;
  const areaPath = `${linePath} L ${lastX.toFixed(1)},${bottomY} L ${firstX.toFixed(1)},${bottomY} Z`;

  const zeroY = yToPx(0);

  return (
    <div className={className}>
      {header}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        className="font-sans"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Below-zero shaded band — visually telegraphs shortfall */}
        {niceMin < 0 && (
          <rect
            x={PAD_LEFT}
            y={zeroY}
            width={innerW}
            height={Math.max(0, PAD_TOP + innerH - zeroY)}
            fill={belowZeroColor}
            opacity={0.4}
          />
        )}

        {tickValues.map((tv, i) => {
          const y = yToPx(tv);
          return (
            <g key={`t-${i}`}>
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

        {/* Zero line emphasized */}
        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT + innerW}
          y1={zeroY}
          y2={zeroY}
          stroke="#9aa0af"
          strokeWidth={1}
        />

        {/* X labels: every couple years */}
        {xTicks(xStart, xEnd, 6).map((xv, i) => {
          const x = xToPx(xv);
          const label = formatX ? formatX(xv) : String(xv);
          return (
            <text
              key={`xt-${i}`}
              x={x}
              y={PAD_TOP + innerH + 14}
              fontSize={10}
              textAnchor="middle"
              fill="#717889"
            >
              {label}
            </text>
          );
        })}

        {area && (
          <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        )}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Final value label */}
        {(() => {
          const last = points[points.length - 1];
          const x = xToPx(last.x);
          const y = yToPx(last.y);
          return (
            <g>
              <circle cx={x} cy={y} r={3} fill={color} />
              <text
                x={x - 4}
                y={y - 6}
                fontSize={10}
                textAnchor="end"
                fill="#0d1527"
                fontWeight={600}
              >
                {fmtUsd(last.y)}
              </text>
            </g>
          );
        })()}
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

function xTicks(start: number, end: number, count: number): number[] {
  const span = end - start;
  if (span <= 0) return [start];
  const step = Math.max(1, Math.round(span / count));
  const out: number[] = [];
  for (let y = start; y <= end; y += step) out.push(y);
  if (out[out.length - 1] !== end) out.push(end);
  return out;
}
