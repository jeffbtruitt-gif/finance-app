/**
 * Sparkline (Highcharts) — small inline line chart for table rows and KPI
 * strips. No axes; hover shows the label and value. Optional endpoint labels
 * render below the chart.
 */

import { useMemo } from 'react';
import { HChart, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';
import { sparklineBase } from '@/lib/sparklineBase';

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
  const options = useMemo<Highcharts.Options>(() => {
    const base = sparklineBase(width, height);
    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        formatter() {
          const p = points[Number(this.index)];
          return p ? tipHtml(p.label, [{ label: 'Value', value: fmtUsd(p.value), color }]) : '';
        },
      },
      series: [
        {
          type: area ? 'area' : 'line',
          color,
          fillOpacity: 0.08,
          lineWidth: 1.5,
          threshold: null,
          data: points.map((p, i) =>
            i === points.length - 1 ? { y: p.value, marker: { enabled: true, radius: 2.5 } } : p.value,
          ),
        },
      ],
    };
  }, [points, width, height, color, area]);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-gray-400" style={{ height, width }}>
        No data
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="relative" style={{ width }}>
      <HChart options={options} style={{ width, height }} />
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
