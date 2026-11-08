/**
 * Net worth "Position" card — hero KPI for the Balance Sheet report page.
 *
 * Layout (matches the Copilot Money-style design):
 *   - Top: "POSITION" label, net worth headline, MoM + YTD deltas,
 *          "Edit balance sheet" link
 *   - Middle: large area chart (24-month net worth trend)
 *   - Bottom row: ASSETS (total + stacked bar + legend) | LIABILITIES
 *          (total + item list + debt-to-assets badge)
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HChart, type Highcharts } from '@/lib/highcharts';
import { fmtPct, fmtMoney, fmtUsd } from '@/lib/money';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { maskUsd, PRIVACY_TEXT_PLACEHOLDER } from '@/lib/privacyMoney';
import { formatPeriod, type Period } from '@/lib/period';
import { Card } from '@/components/ds';
import { type NetWorthAtMonth } from './effective';
import { type EquityByGroupLine } from './report';

export interface NetWorthTotals {
  assets: number;
  liabilities: number;
  net: number;
}

export interface NetWorthHeaderCardProps {
  totals: NetWorthTotals;
  totalsPrior: NetWorthTotals;
  totalsYtdStart: NetWorthTotals;
  period: Period;
  series: NetWorthAtMonth[];
  equityByGroup: EquityByGroupLine[];
  liabilityNames: string[];
}

const EQUITY_COLORS = [
  '#243460', // navy-900
  '#3b6a9c', // mid-blue
  '#5e9ec2', // light-blue
  '#a8c8e0', // pale-blue
  '#c4975a', // gold
  '#8b6e4e', // brown
  '#6b7280', // gray-500
  '#94a3b8', // slate-400
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function compactUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return '$' + fmtMoney(n / 1_000_000, { decimals: 2 }) + 'M';
  if (abs >= 1_000) return '$' + fmtMoney(n / 1_000) + 'K';
  return '$' + fmtMoney(n);
}

export function NetWorthHeaderCard(props: NetWorthHeaderCardProps) {
  const { totals, totalsPrior, totalsYtdStart, series, equityByGroup, liabilityNames } = props;
  const { hideIncomeAssets } = usePrivacyMode();
  const $ = (n: number) => maskUsd(hideIncomeAssets, n, true);

  const dNet = totals.net - totalsPrior.net;
  const dPct =
    totalsPrior.net !== 0 ? (dNet / Math.abs(totalsPrior.net)) * 100 : null;

  const ytdDelta = totals.net - totalsYtdStart.net;
  const ytdPct =
    totalsYtdStart.net !== 0
      ? (ytdDelta / Math.abs(totalsYtdStart.net)) * 100
      : null;

  const debtToAssets =
    totals.assets !== 0 ? (totals.liabilities / totals.assets) * 100 : null;

  // --- chart data (trim leading zero months) ---
  const firstRealIdx = series.findIndex(
    (s) => s.assets !== 0 || s.liabilities !== 0,
  );
  const chartSeries = firstRealIdx >= 0 ? series.slice(firstRealIdx) : series;

  // --- asset category slices ---
  const assetGroups = equityByGroup
    .map((g) => ({ label: g.groupLabel, value: g.assets }))
    .filter((g) => g.value > 0)
    .sort((a, b) => b.value - a.value);
  const assetTotal = assetGroups.reduce((s, g) => s + g.value, 0);

  return (
    <Card className="overflow-hidden !p-0">
      {/* ---- top: headline row ---- */}
      <div className="flex items-start justify-between px-6 pt-5 pb-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-navy-600">
            Position
          </div>
          <div className="text-xs text-gray-500">Net worth</div>
          <div className="mt-1 text-[32px] font-bold leading-none tracking-tight text-navy-900 tabular-nums">
            {hideIncomeAssets ? '$-' : compactUsd(totals.net)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[13px]">
            {hideIncomeAssets ? (
              <span className="text-gray-400">{PRIVACY_TEXT_PLACEHOLDER}</span>
            ) : (
              <>
                <span className="text-gray-500">
                  vs last month{' '}
                  <span className={dNet >= 0 ? 'text-pos' : 'text-neg'}>
                    {dNet >= 0 ? '+' : '−'}${fmtMoney(Math.abs(dNet))}
                    {dPct != null && <> ({fmtPct(dPct, { decimals: 1 })})</>}
                  </span>
                </span>
                <span className="text-gray-500">
                  YTD{' '}
                  <span className={ytdDelta >= 0 ? 'text-pos' : 'text-neg'}>
                    {ytdDelta >= 0 ? '+' : '−'}${fmtMoney(Math.abs(ytdDelta))}
                    {ytdPct != null && (
                      <> ({fmtPct(ytdPct, { decimals: 1 })})</>
                    )}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
        <Link
          to="/balance-sheet"
          className="mt-1 shrink-0 text-[13px] text-gray-500 hover:text-navy-700"
        >
          Edit balance sheet &rarr;
        </Link>
      </div>

      {/* ---- area chart ---- */}
      <div className="px-2 pt-2 pb-0">
        {hideIncomeAssets ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-gray-400">
            Trend hidden
          </div>
        ) : (
          <NetWorthAreaChart points={chartSeries} hideValues={hideIncomeAssets} />
        )}
      </div>

      {/* ---- bottom row: assets | liabilities ---- */}
      <div className="grid grid-cols-1 gap-0 border-t border-navy-100 md:grid-cols-2">
        {/* ASSETS */}
        <div className="border-b border-navy-100 px-6 py-4 md:border-b-0 md:border-r">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Assets
          </div>
          <div className="mt-1 text-[22px] font-bold leading-tight text-navy-900 tabular-nums">
            {$(totals.assets)}
          </div>
          {!hideIncomeAssets && assetGroups.length > 0 && (
            <>
              {/* stacked bar */}
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
                {assetGroups.map((g, i) => (
                  <div
                    key={g.label}
                    style={{
                      width: `${(g.value / assetTotal) * 100}%`,
                      backgroundColor: EQUITY_COLORS[i % EQUITY_COLORS.length],
                    }}
                  />
                ))}
              </div>
              {/* legend */}
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
                {assetGroups.map((g, i) => (
                  <span key={g.label} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          EQUITY_COLORS[i % EQUITY_COLORS.length],
                      }}
                    />
                    <span className="text-gray-700">{g.label}</span>
                    <span className="tabular-nums text-gray-500">
                      {Math.round((g.value / assetTotal) * 100)}%
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* LIABILITIES */}
        <div className="px-6 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Liabilities
          </div>
          <div className="mt-1 text-[22px] font-bold leading-tight text-navy-900 tabular-nums">
            {$(totals.liabilities)}
          </div>
          {!hideIncomeAssets && (
            <>
              {liabilityNames.length > 0 && (
                <div className="mt-2 text-[13px] text-gray-500">
                  {liabilityNames.join(', ')}
                </div>
              )}
              {debtToAssets != null && (
                <span className="mt-2.5 inline-block rounded-full border border-navy-200 bg-navy-50/60 px-3 py-0.5 text-[12px] font-medium text-navy-700">
                  Debt-to-assets {debtToAssets.toFixed(1)}%
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline area chart (SVG — no external deps)                        */
/* ------------------------------------------------------------------ */

function NetWorthAreaChart({ points, hideValues }: { points: NetWorthAtMonth[]; hideValues: boolean }) {
  const options = useMemo<Highcharts.Options>(() => {
    const navy = '#243460';
    const gray = '#9ca3af';
    return {
      chart: {
        type: 'areaspline',
        height: 200,
        backgroundColor: 'transparent',
        spacing: [12, 8, 4, 8],
        style: { fontFamily: "Figtree, Inter, system-ui, sans-serif" },
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      accessibility: { enabled: false },
      xAxis: {
        categories: points.map((p) => formatPeriod(p.period, 'short')),
        tickLength: 0,
        lineColor: '#e2e8f0',
        labels: {
          style: { color: gray, fontSize: '11px', textOverflow: 'none' },
          autoRotation: [],
          step: points.length > 14 ? 2 : 1,
          // Short month; add the year on January and on the first label.
          formatter() {
            const p = points[Number(this.pos)];
            if (!p) return '';
            const mon = MONTH_ABBR[p.period.month - 1];
            return p.period.month === 1 || this.isFirst
              ? `${mon} '${String(p.period.year).slice(-2)}`
              : mon;
          },
        },
        crosshair: { color: '#cbd5e1', dashStyle: 'Dash', width: 1 },
      },
      yAxis: {
        title: { text: undefined },
        gridLineColor: '#e2e8f0',
        gridLineDashStyle: 'Dash',
        tickAmount: 5,
        labels: {
          enabled: !hideValues,
          style: { color: gray, fontSize: '11px' },
          formatter() {
            return compactUsd(Number(this.value));
          },
        },
      },
      tooltip: {
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        borderRadius: 8,
        shadow: true,
        style: { color: '#1a2240', fontSize: '12px' },
        formatter() {
          const value = hideValues ? PRIVACY_TEXT_PLACEHOLDER : fmtUsd(Number(this.y));
          return `<span style="color:${gray}">${this.key}</span><br/><b>Net worth: ${value}</b>`;
        },
      },
      plotOptions: {
        areaspline: {
          lineWidth: 2.5,
          color: navy,
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(36, 52, 96, 0.18)'],
              [1, 'rgba(36, 52, 96, 0.01)'],
            ],
          },
          threshold: null,
          marker: {
            enabled: false,
            radius: 4,
            fillColor: '#ffffff',
            lineColor: navy,
            lineWidth: 2,
            states: { hover: { enabled: true } },
          },
          states: { hover: { lineWidthPlus: 0 } },
        },
      },
      series: [
        {
          type: 'areaspline',
          name: 'Net worth',
          data: points.map((p, i) =>
            i === points.length - 1
              ? { y: p.net, marker: { enabled: true } }
              : p.net,
          ),
        },
      ],
    };
  }, [points, hideValues]);

  if (points.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-gray-400">
        No data
      </div>
    );
  }

  return <HChart options={options} />;
}
