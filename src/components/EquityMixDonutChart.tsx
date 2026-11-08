/**
 * Equity mix donut (Highcharts) — net worth composition by positive equity
 * groups, with group name + % inside large slices and net worth in the center.
 * Privacy mode masks dollar amounts.
 */

import { useMemo } from 'react';
import { CHART, HChart, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { PRIVACY_USD_PLACEHOLDER } from '@/lib/privacyMoney';

/** Distinct segments within DS (navy scale, gold accent, pos, category hues). */
const SEGMENT_FILLS = [
  '#243460', '#c9a84c', '#6278b8', '#1e7e5a', '#3884c2', '#e08750',
  '#8fa1cc', '#3a9e6f', '#3b559a', '#7a8aa8', '#22a39f', '#c98c3b',
] as const;

export type EquityMixSlice = {
  key: string;
  label: string;
  net: number;
};

export interface EquityMixDonutChartProps {
  slices: EquityMixSlice[];
  netWorth: number;
  className?: string;
}

function pctOfNetWorth(net: number, netWorth: number): number {
  if (!Number.isFinite(netWorth) || netWorth === 0) return 0;
  return (100 * net) / netWorth;
}

export function EquityMixDonutChart({ slices, netWorth, className = '' }: EquityMixDonutChartProps) {
  const { hideIncomeAssets } = usePrivacyMode();
  const money = (n: number) => (hideIncomeAssets ? PRIVACY_USD_PLACEHOLDER : fmtUsd(n));

  const rows = useMemo(
    () => slices.filter((s) => s.net > 0).sort((a, b) => b.net - a.net),
    [slices],
  );
  const sum = rows.reduce((t, s) => t + s.net, 0);

  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: { type: 'pie', height: 420, spacing: [4, 4, 4, 4] },
      tooltip: {
        formatter() {
          const r = rows[Number(this.index)];
          if (!r) return '';
          return tipHtml(r.label, [
            { label: 'Net equity', value: money(r.net), color: String(this.color) },
            { label: 'Share of net worth', value: `${pctOfNetWorth(r.net, netWorth).toFixed(1)}%` },
          ]);
        },
      },
      plotOptions: {
        pie: {
          innerSize: '53%',
          size: '96%',
          borderColor: '#ffffff',
          borderWidth: 1.5,
          dataLabels: {
            enabled: true,
            distance: '-24%',
            useHTML: false,
            formatter() {
              const r = rows[Number((this as unknown as { point: Highcharts.Point }).point?.index ?? this.index)];
              if (!r) return null;
              const pct = pctOfNetWorth(r.net, netWorth);
              const share = (r.net / sum) * 360;
              if (share < 14 || pct < 2) return null;
              return `${r.label}<br/><span style="font-size:11px;font-weight:500">${Math.round(pct)}%</span>`;
            },
            style: {
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: '600',
              textOutline: '1px rgba(13,21,39,0.35)',
              textOverflow: 'none',
              textAlign: 'center',
            },
          },
        },
      },
      series: [
        {
          type: 'pie',
          name: 'Equity mix',
          data: rows.map((r, i) => ({
            name: r.label,
            y: r.net,
            color: SEGMENT_FILLS[i % SEGMENT_FILLS.length],
          })),
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sum, netWorth, hideIncomeAssets],
  );

  if (sum <= 0 || netWorth <= 0) {
    return (
      <p className="text-sm text-gray-500">
        Add positive net equity in at least one group to see the mix chart.
      </p>
    );
  }

  return (
    <div className={`relative mx-auto w-full max-w-[460px] ${className}`}>
      <HChart options={options} />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="max-w-[10rem] text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Net worth</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: CHART.navy900 }}>
            {money(netWorth)}
          </div>
        </div>
      </div>
    </div>
  );
}
