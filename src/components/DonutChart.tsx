/**
 * DonutChart (Highcharts pie with inner size) with inline % labels and a
 * center label/value stack. Used for the dashboard BS allocation donut.
 * Privacy mode masks dollar amounts in the tooltip.
 */

import { useMemo } from 'react';
import { CHART, HChart, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { PRIVACY_USD_PLACEHOLDER } from '@/lib/privacyMoney';

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

export function DonutChart({ items, size = 220, centerLabel, centerValue }: Props) {
  const { hideIncomeAssets } = usePrivacyMode();
  const total = items.reduce((s, i) => s + i.value, 0);

  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: { type: 'pie', height: size, width: size, spacing: [0, 0, 0, 0] },
      tooltip: {
        formatter() {
          const p = this as Highcharts.Point & { percentage: number };
          return tipHtml(p.name, [
            { label: 'Value', value: hideIncomeAssets ? PRIVACY_USD_PLACEHOLDER : fmtUsd(Number(p.y)), color: String(p.color) },
            { label: 'Share', value: `${p.percentage.toFixed(1)}%` },
          ]);
        },
      },
      plotOptions: {
        pie: {
          innerSize: '62%',
          size: '100%',
          borderColor: '#ffffff',
          borderWidth: 2,
          borderRadius: 2,
          dataLabels: {
            enabled: true,
            distance: '-20%',
            formatter() {
              const p = (this as unknown as { point: Highcharts.Point & { percentage: number } }).point ?? (this as unknown as Highcharts.Point & { percentage: number });
              return p.percentage >= 7 ? `${Math.round(p.percentage)}%` : null;
            },
            style: { color: '#ffffff', fontSize: '11px', fontWeight: '600', textOutline: 'none', textOverflow: 'none' },
          },
        },
      },
      series: [
        {
          type: 'pie',
          name: 'Allocation',
          data: items.map((s) => ({ name: s.label, y: s.value, color: s.color })),
        },
      ],
    }),
    [items, size, hideIncomeAssets],
  );

  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400" style={{ width: size, height: size }}>
        No data
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <HChart options={options} style={{ width: size }} />
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel && <div className="text-[11px]" style={{ color: CHART.gray }}>{centerLabel}</div>}
          {centerValue && (
            <div
              className="text-lg font-bold tabular-nums"
              style={{ color: CHART.navy900, fontFamily: CHART.numFont }}
            >
              {centerValue}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
