/**
 * DonutChart — SVG donut with inline % labels and a center stack.
 *
 * 5-slice BS allocation chart or any generic donut. White 2px stroke
 * between slices. Inline % labels on slices >= 26° sweep.
 */

import { fmtPct, fmtUsd } from '@/lib/money';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface Props {
  items: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}

const DEG_THRESHOLD = 26;

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function DonutChart({
  items,
  size = 220,
  centerLabel,
  centerValue,
}: Props) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-gray-400"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  const rOuter = size / 2 - 6;
  const rInner = size * 0.32;
  const cx = size / 2;
  const cy = size / 2;

  let cursor = 0;
  const slices = items.map((item) => {
    const pct = item.value / total;
    const sweep = pct * 360;
    const startAngle = cursor;
    cursor += sweep;
    return { ...item, pct, sweep, startAngle, endAngle: cursor };
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
    >
      {slices.map((s) => {
        const largeArc = s.sweep > 180 ? 1 : 0;
        const outerStart = polarToXY(cx, cy, rOuter, s.startAngle);
        const outerEnd = polarToXY(cx, cy, rOuter, s.endAngle);
        const innerEnd = polarToXY(cx, cy, rInner, s.endAngle);
        const innerStart = polarToXY(cx, cy, rInner, s.startAngle);

        const d = [
          `M ${outerStart.x} ${outerStart.y}`,
          `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
          `L ${innerEnd.x} ${innerEnd.y}`,
          `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
          'Z',
        ].join(' ');

        const midAngle = s.startAngle + s.sweep / 2;
        const labelR = (rOuter + rInner) / 2;
        const labelPt = polarToXY(cx, cy, labelR, midAngle);

        return (
          <g key={s.key}>
            <title>{`${s.label}: ${fmtUsd(s.value)} (${fmtPct(s.pct * 100, { decimals: 1 })})`}</title>
            <path d={d} fill={s.color} stroke="white" strokeWidth={2} />
            {s.sweep >= DEG_THRESHOLD && (
              <text
                x={labelPt.x}
                y={labelPt.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize={11}
                fontWeight={600}
                fontFamily="Figtree, system-ui, sans-serif"
              >
                {fmtPct(s.pct * 100, { decimals: 0 })}
              </text>
            )}
          </g>
        );
      })}

      {/* center text */}
      {centerLabel && (
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#717889"
          fontSize={11}
          fontFamily="Figtree, system-ui, sans-serif"
        >
          {centerLabel}
        </text>
      )}
      {centerValue && (
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#0d1527"
          fontSize={18}
          fontWeight={700}
          fontFamily="'Space Grotesk', system-ui, sans-serif"
          className="tabular-nums"
        >
          {centerValue}
        </text>
      )}
    </svg>
  );
}
