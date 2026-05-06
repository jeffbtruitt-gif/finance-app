/**
 * Two tall bars — full-year yearly bucket totals (e.g. original budget vs
 * reforecast projected). Inline SVG, Truitt Finance DS colors (navy scale).
 */

import { type MouseEvent, useCallback, useState } from 'react';
import { ChartTooltip, type ChartTooltipAnchor } from '@/components/ChartTooltip';
import { fmtUsd } from '@/lib/money';

const FONT_SANS = "'Figtree',Inter,system-ui,sans-serif";
const C_AXIS = '#e2e5ec';
const C_BASELINE = '#8fa1cc';
const C_LABEL = '#545b6e';
const C_TITLE = '#3a3f4d';
const C_BAR_PRIMARY = '#243460'; // navy-700
const C_BAR_SECONDARY = '#3b559a'; // navy-500

function niceCeiling(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const frac = max / 10 ** exp;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * 10 ** exp;
}

export interface YearlyTwoBarDatum {
  key: string;
  label: string;
  value: number;
}

interface DashboardYearlyTwoBarChartProps {
  bars: [YearlyTwoBarDatum, YearlyTwoBarDatum];
  caption: string;
  className?: string;
}

export function DashboardYearlyTwoBarChart({
  bars,
  caption,
  className = '',
}: DashboardYearlyTwoBarChartProps) {
  const [tip, setTip] = useState<{
    anchor: ChartTooltipAnchor;
    headline: string;
    rows: { label: string; value: string }[];
  } | null>(null);

  const showTip = useCallback((e: MouseEvent, headline: string, value: number) => {
    setTip({
      anchor: { clientX: e.clientX, clientY: e.clientY },
      headline,
      rows: [{ label: 'Amount', value: fmtUsd(value) }],
    });
  }, []);

  const PAD_L = 56;
  const PAD_R = 20;
  const PAD_T = 30;
  const PAD_B = 56;
  const H = 232;
  /** Wider plot + gutter between the two metrics. */
  const W = 560;
  const INNER_GUTTER = 64;

  const maxVal = Math.max(1, bars[0].value, bars[1].value);
  const yMax = niceCeiling(maxVal * 1.06);
  const plotH = H - PAD_T - PAD_B;
  const baselineY = PAD_T + plotH;

  const yToPx = (v: number) => baselineY - (v / yMax) * plotH;

  const ticks = Array.from(new Set([0, yMax / 2, yMax]))
    .filter((t) => t >= 0)
    .sort((a, b) => b - a);

  const plotInnerW = W - PAD_L - PAD_R;
  const slotW = (plotInnerW - INNER_GUTTER) / 2;
  const barW = Math.min(128, slotW * 0.62);
  const fills = [C_BAR_PRIMARY, C_BAR_SECONDARY];

  const slotCenters = [
    PAD_L + slotW / 2,
    PAD_L + slotW + INNER_GUTTER + slotW / 2,
  ];

  return (
    <div className={`relative ${className}`}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={caption}
        className="max-w-full select-none"
      >
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={baselineY}
          y2={baselineY}
          stroke={C_BASELINE}
          strokeWidth={1.5}
        />

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
                x={PAD_L - 10}
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

        {bars.map((b, i) => {
          const cx = slotCenters[i]!;
          const x = cx - barW / 2;
          const h = Math.max(0, (b.value / yMax) * plotH);
          const y = baselineY - h;
          const trunc =
            b.label.length > 24 ? `${b.label.slice(0, 22)}…` : b.label;

          const slotLeft = i === 0 ? PAD_L : PAD_L + slotW + INNER_GUTTER;
          const hitTop = PAD_T;
          const hitH = baselineY - hitTop + 44;

          return (
            <g key={b.key}>
              <rect
                x={slotLeft}
                y={hitTop}
                width={slotW}
                height={hitH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={(e) => showTip(e, b.label, b.value)}
                onMouseMove={(e) => showTip(e, b.label, b.value)}
                onMouseLeave={() => setTip(null)}
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, b.value > 0 ? 1 : 0)}
                rx={4}
                fill={fills[i] ?? C_BAR_PRIMARY}
                opacity={0.92}
                pointerEvents="none"
              />
              <text
                x={cx}
                y={y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={C_TITLE}
                style={{ fontFamily: FONT_SANS }}
                pointerEvents="none"
              >
                {fmtUsd(b.value)}
              </text>
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
      </svg>
      {tip ? <ChartTooltip anchor={tip.anchor} headline={tip.headline} rows={tip.rows} /> : null}
    </div>
  );
}
