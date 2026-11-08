/**
 * WaterfallChart (Highcharts waterfall) — Income → Tax → Expenses → Savings →
 * Left Over, used on the Assumptions page and the dashboard snapshot.
 *
 * Colors: income green, outflows red, Left Over green when positive and amber
 * when negative. Dashed connectors run between bars at the running total.
 * Privacy mode hides the dollar labels (the chart is built from income).
 */

import { useMemo } from 'react';
import { CHART, HChart, compactUsd, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { PRIVACY_USD_PLACEHOLDER } from '@/lib/privacyMoney';
import type { Waterfall } from '@/features/assumptions/rollup';

interface WaterfallChartProps {
  waterfall: Waterfall;
  /** Optional caption shown above the chart. */
  caption?: string;
  /** Optional className passed to the wrapping <div>. */
  className?: string;
}

export function WaterfallChart({ waterfall, caption, className }: WaterfallChartProps) {
  const { hideIncomeAssets } = usePrivacyMode();

  const options = useMemo<Highcharts.Options>(() => {
    const { steps } = waterfall;
    const money = (n: number) => (hideIncomeAssets ? PRIVACY_USD_PLACEHOLDER : fmtUsd(n));
    const data: Highcharts.PointOptionsObject[] = steps.map((s, i) => {
      const isFinal = i === steps.length - 1;
      if (i === 0) return { name: s.label, y: s.delta, color: CHART.pos };
      if (isFinal) {
        return { name: s.label, isSum: true, color: s.total >= 0 ? CHART.pos : CHART.warn };
      }
      return { name: s.label, y: s.delta, color: CHART.neg };
    });

    return {
      chart: { type: 'waterfall', height: 284 },
      legend: { enabled: false },
      xAxis: {
        type: 'category',
        labels: { style: { color: '#545b6e', fontSize: '11px', fontWeight: '500' } },
      },
      yAxis: {
        tickAmount: 5,
        plotLines: [{ value: 0, color: CHART.navy200, width: 1, zIndex: 3 }],
        labels: {
          enabled: !hideIncomeAssets,
          formatter() { return compactUsd(Number(this.value)); },
        },
      },
      tooltip: {
        formatter() {
          const i = Number(this.index);
          const s = steps[i];
          if (!s) return '';
          const rows = [{ label: i === 0 || i === steps.length - 1 ? 'Amount' : 'Outflow', value: money(Math.abs(s.delta || s.total)) }];
          if (i > 0 && i < steps.length - 1) rows.push({ label: 'Running total', value: money(s.total) });
          return tipHtml(s.label, rows);
        },
      },
      plotOptions: {
        waterfall: {
          borderWidth: 0,
          borderRadius: 3,
          pointPadding: 0.12,
          maxPointWidth: 84,
          lineColor: CHART.grayLight,
          dashStyle: 'Dash',
          dataLabels: {
            enabled: true,
            inside: false,
            crop: false,
            overflow: 'allow',
            formatter() {
              const i = Number(this.index);
              const s = steps[i];
              return s ? money(Math.abs(s.delta || s.total)) : '';
            },
            style: { color: CHART.navy900, fontSize: '11px', fontWeight: '600', textOutline: 'none' },
          },
        },
      },
      series: [{ type: 'waterfall', name: 'Waterfall', data }],
    };
  }, [waterfall, hideIncomeAssets]);

  return (
    <div className={className}>
      {caption && <div className="mb-2 text-h4 text-navy-800">{caption}</div>}
      <HChart options={options} />
    </div>
  );
}
