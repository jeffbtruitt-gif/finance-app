/**
 * WaterfallChart — Phase 6.
 *
 * Inline-SVG waterfall chart. Same lightweight philosophy as Sparkline:
 * Phase 7's retire fan chart is when we earn the right to bring in
 * Highcharts; for one 5-bar chart on the Assumptions page, ~150 lines of
 * SVG is dramatically cheaper than a chart-lib dep + theme setup.
 *
 * Conventions (matches the Main Detail tab in the spreadsheet):
 *   - Income     — green positive bar starting at 0.
 *   - Tax        — red negative bar dropping from Income's top.
 *   - Expenses   — red negative bar from Tax's bottom.
 *   - Savings    — red negative bar from Expenses' bottom.
 *   - Left Over  — final running total: green if positive, amber if negative.
 *
 * Bars are sized proportionally to the absolute value of their delta.
 * Connector lines run between bars at the running total.
 */

import { fmtUsd } from '@/lib/money';
import type { Waterfall } from '@/features/assumptions/rollup';

const BAR_W = 80;
const BAR_GAP = 32;
const PAD_X = 40;
const PAD_TOP = 28;
const PAD_BOTTOM = 36;
const CHART_H = 220;

interface WaterfallChartProps {
  waterfall: Waterfall;
  /** Optional caption shown above the chart. */
  caption?: string;
  /** Optional className passed to the wrapping <div>. */
  className?: string;
}

export function WaterfallChart({ waterfall, caption, className }: WaterfallChartProps) {
  const { steps } = waterfall;
  const n = steps.length;
  const innerW = n * BAR_W + (n - 1) * BAR_GAP;
  const totalW = innerW + PAD_X * 2;
  const totalH = CHART_H + PAD_TOP + PAD_BOTTOM;

  // Pick a vertical scale based on the highest running total (income) and the
  // most negative point (left-over if loss). Floor at small positive number to
  // avoid /0 for an empty waterfall.
  let yMax = 0;
  let yMin = 0;
  for (const s of steps) {
    yMax = Math.max(yMax, s.total, s.delta > 0 ? s.delta : 0);
    yMin = Math.min(yMin, s.total);
  }
  // Always include 0 in the visible range.
  yMin = Math.min(yMin, 0);
  if (yMax === 0 && yMin === 0) yMax = 1; // empty data — render flat zero line.

  const range = yMax - yMin;
  const yToPx = (y: number) => PAD_TOP + ((yMax - y) / range) * CHART_H;
  const zeroY = yToPx(0);

  // Pre-compute each bar's x, top, bottom, fill color.
  const bars = steps.map((s, i) => {
    const x = PAD_X + i * (BAR_W + BAR_GAP);
    const isFinal = i === steps.length - 1;
    let top: number;
    let bottom: number;

    if (i === 0) {
      // Income: start from 0, go up by delta (delta is positive).
      top = yToPx(s.total);
      bottom = zeroY;
    } else if (isFinal) {
      // Left Over: a "total bar" from 0 to the running total.
      top = yToPx(Math.max(0, s.total));
      bottom = yToPx(Math.min(0, s.total));
    } else {
      // Step: starts at previous total, ends at this total.
      const prevTotal = steps[i - 1].total;
      top = yToPx(Math.max(prevTotal, s.total));
      bottom = yToPx(Math.min(prevTotal, s.total));
    }

    // Design-system semantic palette: pos for income/positive total,
    // neg for outflows, warn for negative totals (deficit).
    let fill: string;
    if (i === 0) {
      fill = '#1e7e5a'; // pos — income
    } else if (isFinal) {
      fill = s.total >= 0 ? '#1e7e5a' : '#d97706'; // pos / warn
    } else {
      fill = '#c0392b'; // neg — outflows
    }

    return { x, top, bottom, fill, step: s, isFinal };
  });

  return (
    <div className={className}>
      {caption && (
        <div className="mb-2 text-h4 text-navy-800">{caption}</div>
      )}
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width="100%"
        height={totalH}
        role="img"
        aria-label="Income to Left Over waterfall chart"
      >
        {/* Zero baseline */}
        <line
          x1={PAD_X - 4}
          x2={PAD_X + innerW + 4}
          y1={zeroY}
          y2={zeroY}
          stroke="#bfcae3"
          strokeWidth={1}
        />

        {/* Connector lines between adjacent bar tops/bottoms */}
        {bars.slice(0, -1).map((b, i) => {
          const next = bars[i + 1];
          // The connector runs at the running total *after* this step,
          // which is the "ending side" of THIS bar — for an outflow that's
          // the bottom; for income (i=0) that's the top. Use yToPx(step.total)
          // directly to avoid case branching.
          const y = yToPx(b.step.total);
          return (
            <line
              key={`c-${i}`}
              x1={b.x + BAR_W}
              x2={next.x}
              y1={y}
              y2={y}
              stroke="#9aa0af"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}

        {/* Bars */}
        {bars.map((b, i) => (
          <g key={`b-${i}`}>
            <rect
              x={b.x}
              y={b.top}
              width={BAR_W}
              height={Math.max(1, b.bottom - b.top)}
              fill={b.fill}
              opacity={b.isFinal ? 0.9 : 0.85}
            />
            {/* Value label above (for positive values) or below (for negative) the bar */}
            <text
              x={b.x + BAR_W / 2}
              y={b.top - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#0d1527"
            >
              {fmtUsd(Math.abs(b.step.delta || b.step.total))}
            </text>
            {/* Step label below */}
            <text
              x={b.x + BAR_W / 2}
              y={totalH - 12}
              textAnchor="middle"
              fontSize={11}
              fontWeight={500}
              fill="#545b6e"
            >
              {b.step.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
