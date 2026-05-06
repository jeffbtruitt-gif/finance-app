/**
 * Grouped vertical bars — actual vs budget by spend group (inline SVG, DS colors).
 *
 * Palette matches DESIGN_SYSTEM_README / WaterfallChart: navy scale + semantic
 * neutrals for axes; no chart-library styling from legacy screenshots.
 */

import { type MouseEvent, useCallback, useState } from 'react';
import { ChartTooltip, type ChartTooltipAnchor } from '@/components/ChartTooltip';
import { fmtUsd } from '@/lib/money';

/** DS navy / gray hex (Tailwind theme tokens). */
const C_ACTUAL = '#243460'; // navy-700
const C_BUDGET = '#bfcae3'; // navy-200
const C_BUDGET_STROKE = '#6278b8'; // navy-400
const C_AXIS = '#e2e5ec'; // gray-200
const C_BASELINE = '#8fa1cc'; // navy-300
const C_LABEL = '#545b6e'; // gray-600
const C_TITLE = '#3a3f4d'; // gray-700

export interface SpendGroupBarDatum {
  key: string;
  /** Short label under the group (already human-readable). */
  label: string;
  actual: number;
  budget: number;
}

function niceCeiling(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const frac = max / 10 ** exp;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * 10 ** exp;
}

interface DashboardSpendGroupBarChartProps {
  data: SpendGroupBarDatum[];
  /** Shown in aria-label and optional caption context. */
  caption: string;
  className?: string;
  /** Draw `fmtUsd` above each bar (e.g. yearly detail chart). */
  showValuesAboveBars?: boolean;
}

const FONT_SANS = "'Figtree',Inter,system-ui,sans-serif";

/** Horizontal space per group (two bars + gap between them). */
const MIN_SLOT_W = 118;
/** Space between one group’s slot and the next (visual separation). */
const GAP_BETWEEN_GROUPS = 36;
/** Gap between actual and budget columns within a group. */
const PAIR_GAP = 18;

export function DashboardSpendGroupBarChart({
  data,
  caption,
  className = '',
  showValuesAboveBars = false,
}: DashboardSpendGroupBarChartProps) {
  const [tip, setTip] = useState<{
    anchor: ChartTooltipAnchor;
    headline: string;
    rows: { label: string; value: string }[];
  } | null>(null);

  const moveTip = useCallback((e: MouseEvent, headline: string, rows: { label: string; value: string }[]) => {
    setTip({
      anchor: { clientX: e.clientX, clientY: e.clientY },
      headline,
      rows,
    });
  }, []);

  if (data.length === 0) {
    return (
      <div className={`py-10 text-center text-caption text-gray-500 ${className}`}>
        No spend categories in groups for this period.
      </div>
    );
  }

  const PAD_L = 52;
  const PAD_R = 16;
  const PAD_T = showValuesAboveBars ? 30 : 14;
  const PAD_B = 58;
  const LEGEND_H = 30;
  const H = 218 + LEGEND_H;

  const n = Math.max(data.length, 1);
  const innerPlotW = n * MIN_SLOT_W + Math.max(0, n - 1) * GAP_BETWEEN_GROUPS;
  const W = PAD_L + innerPlotW + PAD_R;

  const barW = (MIN_SLOT_W - PAIR_GAP) / 2;

  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.actual, d.budget]),
  );
  const yMax = niceCeiling(maxVal * 1.05);
  const plotH = H - PAD_T - PAD_B - LEGEND_H;
  const baselineY = PAD_T + plotH;

  const yToPx = (v: number) => baselineY - (v / yMax) * plotH;

  const ticks = Array.from(new Set([0, yMax / 2, yMax]))
    .filter((t) => t >= 0)
    .sort((a, b) => b - a);

  return (
    <div className={`relative ${className}`}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${caption}: actual versus budget by spend group`}
        className="max-w-full select-none"
      >
        {/* Y-axis baseline */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={baselineY}
          y2={baselineY}
          stroke={C_BASELINE}
          strokeWidth={1.5}
        />

        {/* Grid / tick marks */}
        {ticks.map((tv) => {
          const y = yToPx(tv);
          const isBaseline = Math.abs(y - baselineY) < 0.5;
          return (
            <g key={tv}>
              {!isBaseline ? (
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={y}
                  y2={y}
                  stroke={C_AXIS}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  opacity={0.85}
                />
              ) : null}
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fontWeight={500}
                fill={C_LABEL}
                style={{ fontFamily: FONT_SANS }}
              >
                {fmtUsd(tv)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const slotLeft = PAD_L + i * (MIN_SLOT_W + GAP_BETWEEN_GROUPS);
          const cx = slotLeft + MIN_SLOT_W / 2;
          const xActual = cx - barW - PAIR_GAP / 2;
          const xBudget = cx + PAIR_GAP / 2;
          const hA = Math.max(0, (d.actual / yMax) * plotH);
          const hB = Math.max(0, (d.budget / yMax) * plotH);
          const yA = baselineY - hA;
          const yB = baselineY - hB;
          const trunc =
            d.label.length > 18 ? `${d.label.slice(0, 16)}…` : d.label;

          const hitTop = PAD_T;
          const hitH = baselineY - hitTop + 46;

          return (
            <g key={d.key}>
              <rect
                x={slotLeft}
                y={hitTop}
                width={MIN_SLOT_W}
                height={hitH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={(e) =>
                  moveTip(e, d.label, [
                    { label: 'Actual', value: fmtUsd(d.actual) },
                    { label: 'Budget', value: fmtUsd(d.budget) },
                  ])
                }
                onMouseMove={(e) =>
                  moveTip(e, d.label, [
                    { label: 'Actual', value: fmtUsd(d.actual) },
                    { label: 'Budget', value: fmtUsd(d.budget) },
                  ])
                }
                onMouseLeave={() => setTip(null)}
              />
              <rect
                x={xActual}
                y={yA}
                width={barW}
                height={Math.max(hA, d.actual > 0 ? 1 : 0)}
                rx={3}
                fill={C_ACTUAL}
                opacity={0.92}
                pointerEvents="none"
              />
              <rect
                x={xBudget}
                y={yB}
                width={barW}
                height={Math.max(hB, d.budget > 0 ? 1 : 0)}
                rx={3}
                fill={C_BUDGET}
                stroke={C_BUDGET_STROKE}
                strokeWidth={1}
                opacity={0.95}
                pointerEvents="none"
              />
              {showValuesAboveBars ? (
                <>
                  <text
                    x={xActual + barW / 2}
                    y={yA - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill={C_TITLE}
                    style={{ fontFamily: FONT_SANS }}
                    pointerEvents="none"
                  >
                    {fmtUsd(d.actual)}
                  </text>
                  <text
                    x={xBudget + barW / 2}
                    y={yB - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill={C_TITLE}
                    style={{ fontFamily: FONT_SANS }}
                    pointerEvents="none"
                  >
                    {fmtUsd(d.budget)}
                  </text>
                </>
              ) : null}
              <text
                x={cx}
                y={baselineY + 18}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={C_TITLE}
                style={{ fontFamily: FONT_SANS }}
                pointerEvents="none"
              >
                {trunc}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${PAD_L}, ${H - LEGEND_H + 8})`}>
          <rect x={0} y={4} width={12} height={12} rx={2} fill={C_ACTUAL} />
          <text
            x={18}
            y={14}
            fontSize={11}
            fontWeight={500}
            fill={C_LABEL}
            style={{ fontFamily: FONT_SANS }}
          >
            Actual
          </text>
          <rect
            x={78}
            y={4}
            width={12}
            height={12}
            rx={2}
            fill={C_BUDGET}
            stroke={C_BUDGET_STROKE}
            strokeWidth={1}
          />
          <text
            x={96}
            y={14}
            fontSize={11}
            fontWeight={500}
            fill={C_LABEL}
            style={{ fontFamily: FONT_SANS }}
          >
            Budget
          </text>
        </g>
      </svg>
      {tip ? <ChartTooltip anchor={tip.anchor} headline={tip.headline} rows={tip.rows} /> : null}
    </div>
  );
}
