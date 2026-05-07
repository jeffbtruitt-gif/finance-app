/**
 * Dashboard — Phase 5 (restyled May 2026 to Truitt Finance Design System v1.0).
 *
 * The home page. Loads in-place when you log in and answers the four
 * questions the spreadsheet's "Main 2" tab answers every Sunday morning:
 *
 *   - Are we on budget this month / YTD?  (spend vs budget cards)
 *   - Income / savings / tax / expense shape from Assumptions (waterfalls).
 *   - Where does net worth stand?         (net worth card + 24-mo line)
 *
 * Plus a small free-text Goals list so the dashboard surfaces the
 * *why*, not just the numbers.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useHousehold } from '@/api/household';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { useDefaultPeriod } from '@/lib/useDefaultPeriod';
import {
  actualsToLookup,
  budgetsToLookup,
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchMonthlyActuals,
  type BudgetRow,
} from '@/api/reports';
import { fetchAllRevisedForYear } from '@/api/reforecast';
import {
  fetchDashboardData,
  sumByGroup,
  rollupBudget,
  type DashboardData,
} from '@/api/dashboard';
import {
  fetchBalanceSheetItems,
  fetchBalanceSheetValues,
  fetchHouseholdSettings,
  saveHouseholdSettings,
} from '@/api/balanceSheet';
import {
  effectiveValuesAt,
  netWorthSeries,
  periodToBsMonth,
} from '@/features/balance-sheet/effective';
import { fmtUsd, fmtPct, varianceClass } from '@/lib/money';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { maskUsd, PRIVACY_TEXT_PLACEHOLDER } from '@/lib/privacyMoney';
import { formatPeriod, type Period } from '@/lib/period';
import { DashboardSpendGroupBarChart } from '@/components/DashboardSpendGroupBarChart';
import { DashboardYearlyTwoBarChart } from '@/components/DashboardYearlyTwoBarChart';
import { StatusPanel } from '@/components/StatusPanel';
import { Sparkline } from '@/components/Sparkline';
import { WaterfallChart } from '@/components/WaterfallChart';
import { Badge, Button, Card } from '@/components/ds';
import { useAssumptionsWaterfalls } from '@/features/assumptions/useAssumptionsWaterfalls';
import {
  buildSpendReport,
  yearlySpendCategoriesOnly,
  type SpendGroup,
} from '@/features/reports/grouping';
import {
  reforecastProjectedGrandTotal,
  sumActualYtdThroughMonth,
  sumBudgetFullYearForCategory,
  sumSpendBudgetYearTotal,
} from '@/features/budget/reforecastProjectedGrand';


/** Spend-group axis labels (aligned with reports / grouping canonical names). */
const DASHBOARD_SPEND_GROUP_LABEL: Record<SpendGroup, string> = {
  'Rent & House Maintenance': 'Rent & utilities',
  'Food & Car': 'Food & car',
  'Other': 'Other',
  'Yearly': 'Yearly',
};

function spendGroupBarSeries(d: DashboardData, periods: Period[]) {
  const actualsLookup = actualsToLookup(d.monthlyRows);
  const budgetLookup = budgetsToLookup(d.budgetRows as BudgetRow[]);
  const report = buildSpendReport({
    categories: d.categories,
    periods,
    actuals: actualsLookup,
    budgets: budgetLookup,
  });
  return report.sections.map((s) => ({
    key: String(s.group),
    label: DASHBOARD_SPEND_GROUP_LABEL[s.group as SpendGroup] ?? String(s.group),
    actual: s.actualTotal,
    budget: s.budgetTotal,
  }));
}

export function DashboardPage() {
  const household = useHousehold();
  const qc = useQueryClient();
  const { period: thisMonth } = useAppPeriod();
  const defaultPeriod = useDefaultPeriod();

  const schemeQ = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });

  const dashQ = useQuery({
    queryKey: ['dashboard-data', household?.id, schemeQ.data, thisMonth.year, thisMonth.month],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchDashboardData({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        thisMonth,
      }),
  });

  const itemsQ = useQuery({
    queryKey: ['bs-items', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetItems(household!.id),
  });
  const valuesQ = useQuery({
    queryKey: ['bs-values', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetValues(household!.id),
  });
  const settingsQ = useQuery({
    queryKey: ['hh-settings', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchHouseholdSettings(household!.id),
  });

  const assumptionsWf = useAssumptionsWaterfalls(thisMonth.year, thisMonth);

  const yearlyFYActualsQ = useQuery({
    queryKey: ['dashboard-yearly-fy-actuals', household?.id, schemeQ.data, thisMonth.year],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: { year: thisMonth.year, month: 1 },
        to: { year: thisMonth.year, month: 12 },
      }),
  });

  const reforecastYearDashQ = useQuery({
    queryKey: ['revised-all', household?.id, thisMonth.year],
    enabled: !!household?.id,
    queryFn: () =>
      fetchAllRevisedForYear({ household_id: household!.id, year: thisMonth.year }),
  });

  const yearlyBudgetCompareError =
    reforecastYearDashQ.error ?? yearlyFYActualsQ.error;

  /** Latest-transaction month for full-year reforecast blend — independent of header period. */
  const reforecastAsOfSystem = useMemo(() => {
    const lp = defaultPeriod.period;
    const y = thisMonth.year;
    if (y < lp.year) return 12;
    if (y > lp.year) return 0;
    return lp.month;
  }, [defaultPeriod.period, thisMonth.year]);

  const items = itemsQ.data ?? [];
  const values = valuesQ.data ?? [];

  const calc = useMemo(() => {
    if (!dashQ.data) return null;
    const d = dashQ.data;

    const monthSums = sumByGroup({
      rows: d.monthlyRows,
      categories: d.categories,
      periods: [d.thisMonth],
    });
    const ytdSums = sumByGroup({
      rows: d.monthlyRows,
      categories: d.categories,
      periods: d.ytd,
    });
    const t12Sums = sumByGroup({
      rows: d.monthlyRows,
      categories: d.categories,
      periods: d.trailing12,
    });
    const monthBudget = rollupBudget({
      rows: d.budgetRows,
      categories: d.categories,
      periods: [d.thisMonth],
    });
    const ytdBudget = rollupBudget({
      rows: d.budgetRows,
      categories: d.categories,
      periods: d.ytd,
    });

    return { monthSums, ytdSums, t12Sums, monthBudget, ytdBudget };
  }, [dashQ.data]);

  const spendGroupMonthly = useMemo(
    () =>
      dashQ.data ? spendGroupBarSeries(dashQ.data, [dashQ.data.thisMonth]) : [],
    [dashQ.data],
  );

  const spendGroupYtd = useMemo(
    () => (dashQ.data ? spendGroupBarSeries(dashQ.data, dashQ.data.ytd) : []),
    [dashQ.data],
  );

  /** Yearly-section categories: actual YTD through header month vs full-year budget per category. */
  const yearlyExpenseItemsBarData = useMemo(() => {
    if (!dashQ.data) return [];
    const cats = yearlySpendCategoriesOnly(dashQ.data.categories);
    if (cats.length === 0) return [];
    const actualsLookup = actualsToLookup(dashQ.data.monthlyRows);
    const budgetLookup = budgetsToLookup(dashQ.data.budgetRows as BudgetRow[]);
    const y = thisMonth.year;
    const through = thisMonth.month;
    return cats.map((c) => ({
      key: c.id,
      label: c.name,
      actual: sumActualYtdThroughMonth(actualsLookup, c.id, y, through),
      budget: sumBudgetFullYearForCategory(budgetLookup, c.id, y),
    }));
  }, [dashQ.data, thisMonth.year, thisMonth.month]);

  /** Full FY yearly bucket: original budget vs reforecast projected (does not use header month). */
  const yearlyBudgetVsReforecast = useMemo(() => {
    if (
      !dashQ.data ||
      yearlyFYActualsQ.data === undefined ||
      reforecastYearDashQ.data === undefined
    ) {
      return null;
    }
    const cats = yearlySpendCategoriesOnly(dashQ.data.categories);
    if (cats.length === 0) return { budget: 0, reforecast: 0 };
    const budgetLookup = budgetsToLookup(dashQ.data.budgetRows as BudgetRow[]);
    const actualsFYLookup = actualsToLookup(yearlyFYActualsQ.data);
    const budgetTotal = sumSpendBudgetYearTotal(cats, thisMonth.year, budgetLookup);
    const reforecastTotal = reforecastProjectedGrandTotal({
      spendCats: cats,
      year: thisMonth.year,
      asOfMonth: reforecastAsOfSystem,
      budgetLookup,
      actualsLookup: actualsFYLookup,
      revisedAll: reforecastYearDashQ.data,
    });
    return { budget: budgetTotal, reforecast: reforecastTotal };
  }, [
    dashQ.data,
    yearlyFYActualsQ.data,
    reforecastYearDashQ.data,
    thisMonth.year,
    reforecastAsOfSystem,
  ]);

  const nw = useMemo(() => {
    if (!items.length) return null;
    const curIso = periodToBsMonth(thisMonth);
    const priorPeriod: Period =
      thisMonth.month === 1
        ? { year: thisMonth.year - 1, month: 12 }
        : { year: thisMonth.year, month: thisMonth.month - 1 };
    const priorIso = periodToBsMonth(priorPeriod);
    const startOfYearIso = periodToBsMonth({ year: thisMonth.year, month: 1 });

    const totalAt = (iso: string) => {
      const eff = effectiveValuesAt(values, iso);
      let assets = 0;
      let liab = 0;
      for (const it of items) {
        if (!it.is_active) continue;
        const v = eff.get(it.id);
        if (v == null) continue;
        if (it.type === 'asset') assets += v;
        else liab += v;
      }
      return { assets, liab, net: assets - liab };
    };

    const cur = totalAt(curIso);
    const prior = totalAt(priorIso);
    const soy = totalAt(startOfYearIso);

    const series = netWorthSeries({
      items,
      values,
      endMonth: thisMonth,
      count: 24,
    });

    return { cur, prior, soy, series };
  }, [items, values, thisMonth]);

  const loading =
    schemeQ.isLoading ||
    dashQ.isLoading ||
    itemsQ.isLoading ||
    valuesQ.isLoading ||
    settingsQ.isLoading;
  const firstError =
    schemeQ.error ?? dashQ.error ?? itemsQ.error ?? valuesQ.error ?? settingsQ.error;

  return (
    <div>
      <p className="mb-6 text-body-base text-gray-500">
        Sunday-morning view. Anchored on{' '}
        <span className="font-medium text-gray-700">{formatPeriod(thisMonth)}</span>
        — matches the period in the header.
      </p>

      {firstError ? (
        <StatusPanel
          kind="error"
          message="Couldn’t load dashboard"
          detail={firstError instanceof Error ? firstError.message : undefined}
        />
      ) : loading ? (
        <StatusPanel kind="loading" message="Loading dashboard…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {calc && (
            <>
              <ProgressCard
                title="This month"
                subtitle={`Spend vs budget — ${formatPeriod(thisMonth, 'short')}`}
                actual={calc.monthSums.spend}
                budget={calc.monthBudget.spend}
                actualLabel="Spent"
                budgetLabel="Budget"
              />
              <ProgressCard
                title="YTD"
                subtitle={`Year-to-date spend vs budget — ${thisMonth.year}`}
                actual={calc.ytdSums.spend}
                budget={calc.ytdBudget.spend}
                actualLabel="Spent"
                budgetLabel="Budget"
              />
              <ProgressCard
                title="Yearly bucket"
                subtitle="Insurance / property tax / subs / charity (YTD)"
                actual={calc.ytdSums.yearlySpend}
                budget={calc.ytdBudget.yearlySpend}
                actualLabel="Spent"
                budgetLabel="Budget"
              />
            </>
          )}

          {dashQ.data && (
            <section className="col-span-1 grid grid-cols-1 gap-4 md:col-span-2 xl:col-span-3 lg:grid-cols-2">
              <Card padded={false}>
                <Card.Header
                  title="Monthly budget"
                  subtitle={`Actual vs budget by group · ${formatPeriod(thisMonth, 'short')}`}
                />
                <Card.Section>
                  <DashboardSpendGroupBarChart
                    data={spendGroupMonthly}
                    caption={`Monthly budget ${formatPeriod(thisMonth)}`}
                  />
                </Card.Section>
              </Card>
              <Card padded={false}>
                <Card.Header
                  title="Year to date"
                  subtitle={`Jan–${formatPeriod(thisMonth, 'short')} ${thisMonth.year} · by group`}
                />
                <Card.Section>
                  <DashboardSpendGroupBarChart
                    data={spendGroupYtd}
                    caption={`Year to date through ${formatPeriod(thisMonth)}`}
                  />
                </Card.Section>
              </Card>
            </section>
          )}

          {dashQ.data && yearlyExpenseItemsBarData.length > 0 && (
            <section className="col-span-1 grid grid-cols-1 gap-4 md:col-span-2 xl:col-span-3 lg:grid-cols-2">
              <Card padded={false}>
                <Card.Header
                  title="Yearly expense items"
                  subtitle={`Actual YTD through ${formatPeriod(thisMonth, 'short')} vs full-year budget · by category`}
                />
                <Card.Section>
                  <DashboardSpendGroupBarChart
                    data={yearlyExpenseItemsBarData}
                    caption={`Yearly items — YTD ${formatPeriod(thisMonth)} vs budget`}
                    showValuesAboveBars
                  />
                </Card.Section>
              </Card>
              <Card padded={false}>
                <Card.Header
                  title="Yearly budget"
                  subtitle={
                    <>
                      Full {thisMonth.year} totals from Budget vs Reforecast (saved snapshot). Does not
                      change when you move the header period — uses latest transaction month for the
                      reforecast blend.
                    </>
                  }
                />
                <Card.Section>
                  {yearlyBudgetCompareError ? (
                    <StatusPanel
                      kind="error"
                      message="Couldn’t load yearly budget comparison"
                      detail={
                        yearlyBudgetCompareError instanceof Error
                          ? yearlyBudgetCompareError.message
                          : undefined
                      }
                    />
                  ) : yearlyFYActualsQ.isLoading ||
                    reforecastYearDashQ.isLoading ||
                    !yearlyBudgetVsReforecast ? (
                    <StatusPanel kind="loading" message="Loading yearly totals…" />
                  ) : (
                    <DashboardYearlyTwoBarChart
                      bars={[
                        {
                          key: 'year-budget',
                          label: 'Total year budget',
                          value: yearlyBudgetVsReforecast.budget,
                        },
                        {
                          key: 'year-reforecast',
                          label: 'Reforecast projected',
                          value: yearlyBudgetVsReforecast.reforecast,
                        },
                      ]}
                      caption={`Yearly bucket ${thisMonth.year}`}
                    />
                  )}
                </Card.Section>
              </Card>
            </section>
          )}

          <section className="col-span-1 md:col-span-2 xl:col-span-3">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-label uppercase text-gray-500">
                  Assumptions snapshot
                </div>
                <div className="text-caption text-gray-500">
                  FY {thisMonth.year} — same waterfalls as Budget Assumptions
                </div>
              </div>
              <Link
                to={`/assumptions/${thisMonth.year}`}
                className="text-xs font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
              >
                Edit assumptions →
              </Link>
            </div>
            {assumptionsWf.error ? (
              <StatusPanel
                kind="error"
                message="Couldn’t load assumptions waterfalls"
                detail={
                  assumptionsWf.error instanceof Error
                    ? assumptionsWf.error.message
                    : undefined
                }
              />
            ) : assumptionsWf.loading ? (
              <StatusPanel kind="loading" message="Loading assumptions charts…" />
            ) : assumptionsWf.projWaterfall && assumptionsWf.actualWaterfall ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <WaterfallChart
                    waterfall={assumptionsWf.projWaterfall}
                    caption="Projection"
                  />
                </Card>
                <Card>
                  <WaterfallChart
                    waterfall={assumptionsWf.actualWaterfall}
                    caption="Actual"
                  />
                </Card>
              </div>
            ) : null}
          </section>

          <ActualSavingsRateKpi
            year={thisMonth.year}
            pct={assumptionsWf.actualSavingsRatePct}
            loading={assumptionsWf.loading}
            error={assumptionsWf.error}
          />

          {nw && (
            <NetWorthCard nw={nw} thisMonth={thisMonth} />
          )}

          <GoalsCard
            goals={settingsQ.data?.goals ?? []}
            onSave={async (goals) => {
              if (!household) return;
              await saveHouseholdSettings({
                household_id: household.id,
                settings: { goals },
              });
              qc.invalidateQueries({ queryKey: ['hh-settings', household.id] });
            }}
          />
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------

function ActualSavingsRateKpi({
  year,
  pct,
  loading,
  error,
}: {
  year: number;
  pct: number | null;
  loading: boolean;
  error: unknown;
}) {
  const { hideIncomeAssets } = usePrivacyMode();

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-label uppercase text-gray-500">Actual savings rate</div>
          <div className="mt-0.5 text-caption text-gray-500">
            Actual savings ÷ actual income (Assumptions · FY {year})
          </div>
        </div>
        <Link
          to={`/assumptions/${year}`}
          className="shrink-0 text-xs font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
        >
          Details →
        </Link>
      </div>
      <div className="mt-4 text-3xl font-bold tabular-nums text-navy-900">
        {error ? (
          <span className="text-base font-normal text-gray-400">—</span>
        ) : loading ? (
          <span className="text-base font-normal text-gray-400">…</span>
        ) : hideIncomeAssets ? (
          <span className="text-gray-400">{PRIVACY_TEXT_PLACEHOLDER}</span>
        ) : pct != null ? (
          fmtPct(pct * 100, { decimals: 1 })
        ) : (
          '—'
        )}
      </div>
    </Card>
  );
}

function ProgressCard(props: {
  title: string;
  subtitle: string;
  actual: number;
  budget: number;
  actualLabel: string;
  budgetLabel: string;
  /** True when "actual > budget" is GOOD (income/savings). Default false. */
  higherIsBetter?: boolean;
  /** Mask dollar amounts when privacy toggle is on (income/savings cards). */
  privacySensitive?: boolean;
}) {
  const {
    title,
    subtitle,
    actual,
    budget,
    actualLabel,
    budgetLabel,
    higherIsBetter,
    privacySensitive,
  } = props;
  const { hideIncomeAssets } = usePrivacyMode();
  const mask = !!(privacySensitive && hideIncomeAssets);
  const $ = (n: number) => maskUsd(hideIncomeAssets, n, !!privacySensitive);

  const variance = actual - budget;
  const pct = budget !== 0 ? (variance / Math.abs(budget)) * 100 : null;
  const flipForColor = higherIsBetter ? -variance : variance;
  const ratio = budget > 0 ? Math.min(actual / budget, 1.5) : 0;

  const onTrack = higherIsBetter ? actual >= budget : actual <= budget;
  const barColor = onTrack ? 'bg-pos' : 'bg-neg';

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-label uppercase text-gray-500">{title}</div>
          <div className="mt-0.5 text-caption text-gray-500">{subtitle}</div>
        </div>
        <Badge tone={mask ? 'neutral' : onTrack ? 'pos' : 'neg'} dot>
          {mask ? '—' : onTrack ? 'On track' : 'Over'}
        </Badge>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            {actualLabel}
          </div>
          <div className="text-2xl font-bold tabular-nums text-navy-900">
            {$(actual)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            {budgetLabel}
          </div>
          <div className="text-base tabular-nums text-gray-600">{$(budget)}</div>
        </div>
      </div>
      {/* Tiny progress bar; capped at 150% so over-runs are visually distinct. */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
        <div
          className={`h-full ${mask ? 'bg-gray-300' : barColor}`}
          style={{ width: `${mask ? 0 : Math.max(2, ratio * 100)}%` }}
        />
      </div>
      <div className={`mt-1.5 text-xs tabular-nums ${mask ? 'text-gray-400' : varianceClass(flipForColor)}`}>
        {mask ? (
          PRIVACY_TEXT_PLACEHOLDER
        ) : (
          <>
            {variance >= 0 ? '+' : '−'}
            {fmtUsd(Math.abs(variance))}
            {pct != null && <> ({fmtPct(higherIsBetter ? -pct : pct)})</>}
          </>
        )}
      </div>
    </Card>
  );
}

interface NetWorthSummary {
  cur: { assets: number; liab: number; net: number };
  prior: { assets: number; liab: number; net: number };
  soy: { assets: number; liab: number; net: number };
  series: ReturnType<typeof netWorthSeries>;
}

function NetWorthCard({ nw, thisMonth }: { nw: NetWorthSummary; thisMonth: Period }) {
  const { hideIncomeAssets } = usePrivacyMode();
  const $ = (n: number) => maskUsd(hideIncomeAssets, n, true);

  const dMonth = nw.cur.net - nw.prior.net;
  const dYear = nw.cur.net - nw.soy.net;
  const dMonthPct =
    nw.prior.net !== 0 ? (dMonth / Math.abs(nw.prior.net)) * 100 : null;
  const dYearPct = nw.soy.net !== 0 ? (dYear / Math.abs(nw.soy.net)) * 100 : null;

  const firstRealIdx = nw.series.findIndex(
    (s) => s.assets !== 0 || s.liabilities !== 0,
  );
  const chartSeries = firstRealIdx >= 0 ? nw.series.slice(firstRealIdx) : nw.series;
  const chartPoints = chartSeries.map((s) => ({
    label: formatPeriod(s.period, 'short'),
    value: s.net,
  }));

  return (
    <Card className="md:col-span-2">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-label uppercase text-gray-500">Net Worth</div>
          <div className="mt-0.5 text-caption text-gray-500">
            as of {formatPeriod(thisMonth, 'short')} · 24-month trend
          </div>
        </div>
        <Link
          to="/balance-sheet"
          className="text-xs font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
        >
          Edit balance sheet →
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-bold tabular-nums text-navy-900">
            {$(nw.cur.net)}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
            <span>
              <span className="text-gray-400">M:&nbsp;</span>
              <span className={hideIncomeAssets ? 'text-gray-400' : varianceClass(-dMonth)}>
                {hideIncomeAssets ? (
                  PRIVACY_TEXT_PLACEHOLDER
                ) : (
                  <>
                    {dMonth >= 0 ? '+' : '−'}
                    {fmtUsd(Math.abs(dMonth))}
                    {dMonthPct != null && <> ({fmtPct(dMonthPct)})</>}
                  </>
                )}
              </span>
            </span>
            <span>
              <span className="text-gray-400">YTD:&nbsp;</span>
              <span className={hideIncomeAssets ? 'text-gray-400' : varianceClass(-dYear)}>
                {hideIncomeAssets ? (
                  PRIVACY_TEXT_PLACEHOLDER
                ) : (
                  <>
                    {dYear >= 0 ? '+' : '−'}
                    {fmtUsd(Math.abs(dYear))}
                    {dYearPct != null && <> ({fmtPct(dYearPct)})</>}
                  </>
                )}
              </span>
            </span>
            <span className="col-span-2 text-gray-400">
              Assets {$(nw.cur.assets)} · Liabilities {$(nw.cur.liab)}
            </span>
          </div>
        </div>
        {hideIncomeAssets ? (
          <div
            className="flex h-20 w-full max-w-[400px] items-center justify-center rounded-md border border-dashed border-navy-200 bg-navy-50 text-caption text-gray-400 md:h-[80px]"
            aria-hidden
          >
            Trend hidden
          </div>
        ) : (
          <Sparkline points={chartPoints} width={400} height={80} />
        )}
      </div>
    </Card>
  );
}


function GoalsCard({
  goals,
  onSave,
}: {
  goals: string[];
  onSave: (goals: string[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(goals.join('\n'));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(goals.join('\n'));
  }, [goals, editing]);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-label uppercase text-gray-500">Goals</div>
        <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Cancel' : 'Edit'}
        </Button>
      </div>
      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(4, draft.split('\n').length)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
            placeholder={'One goal per line, e.g.\nPay for college\nRetire comfortably'}
          />
          <Button
            onClick={async () => {
              setBusy(true);
              try {
                const next = draft
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean);
                await onSave(next);
                setEditing(false);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="mt-2"
            size="sm"
          >
            Save
          </Button>
        </>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
          {goals.length === 0 ? (
            <li className="text-gray-400">No goals yet — click Edit.</li>
          ) : (
            goals.map((g, i) => (
              <li key={i} className="flex">
                <span className="mr-2 mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                <span>{g}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </Card>
  );
}
