/**
 * Monthly trend vertical bar chart (Highcharts column).
 *
 * Used for the 6-month spend trend and the yearly budget-vs-reforecast
 * two-bar view. Current bar is navy-800; others navy-200 unless an item
 * passes its own color. Value labels sit above each bar.
 */

import { useMemo } from 'react';
import { CHART, HChart, compactUsd, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';

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

function shortUsd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  return `$${(v / 1000).toFixed(a >= 100_000 ? 0 : 1)}K`;
}

export function MonthlyTrendBars({ items, height = 220 }: Props) {
  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: { type: 'column', height },
      legend: { enabled: false },
      xAxis: {
        categories: items.map((i) => i.key),
        labels: {
          useHTML: true,
          formatter() {
            const it = items[Number(this.pos)];
            if (!it) return '';
            const main = `<span style="color:${it.current ? CHART.navy800 : CHART.gray};font-weight:${it.current ? 700 : 400}">${it.label}</span>`;
            return it.subLabel
              ? `<div style="text-align:center">${main}<br/><span style="color:${CHART.grayLight};font-size:10px">${it.subLabel}</span></div>`
              : main;
          },
        },
      },
      yAxis: {
        min: 0,
        tickAmount: 4,
        labels: { formatter() { return compactUsd(Number(this.value)); } },
      },
      tooltip: {
        formatter() {
          const it = items[Number(this.index)];
          return tipHtml(it?.label ?? '', [{ label: 'Spend', value: fmtUsd(Number(this.y)) }]);
        },
      },
      plotOptions: {
        column: {
          borderRadius: 6,
          borderWidth: 0,
          maxPointWidth: 56,
          pointPadding: 0.12,
          groupPadding: 0.12,
          dataLabels: {
            enabled: true,
            allowOverlap: true,
            crop: false,
            overflow: 'allow',
            // Full dollars when there's room, "$6.2K" when bars are narrow.
            formatter() {
              const v = Number(this.y);
              const slot = this.series.chart.plotWidth / Math.max(1, items.length);
              return slot < 78 && Math.abs(v) >= 1000 ? shortUsd(v) : fmtUsd(v);
            },
            style: { color: CHART.gray, fontSize: '11px', fontWeight: '500', textOutline: 'none' },
          },
        },
      },
      series: [
        {
          type: 'column',
          name: 'Spend',
          data: items.map((it) => ({
            y: it.value,
            color: it.color ?? (it.current ? CHART.navy800 : CHART.navy200),
          })),
        },
      ],
    }),
    [items, height],
  );

  if (items.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-gray-400">No data</div>;
  }
  return <HChart options={options} />;
}
