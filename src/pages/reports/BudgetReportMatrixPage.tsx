/**
 * Budget matrix report — read-only Actual / Budget / Reforecast / variance views
 * with optional heatmap and sparklines (prototype Reports.html).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchSchemeCategories,
  fetchBudgetYear,
  fetchMonthlyActuals,
  budgetsToLookup,
  actualsToLookup,
  type ReportCategory,
  type BudgetLookup,
  type ActualLookup,
} from '@/api/reports';
import {
  fetchAllRevisedForYear,
  filterToAsOf,
  findMostRecentPriorSnapshot,
  revisedToLookup,
  type RevisedLookup,
} from '@/api/reforecast';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { useDefaultPeriod } from '@/lib/useDefaultPeriod';
import { fmtUsd, fmtUsdSigned, fmtPct } from '@/lib/money';
import { fullYear, periodKey, MONTH_NAMES_SHORT } from '@/lib/period';
import {
  canonicalSpendGroup,
  SPEND_GROUP_ORDER,
  type SpendGroup,
} from '@/features/reports/grouping';
import { BudgetMatrixSparkline } from '@/features/budget-matrix/widgets';
import { StatusPanel } from '@/components/StatusPanel';
import { Button, Card } from '@/components/ds';

const MONTHS = MONTH_NAMES_SHORT;

type MetricId = 'actual' | 'budget' | 'reforecast' | 'var-budget' | 'var-refc';

type MetricDef = {
  id: MetricId;
  label: string;
  hint: string;
  isVariance?: boolean;
};

const METRICS: MetricDef[] = [
  { id: 'actual', label: 'Actual', hint: 'Real spend (YTD through as-of)' },
  { id: 'budget', label: 'Budget', hint: 'Original plan' },
  { id: 'reforecast', label: 'Reforecast', hint: 'Actuals through as-of, then saved forecast' },
  { id: 'var-budget', label: 'Δ Actual–Budget', hint: 'How off was the plan', isVariance: true },
  { id: 'var-refc', label: 'Δ Actual–Reforecast', hint: 'Tracking the revised plan', isVariance: true },
];

const TWEAK_KEY = 'tf:budget-report-matrix-tweaks';

type RTweak = {
  density: 'compact' | 'comfortable';
  showHeatmap: boolean;
  showSparklines: boolean;
  highlightSubtotals: boolean;
};

const RTWEAK0: RTweak = {
  density: 'comfortable',
  showHeatmap: true,
  showSparklines: true,
  highlightSubtotals: true,
};

function loadRTweak(): RTweak {
  try {
    const raw = localStorage.getItem(TWEAK_KEY);
    if (!raw) return RTWEAK0;
    return { ...RTWEAK0, ...JSON.parse(raw) };
  } catch {
    return RTWEAK0;
  }
}

export function BudgetReportMatrixPage() {
  const household = useHousehold();
  const { period: appPeriod } = useAppPeriod();
  const defaultPeriod = useDefaultPeriod();

  const year = appPeriod.year;

  const asOfMonth = useMemo(() => {
    const lp = defaultPeriod.period;
    if (year < lp.year) return 12;
    if (year > lp.year) return 0;
    return lp.month;
  }, [defaultPeriod.period, year]);

  const months = useMemo(() => fullYear(year), [year]);

  const [metricId, setMetricId] = useState<MetricId>('actual');
  const [collapsed, setCollapsed] = useState<Partial<Record<SpendGroup, boolean>>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [tweaks, setTweaks] = useState<RTweak>(loadRTweak);

  useEffect(() => {
    localStorage.setItem(TWEAK_KEY, JSON.stringify(tweaks));
  }, [tweaks]);

  const metric = METRICS.find((m) => m.id === metricId)!;

  const schemeQ = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });

  const categoriesQ = useQuery({
    queryKey: ['scheme-categories', schemeQ.data],
    enabled: !!schemeQ.data,
    queryFn: () => fetchSchemeCategories(schemeQ.data!),
  });

  const budgetQ = useQuery({
    queryKey: ['budget-year', household?.id, year],
    enabled: !!household?.id,
    queryFn: () => fetchBudgetYear({ household_id: household!.id, year }),
  });

  const actualsQ = useQuery({
    queryKey: ['budget-report-actuals', household?.id, schemeQ.data, year],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: { year, month: 1 },
        to: { year, month: 12 },
      }),
  });

  const revisedAllQ = useQuery({
    queryKey: ['revised-all', household?.id, year],
    enabled: !!household?.id,
    queryFn: () => fetchAllRevisedForYear({ household_id: household!.id, year }),
  });

  const budgetLookup: BudgetLookup = useMemo(
    () => (budgetQ.data ? budgetsToLookup(budgetQ.data) : new Map()),
    [budgetQ.data],
  );
  const actualsLookup: ActualLookup = useMemo(
    () => (actualsQ.data ? actualsToLookup(actualsQ.data) : new Map()),
    [actualsQ.data],
  );

  const revisedLookup: RevisedLookup = useMemo(() => {
    const rows = revisedAllQ.data ?? [];
    let snap = asOfMonth > 0 ? filterToAsOf(rows, asOfMonth) : [];
    if (snap.length === 0 && asOfMonth > 0) snap = findMostRecentPriorSnapshot(rows, asOfMonth);
    return revisedToLookup(snap);
  }, [revisedAllQ.data, asOfMonth]);

  const spendCats: ReportCategory[] = useMemo(() => {
    if (!categoriesQ.data) return [];
    return categoriesQ.data.filter((c) => canonicalSpendGroup(c.group_name) !== null);
  }, [categoriesQ.data]);

  const budgetAmt = useCallback(
    (catId: string, month: number) =>
      budgetLookup.get(`${catId}|${periodKey({ year, month })}`) ?? null,
    [budgetLookup, year],
  );

  const actualAmt = useCallback(
    (catId: string, month: number) => {
      if (asOfMonth === 0 || month > asOfMonth) return null;
      const v = actualsLookup.get(`${catId}|${periodKey({ year, month })}`);
      return v ?? null;
    },
    [actualsLookup, asOfMonth, year],
  );

  const reforecastAmt = useCallback(
    (catId: string, month: number) => {
      if (asOfMonth === 0) {
        const k = `${catId}|${month}`;
        return revisedLookup.get(k) ?? budgetAmt(catId, month);
      }
      if (month <= asOfMonth) {
        return actualAmt(catId, month);
      }
      const k = `${catId}|${month}`;
      return revisedLookup.get(k) ?? budgetAmt(catId, month);
    },
    [asOfMonth, actualAmt, revisedLookup, budgetAmt],
  );

  const cellValue = useCallback(
    (catId: string, month: number): number | null => {
      switch (metricId) {
        case 'actual':
          return actualAmt(catId, month);
        case 'budget': {
          const b = budgetAmt(catId, month);
          return b == null ? null : b;
        }
        case 'reforecast': {
          const r = reforecastAmt(catId, month);
          return r == null ? null : r;
        }
        case 'var-budget': {
          if (asOfMonth === 0 || month > asOfMonth) return null;
          const a = actualAmt(catId, month);
          const b = budgetAmt(catId, month) ?? 0;
          if (a == null) return null;
          return a - b;
        }
        case 'var-refc': {
          if (asOfMonth === 0 || month > asOfMonth) return null;
          const a = actualAmt(catId, month);
          const r = reforecastAmt(catId, month);
          if (a == null || r == null) return null;
          return a - r;
        }
        default:
          return null;
      }
    },
    [metricId, actualAmt, budgetAmt, reforecastAmt, asOfMonth],
  );

  const heatmapMax = useMemo(() => {
    if (!metric.isVariance || !tweaks.showHeatmap) return 1;
    let max = 0;
    for (const c of spendCats) {
      for (let month = 1; month <= 12; month++) {
        const v = cellValue(c.id, month);
        if (v != null && Math.abs(v) > max) max = Math.abs(v);
      }
    }
    return max || 1;
  }, [spendCats, cellValue, metric.isVariance, tweaks.showHeatmap]);

  const kpi = useMemo(() => {
    let aT = 0;
    let bT = 0;
    let rT = 0;
    for (const c of spendCats) {
      for (let month = 1; month <= asOfMonth; month++) {
        const ak = `${c.id}|${periodKey({ year, month })}`;
        aT += actualsLookup.get(ak) ?? 0;
      }
      for (let month = 1; month <= 12; month++) {
        bT += budgetAmt(c.id, month) ?? 0;
        const rf = reforecastAmt(c.id, month) ?? 0;
        rT += rf;
      }
    }
    return { actualYTD: aT, budget: bT, reforecast: rT };
  }, [spendCats, asOfMonth, actualsLookup, budgetAmt, reforecastAmt, year]);

  const grandTotal = useMemo(() => {
    let s = 0;
    for (const c of spendCats) {
      for (let month = 1; month <= 12; month++) {
        const v = cellValue(c.id, month);
        if (v != null) s += v;
      }
    }
    return s;
  }, [spendCats, cellValue]);

  const dense = tweaks.density === 'compact';
  const rowH = dense ? 'min-h-8' : 'min-h-10';
  const cellFs = dense ? 'text-[12.5px]' : 'text-[13.5px]';
  const colMonthMin = dense ? 'min-w-[96px] w-[96px]' : 'min-w-[108px] w-[108px]';
  const colCat = 'min-w-[260px] w-[260px]';
  const colTot = dense ? 'min-w-[124px] w-[124px]' : 'min-w-[136px] w-[136px]';
  const colSpark = 'min-w-[96px] w-[96px]';

  const monthlyCats = spendCats.filter((c) => canonicalSpendGroup(c.group_name) !== 'Yearly');
  const yearlyCats = spendCats.filter((c) => canonicalSpendGroup(c.group_name) === 'Yearly');

  const sumRow = (catId: string) => {
    let s = 0;
    for (let month = 1; month <= 12; month++) {
      const v = cellValue(catId, month);
      if (v != null) s += v;
    }
    return s;
  };

  const groupSums = (cats: ReportCategory[]) =>
    months.map((_, i) => {
      const month = i + 1;
      let s = 0;
      for (const c of cats) {
        const v = cellValue(c.id, month);
        if (v != null) s += v;
      }
      return s;
    });

  const monthlySums = groupSums(monthlyCats);
  const yearlySums = groupSums(yearlyCats);
  const grandSums = months.map((_, i) => monthlySums[i]! + yearlySums[i]!);

  const loading =
    schemeQ.isLoading ||
    categoriesQ.isLoading ||
    budgetQ.isLoading ||
    actualsQ.isLoading ||
    revisedAllQ.isLoading ||
    defaultPeriod.loading;
  const err =
    schemeQ.error ?? categoriesQ.error ?? budgetQ.error ?? actualsQ.error ?? revisedAllQ.error;

  const exportCsv = () => {
    const header = ['Category', 'Group', ...MONTHS.map((m) => `${m} ${year}`), 'Total'];
    const lines = [header.join(',')];
    for (const c of spendCats) {
      const g = canonicalSpendGroup(c.group_name) ?? '';
      const cells = months.map((p) => {
        const v = cellValue(c.id, p.month);
        if (v == null) return '';
        return String(Math.round(v));
      });
      lines.push(
        [`"${c.name}"`, `"${g}"`, ...cells, String(Math.round(sumRow(c.id)))].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budget-report-${year}-${metricId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setToast('Exported CSV');
    window.setTimeout(() => setToast(null), 2000);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Link copied');
    } catch {
      setToast('Could not copy link');
    }
    window.setTimeout(() => setToast(null), 2000);
  };

  const overGrand = grandTotal > 0;

  return (
    <div className="min-w-0 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 max-w-[680px] items-start gap-3">
          <div className="mt-1 w-1 self-stretch rounded-full bg-gold-500" aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-[26px] font-extrabold tracking-tight text-navy-800">Budget report</h1>
              <span className="rounded-full bg-navy-100 px-2.5 py-1 text-xs font-bold tracking-wide text-navy-700">
                FY {year}
              </span>
              {asOfMonth > 0 && (
                <span className="text-xs font-medium text-gray-500">
                  Read-only · YTD through {MONTHS[asOfMonth - 1]}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">
              Compare plan vs reality across the year. Switch metrics for actuals, budget, your latest
              reforecast, or variance heatmaps.
            </p>
          </div>
        </div>
        <div className="relative min-w-[320px] shrink-0 overflow-hidden rounded-xl bg-navy-800 py-3.5 pl-5 pr-6 text-white shadow-md">
          <div className="absolute bottom-0 left-0 top-0 w-1 bg-gold-500" aria-hidden />
          <div className="text-[10.5px] font-bold uppercase tracking-widest text-gold-400">
            {metric.label} · Total
          </div>
          <div
            className={`mt-0.5 flex items-center gap-2 text-[28px] font-extrabold tabular-nums tracking-tight ${
              metric.isVariance ? (overGrand ? 'text-[#ff9d8e]' : 'text-[#7fdbb1]') : ''
            }`}
          >
            {metric.isVariance && grandTotal !== 0 && <span aria-hidden>{overGrand ? '▲' : '▼'}</span>}
            {metric.isVariance ? fmtUsdSigned(grandTotal) : fmtUsd(grandTotal)}
          </div>
          <div className="mt-1 text-[11.5px] text-white/55">
            {metric.isVariance
              ? metricId === 'var-budget'
                ? 'vs original budget'
                : 'vs reforecast'
              : `Jan – Dec ${year}`}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Actual YTD" value={fmtUsd(kpi.actualYTD)} sub={`Through ${asOfMonth > 0 ? MONTHS[asOfMonth - 1] : '—'}`} />
        <Tile label="Budget (full year)" value={fmtUsd(kpi.budget)} sub="Original plan" />
        <Tile label="Reforecast (full year)" value={fmtUsd(kpi.reforecast)} sub="Blend + saved forecast" accent="text-gold-600" />
        <Tile
          label="Reforecast vs budget"
          value={fmtUsdSigned(kpi.reforecast - kpi.budget)}
          sub={`${fmtPct(kpi.budget !== 0 ? ((kpi.reforecast - kpi.budget) / kpi.budget) * 100 : null)} vs plan`}
          accent={kpi.reforecast > kpi.budget ? 'text-neg' : 'text-pos'}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-[10px] border border-gray-200 bg-white px-3.5 py-2.5 shadow-xs print:hidden">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">View</span>
        <div className="flex flex-wrap rounded-lg bg-gray-100 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetricId(m.id)}
              className={`rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                metricId === m.id
                  ? 'bg-white text-navy-800 shadow-sm'
                  : 'text-gray-500 hover:text-navy-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-xs italic text-gray-500">{metric.hint}</span>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          Export CSV
        </Button>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void share()}>
          Share
        </Button>
      </div>

      {loading && (
        <div className="mt-6">
          <StatusPanel kind="loading" message="Loading…" />
        </div>
      )}
      {!loading && err && (
        <div className="mt-6">
          <StatusPanel kind="error" message="Couldn't load report." detail={(err as Error).message} />
        </div>
      )}

      {!loading && !err && spendCats.length === 0 && (
        <div className="mt-6">
          <StatusPanel kind="empty" message="No spend categories found." />
        </div>
      )}

      {!loading && !err && spendCats.length > 0 && (
        <Card padded={false} className="mt-4 overflow-hidden rounded-xl border-gray-200 shadow-sm">
          <div className="overflow-x-auto print:overflow-visible">
            <div
              className="inline-block min-w-full"
              style={{
                minWidth:
                  260 +
                  12 * (dense ? 96 : 108) +
                  (dense ? 124 : 136) +
                  (tweaks.showSparklines ? 96 : 0),
              }}
            >
              <div className="sticky top-0 z-[5] flex border-b-2 border-navy-200 bg-navy-50 print:relative">
                <div
                  className={`sticky left-0 z-[6] ${colCat} shrink-0 border-r-2 border-navy-200 px-[18px] py-3.5 text-[11px] font-bold uppercase tracking-wider text-navy-700`}
                >
                  Category
                </div>
                {months.map((p) => (
                  <div
                    key={periodKey(p)}
                    className={`${colMonthMin} shrink-0 border-r border-navy-100 px-3 py-3.5 text-right text-xs font-bold uppercase tracking-wide text-navy-700`}
                  >
                    {MONTHS[p.month - 1]}
                  </div>
                ))}
                <div
                  className={`${colTot} shrink-0 border-l-2 border-navy-200 bg-navy-100 px-3.5 py-3.5 text-right text-[11px] font-bold uppercase tracking-wider text-navy-800`}
                >
                  Total
                </div>
                {tweaks.showSparklines && (
                  <div
                    className={`${colSpark} shrink-0 px-3 py-3.5 text-right text-[11px] font-bold uppercase tracking-wide text-navy-500 print:hidden`}
                  >
                    Trend
                  </div>
                )}
              </div>

              {SPEND_GROUP_ORDER.map((group) => {
                const cats = spendCats
                  .filter((c) => canonicalSpendGroup(c.group_name) === group)
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
                if (cats.length === 0) return null;
                const isYearly = group === 'Yearly';
                const isCollapsed = collapsed[group];
                const sums = months.map((_, i) => {
                  const month = i + 1;
                  let s = 0;
                  for (const c of cats) {
                    const v = cellValue(c.id, month);
                    if (v != null) s += v;
                  }
                  return s;
                });
                const groupTot = sums.reduce((a, b) => a + b, 0);

                return (
                  <div key={group}>
                    <button
                      type="button"
                      onClick={() => setCollapsed((x) => ({ ...x, [group]: !x[group] }))}
                      className={`flex w-full border-b text-left ${isYearly ? 'border-gold-300 bg-gold-100' : 'bg-navy-100'}`}
                    >
                      <div
                        className={`sticky left-0 z-[4] ${colCat} shrink-0 border-r-2 px-[18px] py-2.5 text-[11.5px] font-bold uppercase tracking-wider ${
                          isYearly ? 'border-gold-300 text-gold-600' : 'border-navy-200 text-navy-700'
                        }`}
                      >
                        <span className={`mr-2 inline-block ${isCollapsed ? '-rotate-90' : ''}`}>▾</span>
                        {group}
                        {isYearly && (
                          <span className="ml-2 rounded-full bg-gold-500 px-1.5 py-px text-[9.5px] text-white">Yearly</span>
                        )}
                      </div>
                      {months.map((p) => (
                        <div
                          key={periodKey(p)}
                          className={`${colMonthMin} shrink-0 border-r ${isYearly ? 'border-gold-300' : 'border-navy-200'}`}
                        />
                      ))}
                      <div className={`${colTot} shrink-0 border-l-2 ${isYearly ? 'bg-gold-100' : 'bg-navy-100'}`} />
                      {tweaks.showSparklines && <div className={`${colSpark} shrink-0 print:hidden`} />}
                    </button>

                    {!isCollapsed &&
                      cats.map((c) => {
                        const rowVals = months.map((p) => cellValue(c.id, p.month));
                        const rowTot = sumRow(c.id);
                        return (
                          <div key={c.id} className={`group flex ${rowH} bg-white`}>
                            <div
                              className={`sticky left-0 z-[3] ${colCat} shrink-0 border-b border-gray-100 border-r-2 border-gray-200 bg-white px-[18px] text-[13.5px] font-medium text-navy-800`}
                            >
                              {c.name}
                            </div>
                            {months.map((p, i) => {
                              const v = rowVals[i];
                              const heat = heatStyles(v, !!metric.isVariance, tweaks.showHeatmap, heatmapMax);
                              return (
                                <div
                                  key={periodKey(p)}
                                  className={`${colMonthMin} flex shrink-0 items-center justify-end border-b border-r border-gray-100 px-3 tabular-nums ${cellFs} ${heat.bg} ${heat.fg} ${
                                    metric.isVariance ? 'font-semibold' : 'font-medium'
                                  }`}
                                >
                                  {v == null ? (
                                    isYearly && metricId !== 'actual' ? (
                                      ''
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )
                                  ) : metric.isVariance ? (
                                    fmtUsdSigned(v)
                                  ) : (
                                    fmtUsd(v)
                                  )}
                                </div>
                              );
                            })}
                            <div
                              className={`${colTot} flex shrink-0 items-center justify-end border-b border-gray-100 border-l-2 border-navy-200 bg-navy-50 px-3.5 text-[13.5px] font-bold tabular-nums ${
                                metric.isVariance
                                  ? rowTot > 0
                                    ? 'text-neg'
                                    : rowTot < 0
                                      ? 'text-pos'
                                      : 'text-gray-400'
                                  : 'text-navy-800'
                              }`}
                            >
                              {rowTot === 0 && rowVals.every((x) => x == null) ? (
                                <span className="text-gray-300">—</span>
                              ) : metric.isVariance ? (
                                fmtUsdSigned(rowTot)
                              ) : (
                                fmtUsd(rowTot)
                              )}
                            </div>
                            {tweaks.showSparklines && (
                              <div
                                className={`flex shrink-0 items-center justify-end border-b border-gray-100 px-3 print:hidden ${colSpark}`}
                              >
                                <BudgetMatrixSparkline values={rowVals} signed={!!metric.isVariance} />
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {tweaks.highlightSubtotals && (
                      <div
                        className={`flex ${rowH} border-b-2 ${isYearly ? 'border-gold-300 bg-gold-100' : 'border-navy-200 bg-navy-50'}`}
                      >
                        <div
                          className={`sticky left-0 z-[3] ${colCat} shrink-0 border-r-2 px-[18px] text-[13px] font-bold ${isYearly ? 'border-gold-300 text-gold-600' : 'text-navy-800'}`}
                        >
                          {group} subtotal
                        </div>
                        {sums.map((s, i) => (
                          <div
                            key={i}
                            className={`${colMonthMin} flex shrink-0 items-center justify-end border-r px-3 tabular-nums ${cellFs} font-bold ${
                              metric.isVariance
                                ? s > 0
                                  ? 'text-neg'
                                  : s < 0
                                    ? 'text-pos'
                                    : 'text-gray-400'
                                : isYearly
                                  ? 'text-gold-600'
                                  : 'text-navy-700'
                            }`}
                          >
                            {s === 0 ? <span className="text-gray-300">—</span> : metric.isVariance ? fmtUsdSigned(s) : fmtUsd(s)}
                          </div>
                        ))}
                        <div
                          className={`${colTot} flex shrink-0 items-center justify-end border-l-2 px-3.5 text-sm font-extrabold tabular-nums ${
                            metric.isVariance
                              ? groupTot > 0
                                ? 'text-neg'
                                : groupTot < 0
                                  ? 'text-pos'
                                  : 'text-gray-400'
                              : isYearly
                                ? 'text-gold-600'
                                : 'text-navy-800'
                          } ${isYearly ? 'bg-gold-300' : 'bg-navy-100'}`}
                        >
                          {metric.isVariance ? fmtUsdSigned(groupTot) : fmtUsd(groupTot)}
                        </div>
                        {tweaks.showSparklines && (
                          <div className={`flex shrink-0 items-center justify-end px-3 print:hidden ${colSpark} ${isYearly ? 'bg-gold-100' : 'bg-navy-50'}`}>
                            <BudgetMatrixSparkline values={sums} signed={!!metric.isVariance} bold />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <FooterRow
                label="Monthly Categories Total"
                values={monthlySums}
                total={monthlySums.reduce((a, b) => a + b, 0)}
                tone="navy"
                metric={metric}
                colCat={colCat}
                colMonthMin={colMonthMin}
                colTot={colTot}
                colSpark={colSpark}
                rowH={rowH}
                cellFs={cellFs}
                showSpark={tweaks.showSparklines}
              />
              <FooterRow
                label="Yearly Categories Total"
                values={yearlySums}
                total={yearlySums.reduce((a, b) => a + b, 0)}
                tone="gold"
                metric={metric}
                colCat={colCat}
                colMonthMin={colMonthMin}
                colTot={colTot}
                colSpark={colSpark}
                rowH={rowH}
                cellFs={cellFs}
                showSpark={tweaks.showSparklines}
              />
              <FooterRow
                label={`${metric.label} Total`}
                values={grandSums}
                total={grandTotal}
                tone="grand"
                metric={metric}
                colCat={colCat}
                colMonthMin={colMonthMin}
                colTot={colTot}
                colSpark={colSpark}
                rowH={rowH}
                cellFs={cellFs}
                showSpark={tweaks.showSparklines}
              />
            </div>
          </div>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-gray-500 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          {metric.isVariance && tweaks.showHeatmap ? (
            <>
              <HeatmapLegend />
              <span className="text-gray-400">Positive Δ = spent more than {metricId === 'var-budget' ? 'budget' : 'reforecast'}</span>
            </>
          ) : (
            <span>Trailing trend in last column · Collapse groups from headers</span>
          )}
        </div>
        <span className="text-gray-400">
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-3 print:hidden">
        <details className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-xs">
          <summary className="cursor-pointer font-semibold text-navy-700">Display options</summary>
          <div className="mt-2 flex flex-col gap-2 border-t pt-2">
            <label className="flex gap-2">
              Density
              <select
                className="rounded border border-gray-200 px-2 py-1"
                value={tweaks.density}
                onChange={(e) =>
                  setTweaks((t) => ({ ...t, density: e.target.value as RTweak['density'] }))
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tweaks.showHeatmap}
                onChange={(e) => setTweaks((t) => ({ ...t, showHeatmap: e.target.checked }))}
              />
              Heatmap on Δ metrics
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tweaks.showSparklines}
                onChange={(e) => setTweaks((t) => ({ ...t, showSparklines: e.target.checked }))}
              />
              Show sparklines
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tweaks.highlightSubtotals}
                onChange={(e) => setTweaks((t) => ({ ...t, highlightSubtotals: e.target.checked }))}
              />
              Highlight subtotals
            </label>
          </div>
        </details>
        <Link
          to={`/budget/${year}`}
          className="text-sm font-semibold text-navy-600 hover:text-navy-800"
        >
          ← Edit budget
        </Link>
      </div>

      {toast && (
        <div className="fixed bottom-7 left-1/2 z-[2000] -translate-x-1/2 rounded-full bg-navy-800 px-5 py-2 text-sm font-semibold text-white shadow-lg print:hidden">
          {toast}
        </div>
      )}
    </div>
  );
}

function heatStyles(
  v: number | null,
  isVariance: boolean,
  showHeatmap: boolean,
  heatmapMax: number,
): { bg: string; fg: string } {
  if (v == null || !isVariance || !showHeatmap) {
    return { bg: 'bg-transparent', fg: v == null ? 'text-gray-300' : 'text-navy-800' };
  }
  if (v === 0) return { bg: 'bg-gray-100', fg: 'text-gray-400' };
  const intensity = Math.min(1, Math.abs(v) / heatmapMax);
  if (v > 0) {
    if (intensity > 0.66) return { bg: 'bg-neg', fg: 'text-white' };
    if (intensity > 0.33) return { bg: 'bg-[#eab9b3]', fg: 'text-neg' };
    return { bg: 'bg-[#f3d4d0]', fg: 'text-neg' };
  }
  if (intensity > 0.66) return { bg: 'bg-pos', fg: 'text-white' };
  if (intensity > 0.33) return { bg: 'bg-[#bfe0ce]', fg: 'text-pos' };
  return { bg: 'bg-[#d0e8dc]', fg: 'text-pos' };
}

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[10px] border border-gray-200 bg-white px-4 py-3 shadow-xs">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums ${accent ?? 'text-navy-600'}`}>{value}</div>
      <div className="mt-1 text-[11.5px] text-gray-400">{sub}</div>
    </div>
  );
}

function HeatmapLegend() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold text-pos">Under</span>
      <span className="flex overflow-hidden rounded">
        <span className="h-2.5 w-3.5 bg-pos" />
        <span className="h-2.5 w-3.5 bg-[#bfe0ce]" />
        <span className="h-2.5 w-3.5 bg-[#d0e8dc]" />
        <span className="h-2.5 w-3.5 bg-gray-100" />
        <span className="h-2.5 w-3.5 bg-[#f3d4d0]" />
        <span className="h-2.5 w-3.5 bg-[#eab9b3]" />
        <span className="h-2.5 w-3.5 bg-neg" />
      </span>
      <span className="font-semibold text-neg">Over</span>
    </span>
  );
}

function FooterRow({
  label,
  values,
  total,
  tone,
  metric,
  colCat,
  colMonthMin,
  colTot,
  colSpark,
  rowH,
  cellFs,
  showSpark,
}: {
  label: string;
  values: number[];
  total: number;
  tone: 'navy' | 'gold' | 'grand';
  metric: MetricDef;
  colCat: string;
  colMonthMin: string;
  colTot: string;
  colSpark: string;
  rowH: string;
  cellFs: string;
  showSpark: boolean;
}) {
  const st =
    tone === 'grand'
      ? {
          bg: 'bg-navy-800',
          fg: 'text-white',
          br: 'border-navy-900',
          tb: 'bg-gold-500',
          tf: 'text-navy-900',
        }
      : tone === 'gold'
        ? { bg: 'bg-gold-100', fg: 'text-gold-600', br: 'border-gold-300', tb: 'bg-gold-300', tf: 'text-gold-600' }
        : { bg: 'bg-navy-100', fg: 'text-navy-800', br: 'border-navy-200', tb: 'bg-navy-200', tf: 'text-navy-800' };

  const over = total > 0;

  return (
    <div className={`flex border-t-2 ${st.br} ${st.bg} ${rowH}`}>
      <div
        className={`sticky left-0 z-[3] ${colCat} shrink-0 border-r-2 ${st.br} px-[18px] flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-wide ${st.fg} ${tone === 'grand' ? 'py-3 text-sm font-extrabold' : ''}`}
      >
        {tone === 'grand' && <span className="h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden />}
        {label}
      </div>
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex ${colMonthMin} shrink-0 items-center justify-end border-r px-3 tabular-nums ${cellFs} font-bold ${st.fg}`}
        >
          {v === 0 ? (
            <span className={tone === 'grand' ? 'text-white/30' : 'text-gray-300'}>—</span>
          ) : metric.isVariance ? (
            fmtUsdSigned(v)
          ) : (
            fmtUsd(v)
          )}
        </div>
      ))}
      <div
        className={`flex ${colTot} shrink-0 items-center justify-end border-l-2 px-3.5 tabular-nums font-extrabold ${
          tone === 'grand' ? 'border-gold-500 py-3 text-lg' : 'text-sm'
        } ${st.tb} ${tone === 'grand' && metric.isVariance ? (over ? 'text-[#ff9d8e]' : 'text-[#7fdbb1]') : st.tf}`}
      >
        {metric.isVariance ? fmtUsdSigned(total) : fmtUsd(total)}
      </div>
      {showSpark && (
        <div className={`flex shrink-0 items-center justify-end px-3 print:hidden ${colSpark} ${st.bg}`}>
          <BudgetMatrixSparkline values={values} signed={!!metric.isVariance} bold />
        </div>
      )}
    </div>
  );
}
