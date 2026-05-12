/**
 * Vertical grouped-bar chart (SVG) — paired actual vs budget bars per group.
 *
 * viewBox base width = max(520, N × 130) to match MonthlyTrendBars text scale.
 * If actual > budget the actual bar turns neg-red and the group label bolds red.
 */

import { fmtUsd } from '@/lib/money';

export interface VerticalGroupedBarItem {
  key: string;
  label: string;
  actual: number;
  budget: number;
}

interface Props {
  items: VerticalGroupedBarItem[];
  height?: number;
}

const H_DEFAULT = 240;
const PAD_TOP = 32;
const PAD_BOT = 50;
const BAR_RX = 5;
const PAIR_GAP = 6;

const COLOR_ACTUAL = '#1a2744'; // navy-800
const COLOR_BUDGET = '#bfcae3'; // navy-200
const COLOR_OVER = '#c0392b'; // neg

export function VerticalGroupedBars({ items, height = H_DEFAULT }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400">
        No data
      </div>
    );
  }

  const N = items.length;
  const W = Math.max(520, N * 130);
  const slotW = W / N;
  const barW = Math.min(28, slotW * 0.26);
  const barArea = height - PAD_TOP - PAD_BOT;
  const maxVal = Math.max(...items.flatMap((i) => [i.actual, i.budget]), 1);

  const legendY = height - 10;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* baseline */}
      <line
        x1={0}
        x2={W}
        y1={PAD_TOP + barArea}
        y2={PAD_TOP + barArea}
        stroke="#e2e5ec"
        strokeWidth={0.8}
      />

      {items.map((item, i) => {
        const cx = slotW * i + slotW / 2;
        const over = item.actual > item.budget;
        const actualFill = over ? COLOR_OVER : COLOR_ACTUAL;

        const aH = (item.actual / maxVal) * barArea;
        const bH = (item.budget / maxVal) * barArea;
        const aY = PAD_TOP + barArea - aH;
        const bY = PAD_TOP + barArea - bH;

        const aX = cx - PAIR_GAP / 2 - barW;
        const bX = cx + PAIR_GAP / 2;

        return (
          <g key={item.key}>
            <title>{`${item.label}\nActual: ${fmtUsd(item.actual)}\nBudget: ${fmtUsd(item.budget)}`}</title>
            {/* invisible hit area for tooltip */}
            <rect
              x={cx - slotW / 2}
              y={0}
              width={slotW}
              height={height}
              fill="transparent"
            />
            {/* actual bar */}
            <rect
              x={aX}
              y={aY}
              width={barW}
              height={aH}
              rx={BAR_RX}
              fill={actualFill}
            />
            {/* budget bar */}
            <rect
              x={bX}
              y={bY}
              width={barW}
              height={bH}
              rx={BAR_RX}
              fill={COLOR_BUDGET}
            />
            {/* value labels above bars */}
            <text
              x={aX + barW / 2}
              y={aY - 6}
              textAnchor="middle"
              fill={over ? COLOR_OVER : '#545b6e'}
              fontSize={5.5}
              fontWeight={over ? 600 : 400}
              fontFamily="Figtree, system-ui, sans-serif"
            >
              {fmtUsd(item.actual)}
            </text>
            <text
              x={bX + barW / 2}
              y={bY - 6}
              textAnchor="middle"
              fill="#9aa0af"
              fontSize={5.5}
              fontFamily="Figtree, system-ui, sans-serif"
            >
              {fmtUsd(item.budget)}
            </text>
            {/* category label */}
            <text
              x={cx}
              y={PAD_TOP + barArea + 18}
              textAnchor="middle"
              fill={over ? COLOR_OVER : '#545b6e'}
              fontSize={6}
              fontWeight={over ? 700 : 400}
              fontFamily="Figtree, system-ui, sans-serif"
            >
              {item.label}
            </text>
          </g>
        );
      })}

      {/* legend */}
      <rect x={W / 2 - 50} y={legendY - 5} width={6} height={6} rx={1} fill={COLOR_ACTUAL} />
      <text
        x={W / 2 - 42}
        y={legendY}
        fill="#545b6e"
        fontSize={6}
        fontFamily="Figtree, system-ui, sans-serif"
      >
        Actual
      </text>
      <rect x={W / 2 + 10} y={legendY - 5} width={6} height={6} rx={1} fill={COLOR_BUDGET} />
      <text
        x={W / 2 + 18}
        y={legendY}
        fill="#545b6e"
        fontSize={6}
        fontFamily="Figtree, system-ui, sans-serif"
      >
        Budget
      </text>
    </svg>
  );
}
