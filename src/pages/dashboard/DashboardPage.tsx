/**
 * Dashboard — Phase 5 (restyled May 2026 to Truitt Finance Design System v1.0).
 *
 * The home page. Section order (per DASHBOARD_SPEC §3):
 *   1. Opening sentence
 *   2. Hero 3-up KPI strip (This month · Savings rate · YTD)
 *   3. Needs your attention (3-up callouts)
 *   4. Spending (Top categories + Monthly trend)
 *   5. Cashflow & Bills (YTD by group + Bills quick-links)
 *   6. Yearly bucket (By category + Budget vs reforecast)
 *   7. Balance sheet allocation (donut + legend)
 *   8. Assumptions snapshot (projection + actual waterfalls)
 *   9. Plans (Upcoming trips + Goals)
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
import { fetchBills } from '@/api/bills';
import { fetchTrips } from '@/api/trips';
import {
  fetchAllocations,
  ALLOCATION_CATEGORIES,
  CATEGORY_LABELS,
  type AllocationCategory,
} from '@/api/bsAllocations';
import { fetchTransactionCountSummary } from '@/api/transactions';
import {
  effectiveValuesAt,
  periodToBsMonth,
} from '@/features/balance-sheet/effective';
import { fmtUsd, fmtPct, fmtMoney, varianceClass } from '@/lib/money';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { maskUsd, PRIVACY_TEXT_PLACEHOLDER } from '@/lib/privacyMoney';
import {
  formatPeriod,
  shiftPeriod,
  periodKey,
  type Period,
} from '@/lib/period';
import { useReforecastDraftStatus } from '@/lib/useReforecastDraftStatus';
import { categoryColorHex } from '@/components/ds/CategoryChip';
import { HorizontalCategoryBars } from '@/components/HorizontalCategoryBars';
import { MonthlyTrendBars } from '@/components/MonthlyTrendBars';
import { VerticalGroupedBars } from '@/components/VerticalGroupedBars';
import { DonutChart } from '@/components/DonutChart';
import { BillsQuickLinks } from '@/components/BillsQuickLinks';
import { TripsQuickLinks } from '@/components/TripsQuickLinks';
import { StatusPanel } from '@/components/StatusPanel';
import { WaterfallChart } from '@/components/WaterfallChart';
import { Badge, Button, Card } from '@/components/ds';
import { useAssumptionsWaterfalls } from '@/features/assumptions/useAssumptionsWaterfalls';
import {
  buildSpendReport,
  yearlySpendCategoriesOnly,
  canonicalSpendGroup,
  type SpendGroup,
} from '@/features/reports/grouping';
import {
  reforecastProjectedGrandTotal,
  sumActualYtdThroughMonth,
  sumBudgetFullYearForCategory,
  sumSpendBudgetYearTotal,
} from '@/features/budget/reforecastProjectedGrand';
import { SectionTitle } from './SectionTitle';
import { AttentionInbox, type AttentionSignal } from './AttentionInbox';

const DASHBOARD_SPEND_GROUP_LABEL: Record<SpendGroup, string> = {
  'Rent & House Maintenance': 'Rent & utilities',
  'Food & Car': 'Food & car',
  Other: 'Other',
  Yearly: 'Yearly',
};

const DS_ALLOC_COLORS: Record<AllocationCategory, string> = {
  us_stocks: '#243460',
  intl_stocks: '#3b559a',
  fixed_income: '#c9a84c',
  real_estate: '#1e7e5a',
  cash: '#7a8aa8',
};

function compactUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return '$' + fmtMoney(n / 1_000_000, { decimals: 2 }) + 'M';
  if (abs >= 1_000) return '$' + fmtMoney(n / 1_000) + 'K';
  return '$' + fmtMoney(n);
}

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

  // ── core queries ────────────────────────────────────────────────────
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

  const billsQ = useQuery({
    queryKey: ['bills', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBills(household!.id),
  });

  const tripsQ = useQuery({
    queryKey: ['trips', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchTrips(household!.id),
  });

  const allocQ = useQuery({
    queryKey: ['bs-allocations', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchAllocations(household!.id),
  });

  const uncatQ = useQuery({
    queryKey: ['txn-count-summary', schemeQ.data],
    enabled: !!schemeQ.data,
    queryFn: () =>
      fetchTransactionCountSummary({ filters: {}, schemeId: schemeQ.data! }),
  });

  const assumptionsWf = useAssumptionsWaterfalls(thisMonth.year, thisMonth);
  const { hasDrafts: reforecastHasDrafts } = useReforecastDraftStatus();

  // ── yearly budget queries ────────────────────────────────────────────
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

  const yearlyBudgetCompareError = reforecastYearDashQ.error ?? yearlyFYActualsQ.error;

  const reforecastAsOfSystem = useMemo(() => {
    const lp = defaultPeriod.period;
    const y = thisMonth.year;
    if (y < lp.year) return 12;
    if (y > lp.year) return 0;
    return lp.month;
  }, [defaultPeriod.period, thisMonth.year]);

  // ── 6-month spend trend ────────────────────────────────────────────
  const trailing6 = useMemo(() => {
    const out: Period[] = [];
    for (let i = 5; i >= 0; i--) out.push(shiftPeriod(thisMonth, -i));
    return out;
  }, [thisMonth]);

  const monthlyActuals6Q = useQuery({
    queryKey: [
      'dashboard-6mo-actuals',
      household?.id,
      schemeQ.data,
      periodKey(trailing6[0]),
      periodKey(thisMonth),
    ],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: trailing6[0],
        to: thisMonth,
      }),
  });

  // ── derived calcs ────────────────────────────────────────────────────
  const calc = useMemo(() => {
    if (!dashQ.data) return null;
    const d = dashQ.data;
    const monthSums = sumByGroup({ rows: d.monthlyRows, categories: d.categories, periods: [d.thisMonth] });
    const ytdSums = sumByGroup({ rows: d.monthlyRows, categories: d.categories, periods: d.ytd });
    const monthBudget = rollupBudget({ rows: d.budgetRows, categories: d.categories, periods: [d.thisMonth] });
    const ytdBudget = rollupBudget({ rows: d.budgetRows, categories: d.categories, periods: d.ytd });
    return { monthSums, ytdSums, monthBudget, ytdBudget };
  }, [dashQ.data]);

  // ── top categories (current month) ──────────────────────────────────
  const topCategories = useMemo(() => {
    if (!dashQ.data) return [];
    const d = dashQ.data;
    const lookup = actualsToLookup(d.monthlyRows);
    const pk = periodKey(thisMonth);
    return d.categories
      .filter((c) => canonicalSpendGroup(c.group_name) != null)
      .map((c) => ({
        key: c.id,
        label: c.name,
        value: lookup.get(`${c.id}|${pk}`) ?? 0,
        color: c.color_override ?? categoryColorHex(c.name),
      }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [dashQ.data, thisMonth]);

  // ── spend trend 6 months ────────────────────────────────────────────
  const spendTrend6 = useMemo(() => {
    if (!monthlyActuals6Q.data || !dashQ.data) return [];
    const lookup = actualsToLookup(monthlyActuals6Q.data);
    const spendCatIds = new Set(
      dashQ.data.categories
        .filter((c) => canonicalSpendGroup(c.group_name) != null)
        .map((c) => c.id),
    );
    return trailing6.map((p) => {
      let total = 0;
      const pk = periodKey(p);
      for (const cid of spendCatIds) {
        total += lookup.get(`${cid}|${pk}`) ?? 0;
      }
      const isCurrent = p.year === thisMonth.year && p.month === thisMonth.month;
      return {
        key: pk,
        label: formatPeriod(p, 'short').split(' ')[0],
        value: total,
        current: isCurrent,
      };
    });
  }, [monthlyActuals6Q.data, dashQ.data, trailing6, thisMonth]);

  // ── YTD by group (3 groups, no Yearly) ──────────────────────────────
  const ytdGroups3 = useMemo(() => {
    if (!dashQ.data) return [];
    return spendGroupBarSeries(dashQ.data, dashQ.data.ytd).filter(
      (g) => g.key !== 'Yearly',
    );
  }, [dashQ.data]);

  // ── yearly expense items ────────────────────────────────────────────
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

  // ── yearly budget vs reforecast ──────────────────────────────────────
  const yearlyBudgetVsReforecast = useMemo(() => {
    if (!dashQ.data || yearlyFYActualsQ.data === undefined || reforecastYearDashQ.data === undefined) return null;
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
  }, [dashQ.data, yearlyFYActualsQ.data, reforecastYearDashQ.data, thisMonth.year, reforecastAsOfSystem]);

  // ── BS allocation donut ──────────────────────────────────────────────
  const allocDonutSlices = useMemo(() => {
    const items = itemsQ.data ?? [];
    const values = valuesQ.data ?? [];
    const allocs = allocQ.data ?? [];
    if (items.length === 0) return [];

    const curIso = periodToBsMonth(thisMonth);
    const eff = effectiveValuesAt(values, curIso);

    const totals: Record<AllocationCategory, number> = {
      us_stocks: 0,
      intl_stocks: 0,
      fixed_income: 0,
      real_estate: 0,
      cash: 0,
    };

    for (const item of items) {
      if (!item.is_active || item.type !== 'asset') continue;
      const balance = eff.get(item.id);
      if (balance == null) continue;
      const itemAllocs = allocs.filter((a) => a.item_id === item.id);
      if (itemAllocs.length === 0) {
        totals.cash += balance;
        continue;
      }
      for (const a of itemAllocs) {
        totals[a.category] += balance * (a.percentage / 100);
      }
    }

    return ALLOCATION_CATEGORIES.map((cat) => ({
      key: cat,
      label: CATEGORY_LABELS[cat],
      value: Math.round(totals[cat]),
      color: DS_ALLOC_COLORS[cat],
    })).filter((s) => s.value > 0);
  }, [itemsQ.data, valuesQ.data, allocQ.data, thisMonth]);

  const allocTotal = allocDonutSlices.reduce((s, i) => s + i.value, 0);

  // ── attention inbox signals ──────────────────────────────────────────
  const attentionSignals = useMemo(() => {
    const signals: AttentionSignal[] = [];
    const uncat = uncatQ.data?.uncategorized ?? 0;
    if (uncat > 0) {
      signals.push({
        key: 'uncategorized',
        tone: 'warn',
        title: `${uncat} uncategorized`,
        detail: `Transaction${uncat === 1 ? '' : 's'} without a category`,
        cta: 'Categorize',
        to: '/transactions',
      });
    }
    if (calc && calc.ytdSums.yearlySpend > calc.ytdBudget.yearlySpend) {
      signals.push({
        key: 'yearly-over',
        tone: 'neg',
        title: 'Yearly bucket over',
        detail: 'YTD yearly spend exceeds budget',
        cta: 'View details',
        to: '/reports/balance-sheet',
      });
    }
    if (reforecastHasDrafts) {
      signals.push({
        key: 'reforecast-drafts',
        tone: 'info',
        title: 'Unsaved reforecast',
        detail: 'Draft edits waiting to be saved',
        cta: 'Open reforecast',
        to: '/reforecast',
      });
    }
    return signals;
  }, [uncatQ.data, calc, reforecastHasDrafts]);

  // ── loading / error ──────────────────────────────────────────────────
  const loading =
    schemeQ.isLoading || dashQ.isLoading || itemsQ.isLoading || valuesQ.isLoading || settingsQ.isLoading;
  const firstError = schemeQ.error ?? dashQ.error ?? itemsQ.error ?? valuesQ.error ?? settingsQ.error;

  const { hideIncomeAssets } = usePrivacyMode();
  const $ = (n: number, sensitive = false) => maskUsd(hideIncomeAssets, n, sensitive);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div className="space-y-8">
      {/* ── §1 Opening sentence ─────────────────────────────────────── */}
      <p className="text-body-base text-gray-500">
        Sunday-morning view. Anchored on{' '}
        <span className="font-medium text-gray-700">{formatPeriod(thisMonth)}</span>
        — matches the period in the header.
      </p>

      {firstError ? (
        <StatusPanel
          kind="error"
          message="Couldn't load dashboard"
          detail={firstError instanceof Error ? firstError.message : undefined}
        />
      ) : loading ? (
        <StatusPanel kind="loading" message="Loading dashboard…" />
      ) : (
        <>
          {/* ── §2 Hero 3-up KPI strip ────────────────────────────── */}
          {calc && (
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <HeroThisMonth
                actual={calc.monthSums.spend}
                budget={calc.monthBudget.spend}
                period={thisMonth}
              />
              <SavingsRateCard
                pct={assumptionsWf.actualSavingsRatePct}
                year={thisMonth.year}
                loading={assumptionsWf.loading}
                error={assumptionsWf.error}
              />
              <YtdCard
                actual={calc.ytdSums.spend}
                budget={calc.ytdBudget.spend}
                year={thisMonth.year}
              />
            </section>
          )}

          {/* ── §3 Needs your attention ───────────────────────────── */}
          {attentionSignals.length > 0 && (
            <section>
              <SectionTitle
                kicker="Inbox"
                title="Needs your attention"
              />
              <AttentionInbox signals={attentionSignals} />
            </section>
          )}

          {/* ── §4 Spending ───────────────────────────────────────── */}
          {dashQ.data && (
            <section>
              <SectionTitle
                kicker="Spending"
                title="Where the money goes"
                subtitle={`${formatPeriod(thisMonth, 'short')} ${thisMonth.year}`}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card padded={false}>
                  <Card.Header
                    title="Top categories"
                    subtitle={formatPeriod(thisMonth, 'short')}
                  />
                  <Card.Section>
                    <HorizontalCategoryBars items={topCategories} />
                  </Card.Section>
                </Card>
                <Card padded={false}>
                  <Card.Header
                    title="Monthly spend"
                    subtitle="Last 6 months"
                  />
                  <Card.Section>
                    {monthlyActuals6Q.isLoading ? (
                      <StatusPanel kind="loading" message="Loading trend…" />
                    ) : (
                      <MonthlyTrendBars items={spendTrend6} />
                    )}
                  </Card.Section>
                </Card>
              </div>
            </section>
          )}

          {/* ── §5 Cashflow & Bills ───────────────────────────────── */}
          {dashQ.data && (
            <section>
              <SectionTitle
                kicker="Cashflow"
                title="Budget by group"
                subtitle={`Year to date · Jan–${formatPeriod(thisMonth, 'short')}`}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card padded={false}>
                  <Card.Header
                    title="By group · year to date"
                    subtitle={`Jan–${formatPeriod(thisMonth, 'short')} ${thisMonth.year}`}
                  />
                  <Card.Section>
                    <VerticalGroupedBars items={ytdGroups3} />
                  </Card.Section>
                </Card>
                <Card padded={false}>
                  <Card.Header
                    title="Bills · Quick links"
                    subtitle={`${billsQ.data?.filter((b) => b.is_active).length ?? 0} recurring · sorted by due day`}
                    action={
                      <Link
                        to="/bills"
                        className="text-xs font-medium text-navy-700 hover:text-navy-900"
                      >
                        Manage →
                      </Link>
                    }
                  />
                  {billsQ.isLoading ? (
                    <Card.Section>
                      <StatusPanel kind="loading" message="Loading bills…" />
                    </Card.Section>
                  ) : (
                    <BillsQuickLinks bills={billsQ.data ?? []} />
                  )}
                </Card>
              </div>
            </section>
          )}

          {/* ── §6 Yearly bucket ──────────────────────────────────── */}
          {dashQ.data && yearlyExpenseItemsBarData.length > 0 && (
            <section>
              <SectionTitle
                kicker="Yearly"
                title="Yearly bucket"
                subtitle="Insurance, property tax, subs, charity"
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card padded={false}>
                  <Card.Header
                    title="By category"
                    subtitle={`Actual YTD through ${formatPeriod(thisMonth, 'short')} vs full-year budget`}
                  />
                  <Card.Section>
                    <VerticalGroupedBars items={yearlyExpenseItemsBarData} />
                  </Card.Section>
                </Card>
                <Card padded={false}>
                  <Card.Header
                    title="Budget vs reforecast"
                    subtitle={`Full ${thisMonth.year} · uses latest transaction month for reforecast blend`}
                  />
                  <Card.Section>
                    {yearlyBudgetCompareError ? (
                      <StatusPanel
                        kind="error"
                        message="Couldn't load yearly totals"
                        detail={yearlyBudgetCompareError instanceof Error ? yearlyBudgetCompareError.message : undefined}
                      />
                    ) : yearlyFYActualsQ.isLoading || reforecastYearDashQ.isLoading || !yearlyBudgetVsReforecast ? (
                      <StatusPanel kind="loading" message="Loading yearly totals…" />
                    ) : (
                      <MonthlyTrendBars
                        items={[
                          { key: 'year-budget', label: 'Year budget', value: yearlyBudgetVsReforecast.budget },
                          {
                            key: 'year-reforecast',
                            label: 'Reforecast',
                            value: yearlyBudgetVsReforecast.reforecast,
                            current: true,
                          },
                        ]}
                      />
                    )}
                  </Card.Section>
                </Card>
              </div>
            </section>
          )}

          {/* ── §7 Balance sheet allocation ────────────────────────── */}
          {allocDonutSlices.length > 0 && (
            <section>
              <SectionTitle
                kicker="Position"
                title="Balance sheet allocation"
                subtitle={`Effective balances as of ${formatPeriod(thisMonth, 'short')}`}
                action={
                  <Link
                    to="/balance-sheet/allocation"
                    className="text-xs font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
                  >
                    BS Allocation →
                  </Link>
                }
              />
              <Card padded={false}>
                <div className="grid grid-cols-1 lg:grid-cols-5">
                  {/* donut */}
                  <div className="flex items-center justify-center bg-gray-50 px-6 py-8 lg:col-span-2">
                    {hideIncomeAssets ? (
                      <div className="flex h-[220px] w-[220px] items-center justify-center text-sm text-gray-400">
                        Hidden
                      </div>
                    ) : (
                      <DonutChart
                        items={allocDonutSlices}
                        size={220}
                        centerLabel="Total"
                        centerValue={compactUsd(allocTotal)}
                      />
                    )}
                  </div>
                  {/* legend table */}
                  <div className="px-6 py-5 lg:col-span-3">
                    <div className="space-y-3">
                      {allocDonutSlices
                        .sort((a, b) => b.value - a.value)
                        .map((s) => {
                          const pct = allocTotal > 0 ? (s.value / allocTotal) * 100 : 0;
                          return (
                            <div key={s.key}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block h-3 w-3 rounded-sm"
                                  style={{ backgroundColor: s.color }}
                                />
                                <span className="flex-1 text-sm font-medium text-navy-900">
                                  {s.label}
                                </span>
                                <span className="text-sm tabular-nums text-gray-600">
                                  {$(s.value, true)}
                                </span>
                                <span className="w-10 text-right text-sm tabular-nums text-gray-500">
                                  {hideIncomeAssets
                                    ? PRIVACY_TEXT_PLACEHOLDER
                                    : fmtPct(pct, { decimals: 1 })}
                                </span>
                              </div>
                              <div className="mt-1 ml-5 h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${hideIncomeAssets ? 0 : pct}%`,
                                    backgroundColor: s.color,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* ── §8 Assumptions snapshot ────────────────────────────── */}
          <section>
            <SectionTitle
              kicker="Plan"
              title="Assumptions snapshot"
              subtitle={`FY ${thisMonth.year}`}
              action={
                <Link
                  to={`/assumptions/${thisMonth.year}`}
                  className="text-xs font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
                >
                  Edit assumptions →
                </Link>
              }
            />
            {assumptionsWf.error ? (
              <StatusPanel
                kind="error"
                message="Couldn't load assumptions waterfalls"
                detail={assumptionsWf.error instanceof Error ? assumptionsWf.error.message : undefined}
              />
            ) : assumptionsWf.loading ? (
              <StatusPanel kind="loading" message="Loading assumptions charts…" />
            ) : assumptionsWf.projWaterfall && assumptionsWf.actualWaterfall ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <WaterfallChart waterfall={assumptionsWf.projWaterfall} caption="Projection" />
                </Card>
                <Card>
                  <WaterfallChart waterfall={assumptionsWf.actualWaterfall} caption="Actual" />
                </Card>
              </div>
            ) : null}
          </section>

          {/* ── §9 Plans — Trips + Goals ──────────────────────────── */}
          <section>
            <SectionTitle
              kicker="Plans"
              title="What's ahead"
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card padded={false}>
                <Card.Header
                  title="Upcoming trips"
                  action={
                    <Link
                      to="/trips"
                      className="rounded-full bg-gold-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-gold-600"
                    >
                      + Add trip
                    </Link>
                  }
                />
                {tripsQ.isLoading ? (
                  <Card.Section>
                    <StatusPanel kind="loading" message="Loading trips…" />
                  </Card.Section>
                ) : (
                  <TripsQuickLinks
                    trips={(tripsQ.data ?? []).map((t) => ({
                      id: t.id,
                      name: t.name,
                      start_date: t.start_date,
                      end_date: t.end_date,
                    }))}
                    todayIso={todayIso}
                  />
                )}
              </Card>
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
          </section>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Hero cards
// ════════════════════════════════════════════════════════════════════════

function HeroThisMonth({ actual, budget, period }: { actual: number; budget: number; period: Period }) {
  const variance = actual - budget;
  const pct = budget !== 0 ? (variance / Math.abs(budget)) * 100 : null;
  const onTrack = actual <= budget;
  const ratio = budget > 0 ? Math.min(actual / budget, 1.5) : 0;

  return (
    <Card className="border-gold-300 bg-gold-100/30 lg:col-span-2">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-label uppercase text-gray-500">This month</div>
          <div className="mt-0.5 text-caption text-gray-500">
            {formatPeriod(period, 'short')} · Spend vs budget
          </div>
        </div>
        <Badge tone={onTrack ? 'pos' : 'neg'} dot>
          {onTrack ? 'On track' : 'Over'}
        </Badge>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="kpi-display text-[36px] leading-none text-navy-900">
          {fmtUsd(actual)}
        </span>
        <span className="text-sm text-gray-500">/ {fmtUsd(budget)}</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-navy-100">
        <div
          className={`h-full rounded-full ${onTrack ? 'bg-pos' : 'bg-neg'}`}
          style={{ width: `${Math.max(2, ratio * 100)}%` }}
        />
      </div>
      <div className={`mt-1.5 text-xs font-semibold tabular-nums ${varianceClass(variance)}`}>
        {variance >= 0 ? '+' : '−'}
        {fmtUsd(Math.abs(variance))}
        {pct != null && <> ({fmtPct(pct)})</>}
      </div>
    </Card>
  );
}

function SavingsRateCard({
  pct,
  year,
  loading,
  error,
}: {
  pct: number | null;
  year: number;
  loading: boolean;
  error: unknown;
}) {
  const { hideIncomeAssets } = usePrivacyMode();

  return (
    <Card>
      <div className="text-label uppercase text-gray-500">Savings rate</div>
      <div className="mt-0.5 text-caption text-gray-500">
        Actual ÷ income · YTD {year}
      </div>
      <div className="mt-3 kpi-display text-[32px] leading-none text-navy-900">
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
      <div className="mt-2">
        <Link
          to={`/assumptions/${year}`}
          className="text-xs font-medium text-navy-700 hover:text-navy-900"
        >
          Details →
        </Link>
      </div>
    </Card>
  );
}

function YtdCard({ actual, budget, year }: { actual: number; budget: number; year: number }) {
  const onTrack = actual <= budget;
  const ratio = budget > 0 ? Math.min(actual / budget, 1.5) : 0;

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <div className="text-label uppercase text-gray-500">YTD</div>
        <Badge tone={onTrack ? 'pos' : 'neg'} dot>
          {onTrack ? 'On track' : 'Over'}
        </Badge>
      </div>
      <div className="mt-3 kpi-display text-[28px] leading-none text-navy-900">
        {fmtUsd(actual)}
      </div>
      <div className="mt-1 text-caption text-gray-500">
        of {fmtUsd(budget)} · {year}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
        <div
          className={`h-full rounded-full ${onTrack ? 'bg-pos' : 'bg-neg'}`}
          style={{ width: `${Math.max(2, ratio * 100)}%` }}
        />
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Goals card (unchanged)
// ════════════════════════════════════════════════════════════════════════

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
