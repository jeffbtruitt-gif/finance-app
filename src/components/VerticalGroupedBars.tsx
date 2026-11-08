/**
 * Grouped column chart (Highcharts) — paired actual vs budget per group.
 * When actual > budget the actual column turns neg-red and its label bolds red.
 */

import { useMemo } from 'react';
import { CHART, HChart, compactUsd, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';

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

export function VerticalGroupedBars({ items, height = 260 }: Props) {
  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: { type: 'column', height },
      legend: { enabled: true, align: 'center', verticalAlign: 'bottom', margin: 6 },
      xAxis: {
        categories: items.map((i) => i.label),
        labels: {
          formatter() {
            const it = items[Number(this.pos)];
            const over = !!it && it.actual > it.budget;
            return over
              ? `<span style="color:${CHART.neg};font-weight:700">${this.value}</span>`
              : `<span style="color:#545b6e">${this.value}</span>`;
          },
        },
      },
      yAxis: {
        min: 0,
        tickAmount: 4,
        labels: { formatter() { return compactUsd(Number(this.value)); } },
      },
      tooltip: {
        shared: true,
        formatter() {
          const it = items[Number(this.points?.[0]?.index ?? 0)];
          if (!it) return '';
          const diff = it.actual - it.budget;
          return tipHtml(it.label, [
            { label: 'Actual', value: fmtUsd(it.actual), color: it.actual > it.budget ? CHART.neg : CHART.navy800 },
            { label: 'Budget', value: fmtUsd(it.budget), color: CHART.navy200 },
            { label: diff > 0 ? 'Over budget' : 'Under budget', value: fmtUsd(Math.abs(diff)) },
          ]);
        },
      },
      plotOptions: {
        column: {
          borderRadius: 5,
          borderWidth: 0,
          maxPointWidth: 30,
          // Space the pair out so both value labels fit side by side.
          pointPadding: 0.25,
          groupPadding: 0.12,
          dataLabels: {
            enabled: true,
            allowOverlap: true,
            crop: false,
            overflow: 'allow',
            style: { fontSize: '10.5px', fontWeight: '500', textOutline: 'none' },
          },
        },
      },
      series: [
        {
          type: 'column',
          name: 'Actual',
          color: CHART.navy800,
          data: items.map((it) => {
            const over = it.actual > it.budget;
            return {
              y: it.actual,
              color: over ? CHART.neg : CHART.navy800,
              dataLabels: {
                formatter() { return fmtUsd(it.actual); },
                style: { color: over ? CHART.neg : '#545b6e', fontWeight: over ? '600' : '500' },
              },
            };
          }),
        },
        {
          type: 'column',
          name: 'Budget',
          color: CHART.navy200,
          data: items.map((it) => ({
            y: it.budget,
            dataLabels: {
              formatter() { return fmtUsd(it.budget); },
              style: { color: CHART.grayLight },
            },
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
