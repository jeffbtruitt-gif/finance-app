/**
 * Equity mix donut — net worth composition by positive equity groups.
 * Inline SVG; navy / gold / semantic palette per DESIGN_SYSTEM_README charts.
 */

import { type MouseEvent, useCallback, useMemo, useState } from 'react';
import { ChartTooltip } from '@/components/ChartTooltip';
import { fmtUsd } from '@/lib/money';

const FONT_SANS = "'Figtree',Inter,system-ui,sans-serif";

/** Distinct segments within DS (navy scale, gold accent, pos, category hues). */
const SEGMENT_FILLS = [
  '#243460', // navy-700
  '#c9a84c', // gold-500
  '#6278b8', // navy-400
  '#1e7e5a', // pos
  '#3884c2', // cat-transportation
  '#e08750', // cat-restaurants
  '#8fa1cc', // navy-300
  '#3a9e6f', // cat-groceries
  '#3b559a', // navy-500
  '#7a8aa8', // cat-utilities
  '#22a39f', // cat-health
  '#c98c3b', // cat-travel
] as const;

/** Larger view for Balance Sheet report Mix tab (extra horizontal space). */
const VIEW = 440;
const CX = VIEW / 2;
const CY = VIEW / 2;
const R_OUTER = 186;
const R_INNER = 98;
const STROKE_GAP = 1.5;

export type EquityMixSlice = {
  key: string;
  label: string;
  net: number;
};

function slicePathDeg(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const a0 = toRad(startDeg);
  const a1 = toRad(endDeg);
  const xo1 = cx + rOuter * Math.cos(a0);
  const yo1 = cy + rOuter * Math.sin(a0);
  const xo2 = cx + rOuter * Math.cos(a1);
  const yo2 = cy + rOuter * Math.sin(a1);
  const xi1 = cx + rInner * Math.cos(a1);
  const yi1 = cy + rInner * Math.sin(a1);
  const xi2 = cx + rInner * Math.cos(a0);
  const yi2 = cy + rInner * Math.sin(a0);
  const sweep = endDeg - startDeg;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${xo1} ${yo1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${xo2} ${yo2} L ${xi1} ${yi1} A ${rInner} ${rInner} 0 ${largeArc} 0 ${xi2} ${yi2} Z`;
}

function pctOfNetWorth(net: number, netWorth: number): number {
  if (!Number.isFinite(netWorth) || netWorth === 0) return 0;
  return (100 * net) / netWorth;
}

export interface EquityMixDonutChartProps {
  slices: EquityMixSlice[];
  netWorth: number;
  className?: string;
}

export function EquityMixDonutChart({ slices, netWorth, className = '' }: EquityMixDonutChartProps) {
  const [hover, setHover] = useState<{
    label: string;
    net: number;
    pct: number;
    anchor: { clientX: number; clientY: number };
  } | null>(null);

  const positive = useMemo(() => {
    const rows = slices
      .filter((s) => s.net > 0)
      .sort((a, b) => b.net - a.net);
    const sum = rows.reduce((t, s) => t + s.net, 0);
    return { rows, sum };
  }, [slices]);

  const segments = useMemo(() => {
    if (positive.sum <= 0) return [];
    let angle = 0;
    return positive.rows.map((row, i) => {
      const sweep = (360 * row.net) / positive.sum;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      const mid = (start + end) / 2;
      const midRad = ((mid - 90) * Math.PI) / 180;
      const labelR = (R_INNER + R_OUTER) / 2;
      const lx = CX + labelR * Math.cos(midRad);
      const ly = CY + labelR * Math.sin(midRad);
      const pctNw = pctOfNetWorth(row.net, netWorth);
      const showLabel = sweep >= 12 && pctNw >= 2;
      return {
        ...row,
        path: slicePathDeg(CX, CY, R_INNER, R_OUTER, start, end),
        fill: SEGMENT_FILLS[i % SEGMENT_FILLS.length],
        lx,
        ly,
        sweep,
        pctNw,
        showLabel,
      };
    });
  }, [positive.rows, positive.sum, netWorth]);

  const onMove = useCallback((e: MouseEvent) => {
    setHover((h) => (h ? { ...h, anchor: { clientX: e.clientX, clientY: e.clientY } } : null));
  }, []);

  if (positive.sum <= 0 || netWorth <= 0) {
    return (
      <p className="text-sm text-gray-500">
        Add positive net equity in at least one group to see the mix chart.
      </p>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <svg
        width={VIEW}
        height={VIEW}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="mx-auto block h-auto w-full max-w-[min(440px,100%)]"
        role="img"
        aria-label={`Net worth mix across ${segments.length} equity groups`}
      >
        <title>Equity mix donut — hover segments for amounts</title>
        {segments.map((seg) => (
          <path
            key={seg.key}
            d={seg.path}
            fill={seg.fill}
            stroke="#ffffff"
            strokeWidth={STROKE_GAP}
            className="cursor-pointer transition-opacity hover:opacity-90"
            onMouseEnter={(e) =>
              setHover({
                label: seg.label,
                net: seg.net,
                pct: seg.pctNw,
                anchor: { clientX: e.clientX, clientY: e.clientY },
              })
            }
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {segments.map(
          (seg) =>
            seg.showLabel && (
              <text
                key={`lbl-${seg.key}`}
                x={seg.lx}
                y={seg.ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#ffffff"
                fontFamily={FONT_SANS}
                fontSize={12}
                fontWeight={600}
                className="pointer-events-none select-none"
                style={{ textShadow: '0 1px 2px rgba(13,21,39,0.45)' }}
              >
                <tspan x={seg.lx} dy="-0.55em">
                  {seg.label}
                </tspan>
                <tspan x={seg.lx} dy="1.1em" fontSize={11} fontWeight={500}>
                  {Math.round(seg.pctNw)}%
                </tspan>
              </text>
            ),
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="max-w-[10rem] text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Net worth
          </div>
          <div className="text-lg font-bold tabular-nums text-navy-900">{fmtUsd(netWorth)}</div>
        </div>
      </div>

      {hover ? (
        <ChartTooltip
          anchor={hover.anchor}
          headline={hover.label}
          rows={[
            { label: 'Net equity', value: fmtUsd(hover.net) },
            {
              label: 'Share of net worth',
              value: `${hover.pct.toFixed(1)}%`,
            },
          ]}
        />
      ) : null}
    </div>
  );
}
