/**
 * Net worth headline + trimmed sparkline (same layout as the former Balance
 * Sheet page header). Used on the Balance Sheet report.
 */

import { fmtPct, fmtUsd, varianceClass } from '@/lib/money';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { maskUsd, PRIVACY_TEXT_PLACEHOLDER } from '@/lib/privacyMoney';
import { formatPeriod, type Period } from '@/lib/period';
import { Sparkline } from '@/components/Sparkline';
import { Card } from '@/components/ds';
import { netWorthSeries } from './effective';

export interface NetWorthTotals {
  assets: number;
  liabilities: number;
  net: number;
}

interface NetWorthHeaderCardProps {
  totals: NetWorthTotals;
  totalsPrior: NetWorthTotals;
  period: Period;
  series: ReturnType<typeof netWorthSeries>;
}

export function NetWorthHeaderCard({
  totals,
  totalsPrior,
  period,
  series,
}: NetWorthHeaderCardProps) {
  const { hideIncomeAssets } = usePrivacyMode();
  const $ = (n: number) => maskUsd(hideIncomeAssets, n, true);

  const dNet = totals.net - totalsPrior.net;
  const dPct =
    totalsPrior.net !== 0 ? (dNet / Math.abs(totalsPrior.net)) * 100 : null;

  const firstRealIdx = series.findIndex((s) => s.assets !== 0 || s.liabilities !== 0);
  const chartSeries = firstRealIdx >= 0 ? series.slice(firstRealIdx) : series;
  const chartPoints = chartSeries.map((s) => ({
    label: formatPeriod(s.period, 'short'),
    value: s.net,
  }));

  return (
    <Card>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <div className="text-label uppercase tracking-wider text-gray-500">
            Net Worth as of {formatPeriod(period)}
          </div>
          <div className="mt-1 text-display font-bold tabular-nums text-navy-900">
            {$(totals.net)}
          </div>
          <div className="mt-1 flex items-center gap-3 text-sm">
            <span className={hideIncomeAssets ? 'text-gray-400' : varianceClass(-dNet)}>
              {hideIncomeAssets ? (
                PRIVACY_TEXT_PLACEHOLDER
              ) : (
                <>
                  {dNet >= 0 ? '+' : '−'}
                  {fmtUsd(Math.abs(dNet))} {dPct != null && <>({fmtPct(dPct)})</>}{' '}
                  vs prior month
                </>
              )}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-label uppercase tracking-wider text-gray-500">
                Assets
              </div>
              <div className="text-h2 font-semibold tabular-nums text-pos">
                {$(totals.assets)}
              </div>
            </div>
            <div>
              <div className="text-label uppercase tracking-wider text-gray-500">
                Liabilities
              </div>
              <div className="text-h2 font-semibold tabular-nums text-neg">
                {$(totals.liabilities)}
              </div>
            </div>
          </div>
        </div>
        <div className="self-end">
          <div className="mb-1 text-label uppercase tracking-wider text-gray-500">
            Last {chartPoints.length} months
          </div>
          {hideIncomeAssets ? (
            <div className="flex h-[90px] w-[360px] items-center justify-center rounded-md border border-dashed border-navy-200 bg-navy-50 text-caption text-gray-400">
              Trend hidden
            </div>
          ) : (
            <Sparkline points={chartPoints} width={360} height={90} />
          )}
        </div>
      </div>
    </Card>
  );
}
