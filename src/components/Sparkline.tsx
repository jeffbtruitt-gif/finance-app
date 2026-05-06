/**
 * Lightweight inline-SVG line chart. No external deps.
 *
 * Master plan calls for Highcharts, but adding it for a single 24-point net
 * worth line on the dashboard is overkill. When Phase 7 needs proper charts
 * (multi-rate retirement fan, per-kid college trajectories) we'll bring
 * Highcharts in. For now this gets us the visual without the bundle weight.
 *
 * Renders a smooth-ish line through the supplied points with optional
 * value labels at the endpoints. Auto-scales to the data range; if all
 * values are zero (e.g. no data yet), renders a flat baseline so the chart
 * doesn't collapse.
 */

import { fmtUsd } from '@/lib/money';

export interface SparklinePoint {
  /** X label, e.g. 'Apr 2026'. */
  label: string;
  value: number;
}

interface SparklineProps {
  points: SparklinePoint[];
  height?: number;
  width?: number;
  /** Stroke + fill base color. Defaults to navy-700 (design system). */
  color?: string;
  /** Show $-formatted values at the start/end of the line. */
  showEndpointLabels?: boolean;
  /** Show subtle area fill under the line. */
  area?: boolean;
}

export function Sparkline({
  points,
  height = 80,
  width = 320,
  color = '#243460',
  showEndpointLabels = true,
  area = true,
}: SparklineProps) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-gray-400"
        style={{ height, width }}
      >
        No data
      </div>
    );
  }

  const padX = 4;
  const padY = 12;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // If completely flat, give it a tiny range so the line lands mid-height
  // instead of on the top edge.
  const range = max - min || Math.max(Math.abs(max), 1);

  const xy = points.map((p, i) => {
    const x =
      points.length === 1 ? padX + innerW / 2 : padX + (i / (points.length - 1)) * innerW;
    const y = padY + innerH - ((p.value - min) / range) * innerH;
    return { x, y, p };
  });

  const linePath = xy
    .map((pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`))
    .join(' ');

  const areaPath = `${linePath} L ${xy[xy.length - 1].x} ${padY + innerH} L ${xy[0].x} ${padY + innerH} Z`;

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="relative" style={{ width }}>
      <svg width={width} height={height} className="block">
        {area && <path d={areaPath} fill={color} fillOpacity={0.08} />}
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
        {/* End cap dot to anchor the eye on "now". */}
        <circle
          cx={xy[xy.length - 1].x}
          cy={xy[xy.length - 1].y}
          r={2.5}
          fill={color}
        />
      </svg>
      {showEndpointLabels && (
        <div className="mt-1 flex justify-between text-[11px] text-gray-500">
          <span>
            {first.label}
            <span className="ml-1 tabular-nums">{fmtUsd(first.value)}</span>
          </span>
          <span>
            {last.label}
            <span className="ml-1 tabular-nums text-navy-800">{fmtUsd(last.value)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
