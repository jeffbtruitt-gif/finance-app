/**
 * Horizontal bar chart (Highcharts) — top spend categories for the period.
 * Each bar uses its category color over a light navy track; amount at the end.
 */

import { useMemo } from 'react';
import { CHART, HChart, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';

export interface HorizontalCategoryBarItem {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface Props {
  items: HorizontalCategoryBarItem[];
}

const ROW_PX = 40;

export function HorizontalCategoryBars({ items }: Props) {
  const options = useMemo<Highcharts.Options>(() => {
    const max = Math.max(1, ...items.map((i) => i.value)) * 1.18;
    return {
      chart: { type: 'bar', height: Math.max(120, items.length * ROW_PX + 16), spacingRight: 12 },
      legend: { enabled: false },
      xAxis: {
        categories: items.map((i) => i.label),
        lineWidth: 0,
        labels: { style: { color: '#545b6e', fontSize: '12px' } },
      },
      yAxis: { min: 0, max, visible: false },
      tooltip: {
        formatter() {
          const it = items[Number(this.index)];
          return tipHtml(it?.label ?? '', [{ label: 'Spend', value: fmtUsd(Number(this.y)), color: it?.color }]);
        },
      },
      plotOptions: {
        bar: {
          borderRadius: 10,
          borderWidth: 0,
          pointWidth: 20,
          grouping: false,
        },
      },
      series: [
        {
          // Full-width track behind each bar.
          type: 'bar',
          name: 'track',
          data: items.map(() => max),
          color: CHART.navy100,
          enableMouseTracking: false,
          dataLabels: { enabled: false },
          states: { inactive: { opacity: 1 } },
        },
        {
          type: 'bar',
          name: 'Spend',
          data: items.map((it) => ({ y: it.value, color: it.color })),
          dataLabels: {
            enabled: true,
            inside: false,
            formatter() { return fmtUsd(Number(this.y)); },
            style: { color: '#374151', fontSize: '11px', fontWeight: '600', textOutline: 'none' },
          },
        },
      ],
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-400">
        No categories this month
      </div>
    );
  }
  return <HChart options={options} />;
}
