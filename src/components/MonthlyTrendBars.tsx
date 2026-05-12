/**
 * Monthly trend vertical bar chart (SVG).
 *
 * Used for 6-month spend trend and the yearly budget-vs-reforecast two-bar view.
 * Current bar is navy-800; non-current bars are navy-200.
 * viewBox width uses 520 baseline so text scales consistently with VerticalGroupedBars.
 */

import { fmtUsd } from '@/lib/money';

export interface MonthlyTrendBarItem {
  key: string;
  label: string;
  value: number;
  current?: boolean;
  color?: string;
  subLabel?: string;
}

interface Props {
  items: MonthlyTrendBarItem[];
  height?: number;
}

const H_DEFAULT = 220;
const PAD_TOP = 32;
const PAD_BOT = 36;
const BAR_RX = 6;

const COLOR_DEFAULT = '#bfcae3'; // navy-200
const COLOR_CURRENT = '#1a2744'; // navy-800

export function MonthlyTrendBars({ items, height = H_DEFAULT }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400">
        No data
      </div>
    );
  }

  const N = items.length;
  const W = Math.max(520, N * 70);
  const slotW = W / N;
  const barW = Math.min(56, slotW * 0.62);
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const barArea = height - PAD_TOP - PAD_BOT;

  // Two dashed gridlines at 1/3 and 2/3 of max
  const gridYs = [1 / 3, 2 / 3].map(
    (f) => PAD_TOP + barArea * (1 - f),
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* gridlines */}
      {gridYs.map((gy) => (
        <line
          key={gy}
          x1={0}
          x2={W}
          y1={gy}
          y2={gy}
          stroke="#e2e5ec"
          strokeWidth={0.8}
          strokeDasharray="4 3"
        />
      ))}
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
        const barH = (item.value / maxVal) * barArea;
        const barY = PAD_TOP + barArea - barH;
        const fill = item.color ?? (item.current ? COLOR_CURRENT : COLOR_DEFAULT);
        const labelBold = !!item.current;

        return (
          <g key={item.key}>
            <title>{`${item.label}: ${fmtUsd(item.value)}`}</title>
            {/* invisible hit area for tooltip */}
            <rect
              x={cx - slotW / 2}
              y={0}
              width={slotW}
              height={height}
              fill="transparent"
            />
            <rect
              x={cx - barW / 2}
              y={barY}
              width={barW}
              height={barH}
              rx={BAR_RX}
              fill={fill}
            />
            {/* value above bar */}
            <text
              x={cx}
              y={barY - 8}
              textAnchor="middle"
              fill="#717889"
              fontSize={5.5}
              fontFamily="Figtree, system-ui, sans-serif"
            >
              {fmtUsd(item.value)}
            </text>
            {/* month label below baseline */}
            <text
              x={cx}
              y={PAD_TOP + barArea + 18}
              textAnchor="middle"
              fill={labelBold ? COLOR_CURRENT : '#717889'}
              fontSize={6}
              fontWeight={labelBold ? 700 : 400}
              fontFamily="Figtree, system-ui, sans-serif"
            >
              {item.label}
            </text>
            {item.subLabel && (
              <text
                x={cx}
                y={PAD_TOP + barArea + 32}
                textAnchor="middle"
                fill="#9aa0af"
                fontSize={5}
                fontFamily="Figtree, system-ui, sans-serif"
              >
                {item.subLabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
