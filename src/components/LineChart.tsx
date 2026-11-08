/**
 * LineChart (Highcharts) — single-series line with gradient fill and an
 * emphasized zero line, plus a shaded band when values go negative. Used on
 * the College page for each kid's balance trajectory and history.
 */

import { useMemo } from 'react';
import { CHART, HChart, compactUsd, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';

export interface LineChartPoint {
  x: number; // typically year
  y: number; // balance
}

interface LineChartProps {
  points: LineChartPoint[];
  /** Primary heading — use with `subtitle` for the standard DS block. */
  title?: string;
  /** Secondary line under `title`. */
  subtitle?: string;
  /** Single heading (legacy). Prefer `title` + `subtitle`. */
  caption?: string;
  /** Color of the line. Defaults to navy-700 (design system). */
  color?: string;
  /** Color of the "below zero" shaded band. Defaults to neg-soft. */
  belowZeroColor?: string;
  /** Gradient fill under the line. Default true. */
  area?: boolean;
  /** Kept for compatibility; the chart now fills its container width. */
  width?: number;
  /** Chart height in px. */
  height?: number;
  className?: string;
  /** When set, x-axis labels use this instead of the raw x number. */
  formatX?: (x: number) => string;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function LineChart({
  points,
  title,
  subtitle,
  caption,
  color = CHART.navy700,
  belowZeroColor = '#fbeae7',
  area = true,
  height = 220,
  className,
  formatX,
}: LineChartProps) {
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

  const options = useMemo<Highcharts.Options>(() => {
    const yMin = Math.min(0, ...points.map((p) => p.y));
    const label = (x: number) => (formatX ? formatX(x) : String(x));
    return {
      chart: { type: area ? 'area' : 'line', height },
      legend: { enabled: false },
      xAxis: {
        type: 'linear',
        allowDecimals: false,
        tickPixelInterval: 90,
        labels: { formatter() { return label(Number(this.value)); } },
        crosshair: { color: '#cbd5e1', dashStyle: 'Dash', width: 1 },
      },
      yAxis: {
        softMin: 0,
        tickAmount: 5,
        labels: { formatter() { return compactUsd(Number(this.value)); } },
        plotLines: [{ value: 0, color: CHART.grayLight, width: 1, zIndex: 3 }],
        plotBands: yMin < 0 ? [{ from: -1e15, to: 0, color: hexToRgba(belowZeroColor, 0.55) }] : [],
      },
      tooltip: {
        formatter() {
          return tipHtml(label(Number(this.x)), [{ label: 'Balance', value: fmtUsd(Number(this.y)), color }]);
        },
      },
      plotOptions: {
        series: {
          color,
          lineWidth: 2,
          threshold: null,
          marker: { enabled: false, radius: 3.5, states: { hover: { enabled: true } } },
        },
        area: {
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, hexToRgba(color, 0.2)],
              [1, hexToRgba(color, 0)],
            ],
          },
        },
      },
      series: [
        {
          type: area ? 'area' : 'line',
          name: 'Balance',
          data: points.map((p, i) =>
            i === points.length - 1
              ? {
                  x: p.x,
                  y: p.y,
                  marker: { enabled: true, radius: 3.5, fillColor: color },
                  dataLabels: {
                    enabled: true,
                    align: 'right',
                    x: -6,
                    formatter() { return fmtUsd(p.y); },
                    style: { color: CHART.navy900, fontSize: '11px', fontWeight: '600', textOutline: '2px #ffffff' },
                  },
                }
              : [p.x, p.y],
          ),
        },
      ],
    };
  }, [points, color, belowZeroColor, area, height, formatX]);

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

  return (
    <div className={className}>
      {header}
      <HChart options={options} />
    </div>
  );
}
