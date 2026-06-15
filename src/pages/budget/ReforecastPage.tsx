/**
 * Reforecast — matrix grid with locked actuals, editable forecasts, variance vs budget,
 * and persisted snapshots (`tf_revised_budgets`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  saveRevisedSnapshot,
  type RevisedLookup,
} from '@/api/reforecast';
import { usePersistentMap } from '@/lib/usePersistentMap';
import { notifyReforecastDraftChange } from '@/lib/useReforecastDraftStatus';
import { useDefaultPeriod } from '@/lib/useDefaultPeriod';
import { fmtUsd, fmtUsdSigned, fmtPct } from '@/lib/money';
import {
  fullYear,
  periodKey,
  shiftPeriod,
  MONTH_NAMES_SHORT,
  MONTH_NAMES_LONG,
  type Period,
} from '@/lib/period';
import {
  canonicalSpendGroup,
  SPEND_GROUP_ORDER,
  type SpendGroup,
} from '@/features/reports/grouping';
import { VarianceMiniBar } from '@/features/budget-matrix/widgets';
import { StatusPanel } from '@/components/StatusPanel';
import { Button, Card } from '@/components/ds';

const MONTHS = MONTH_NAMES_SHORT;
const TWEAK_KEY = 'tf:reforecast-matrix-tweaks';

type ReforecastTweaks = {
  density: 'compact' | 'comfortable';
  showProjectionKpi: boolean;
  highlightSubtotals: boolean;
  showVarianceBars: boolean;
};

const RTWEAK_DEFAULT: ReforecastTweaks = {
  density: 'comfortable',
  showProjectionKpi: true,
  highlightSubtotals: true,
  showVarianceBars: true,
};

function loadRTweaks(): ReforecastTweaks {
  try {
    const raw = localStorage.getItem(TWEAK_KEY);
    if (!raw) return RTWEAK_DEFAULT;
    return { ...RTWEAK_DEFAULT, ...JSON.parse(raw) };
  } catch {
    return RTWEAK_DEFAULT;
  }
}

function Toast({ msg }: { msg: string }) {
  return (
    <div className="fixed bottom-7 left-1/2 z-[2000] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
      <span className="inline-block h-3.5 w-3.5 rounded-full bg-pos" aria-hidden />
      {msg}
    </div>
  );
}

export function ReforecastPage() {
  const { year: yearParam } = useParams();
  const navigate = useNavigate();
  const household = useHousehold();
  const qc = useQueryClient();
  const defaultPeriod = useDefaultPeriod();

  const year = useMemo(() => {
    const y = Number(yearParam);
    return Number.isFinite(y) && y > 1900 ? y : new Date().getFullYear();
  }, [yearParam]);

  const asOfMonth = useMemo(() => {
    const lp = defaultPeriod.period;
    if (year < lp.year) return 12;
    if (year > lp.year) return 0;
    return lp.month;
  }, [defaultPeriod.period, year]);

  const months = useMemo(() => fullYear(year), [year]);

  const [tweaks, setTweaks] = useState<ReforecastTweaks>(loadRTweaks);
  useEffect(() => {
    localStorage.setItem(TWEAK_KEY, JSON.stringify(tweaks));
  }, [tweaks]);

  const [collapsed, setCollapsed] = useState<Partial<Record<SpendGroup, boolean>>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [fillPopover, setFillPopover] = useState<{
    catId: string;
    anchor: HTMLElement;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

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
    queryKey: ['monthly-actuals-yearly', household?.id, schemeQ.data, year],
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

  // Trailing 12 months of actuals ending at the as-of month (inclusive), used
  // to surface the same rolling 3 / 6 / 12-month averages as the Averages
  // report. This range can spill into the prior year, so it is fetched
  // separately from the in-year `actualsQ` above.
  const avgAnchor: Period = useMemo(
    () => ({ year, month: asOfMonth >= 1 ? asOfMonth : 12 }),
    [year, asOfMonth],
  );
  const avgFrom = useMemo(() => shiftPeriod(avgAnchor, -11), [avgAnchor]);
  const trailingActualsQ = useQuery({
    queryKey: [
      'reforecast-trailing-actuals',
      household?.id,
      schemeQ.data,
      avgAnchor.year,
      avgAnchor.month,
    ],
    enabled: !!household?.id && !!schemeQ.data && asOfMonth >= 1,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: avgFrom,
        to: avgAnchor,
      }),
  });

  const budgetLookup: BudgetLookup = useMemo(
    () => (budgetQ.data ? budgetsToLookup(budgetQ.data) : new Map()),
    [budgetQ.data],
  );
  const actualsLookup: ActualLookup = useMemo(
    () => (actualsQ.data ? actualsToLookup(actualsQ.data) : new Map()),
    [actualsQ.data],
  );

  const trailingLookup: ActualLookup = useMemo(
    () => (trailingActualsQ.data ? actualsToLookup(trailingActualsQ.data) : new Map()),
    [trailingActualsQ.data],
  );
  // 12 trailing months ending at (and including) the as-of month.
  const trailing12: Period[] = useMemo(() => {
    const out: Period[] = [];
    for (let i = 11; i >= 0; i--) out.push(shiftPeriod(avgAnchor, -i));
    return out;
  }, [avgAnchor]);

  const revisedSeedLookup: RevisedLookup = useMemo(() => {
    const rows = revisedAllQ.data ?? [];
    let snap = filterToAsOf(rows, asOfMonth);
    if (snap.length === 0) snap = findMostRecentPriorSnapshot(rows, asOfMonth);
    return revisedToLookup(snap);
  }, [revisedAllQ.data, asOfMonth]);

  const spendCats: ReportCategory[] = useMemo(() => {
    if (!categoriesQ.data) return [];
    return categoriesQ.data.filter((c) => canonicalSpendGroup(c.group_name) !== null);
  }, [categoriesQ.data]);

  const orderedCats = useMemo(() => {
    const out: ReportCategory[] = [];
    for (const g of SPEND_GROUP_ORDER) {
      out.push(
        ...spendCats
          .filter((c) => canonicalSpendGroup(c.group_name) === g)
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
      );
    }
    return out;
  }, [spendCats]);

  const draftKey =
    household && asOfMonth > 0
      ? `tf:reforecast-draft:${household.id}:${year}:${asOfMonth}`
      : null;
  const overridesStore = usePersistentMap(draftKey, { onChange: notifyReforecastDraftChange });
  const overrides = overridesStore.map;

  const budgetAmount = useCallback(
    (catId: string, month: number) =>
      budgetLookup.get(`${catId}|${periodKey({ year, month })}`) ?? 0,
    [budgetLookup, year],
  );

  // Rolling 3 / 6 / 12-month actual averages for a category, ending at the
  // as-of month. Mirrors the Averages report: sum the trailing N months of
  // actuals and divide by N.
  const rowAverages = useCallback(
    (catId: string) => {
      const sumLast = (n: number) => {
        const slice = trailing12.slice(-n);
        let total = 0;
        for (const p of slice) total += trailingLookup.get(`${catId}|${periodKey(p)}`) ?? 0;
        return total / slice.length;
      };
      return { avg3: sumLast(3), avg6: sumLast(6), avg12: sumLast(12) };
    },
    [trailing12, trailingLookup],
  );

  const getForecast = useCallback(
    (catId: string, month: number): number => {
      if (month <= asOfMonth) return 0;
      const k = `${catId}|${month}`;
      const o = overrides.get(k);
      if (o !== undefined) return o;
      return revisedSeedLookup.get(k) ?? budgetAmount(catId, month);
    },
    [asOfMonth, overrides, revisedSeedLookup, budgetAmount],
  );

  const setForecast = (catId: string, month: number, value: number) => {
    overridesStore.set(`${catId}|${month}`, value);
  };

  const resetDraftToSeed = () => {
    overridesStore.replace(new Map());
    showToast('Forecasts reset to budget / last snapshot');
  };

  const matchAllToBudget = () => {
    const next = new Map(overrides);
    for (const c of spendCats) {
      for (let m = asOfMonth + 1; m <= 12; m++) {
        next.set(`${c.id}|${m}`, budgetAmount(c.id, m));
      }
    }
    overridesStore.replace(next);
    showToast('All forecast months matched to original budget');
  };

  const extrapolateAllYtd = () => {
    const next = new Map(overrides);
    for (const c of spendCats) {
      const ytd = months
        .filter((p) => p.month <= asOfMonth)
        .reduce((s, p) => s + (actualsLookup.get(`${c.id}|${periodKey(p)}`) ?? 0), 0);
      const avg = asOfMonth > 0 ? Math.round(ytd / asOfMonth) : 0;
      for (let m = asOfMonth + 1; m <= 12; m++) {
        next.set(`${c.id}|${m}`, avg);
      }
    }
    overridesStore.replace(next);
    showToast('Extrapolated YTD run-rate to all forecast months');
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!household || asOfMonth < 1) return;
      const cells: Array<{ category_id: string; month: number; amount: number }> = [];
      for (const c of spendCats) {
        for (let m = asOfMonth + 1; m <= 12; m++) {
          cells.push({ category_id: c.id, month: m, amount: getForecast(c.id, m) });
        }
      }
      await saveRevisedSnapshot({
        household_id: household.id,
        year,
        as_of_month: asOfMonth,
        cells,
      });
    },
    onSuccess: () => {
      overridesStore.replace(new Map());
      qc.invalidateQueries({ queryKey: ['revised-all', household?.id, year] });
      showToast('Reforecast saved');
    },
    onError: (e: Error) => {
      showToast(e.message || 'Save failed');
    },
  });

  const exportCsv = () => {
    const header = ['Category', 'Group', ...MONTHS.map((m) => `${m} ${year}`), 'Projected', 'vs Budget'];
    const lines = [header.join(',')];
    for (const c of orderedCats) {
      const g = canonicalSpendGroup(c.group_name) ?? '';
      const cells = months.map((p) => {
        if (p.month <= asOfMonth) {
          const a = actualsLookup.get(`${c.id}|${periodKey(p)}`);
          return a == null || a === 0 ? '' : String(Math.round(a));
        }
        return String(Math.round(getForecast(c.id, p.month)));
      });
      const rowMetrics = rowMetricsForCategory(c, asOfMonth, actualsLookup, getForecast, budgetLookup, year);
      lines.push(
        [
          `"${c.name.replace(/"/g, '""')}"`,
          `"${g.replace(/"/g, '""')}"`,
          ...cells,
          String(Math.round(rowMetrics.projected)),
          String(Math.round(rowMetrics.variance)),
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reforecast-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Exported CSV');
  };

  const dense = tweaks.density === 'compact';
  const rowH = dense ? 'min-h-8' : 'min-h-10';
  const cellFs = dense ? 'text-[12.5px]' : 'text-[13.5px]';
  const colMonthMin = dense ? 'min-w-[96px] w-[96px]' : 'min-w-[108px] w-[108px]';
  const colCat = 'min-w-[260px] w-[260px]';
  const colTot = dense ? 'min-w-[120px] w-[120px]' : 'min-w-[132px] w-[132px]';
  const colVar = 'min-w-[110px] w-[110px]';
  const colAvg = dense ? 'min-w-[84px] w-[84px]' : 'min-w-[92px] w-[92px]';
  const colAvgPx = dense ? 84 : 92;
  const colEasy = 'min-w-[50px] w-[50px]';

  const firstForecastMonth = asOfMonth + 1;

  const grand = useMemo(() => {
    let actualYTD = 0;
    let forecastRem = 0;
    let budget = 0;
    for (const c of spendCats) {
      budget += months.reduce((s, p) => s + budgetAmount(c.id, p.month), 0);
      for (const p of months) {
        if (p.month <= asOfMonth) {
          actualYTD += actualsLookup.get(`${c.id}|${periodKey(p)}`) ?? 0;
        } else {
          forecastRem += getForecast(c.id, p.month);
        }
      }
    }
    const projected = actualYTD + forecastRem;
    const variance = projected - budget;
    const variancePct = budget !== 0 ? (variance / budget) * 100 : 0;
    return { actualYTD, forecastRem, projected, budget, variance, variancePct };
  }, [spendCats, months, asOfMonth, actualsLookup, getForecast, budgetAmount]);

  const monthlyCats = spendCats.filter((c) => canonicalSpendGroup(c.group_name) !== 'Yearly');
  const yearlyCats = spendCats.filter((c) => canonicalSpendGroup(c.group_name) === 'Yearly');

  const monthlyProjected = months.map((p) => {
    let s = 0;
    for (const c of monthlyCats) {
      if (p.month <= asOfMonth) s += actualsLookup.get(`${c.id}|${periodKey(p)}`) ?? 0;
      else s += getForecast(c.id, p.month);
    }
    return s;
  });
  const yearlyProjected = months.map((p) => {
    let s = 0;
    for (const c of yearlyCats) {
      if (p.month <= asOfMonth) s += actualsLookup.get(`${c.id}|${periodKey(p)}`) ?? 0;
      else s += getForecast(c.id, p.month);
    }
    return s;
  });
  const grandMonthly = monthlyProjected.map((v, i) => v + yearlyProjected[i]!);

  const sumAverages = useCallback(
    (cats: ReportCategory[]): [number, number, number] => {
      let a3 = 0;
      let a6 = 0;
      let a12 = 0;
      for (const c of cats) {
        const a = rowAverages(c.id);
        a3 += a.avg3;
        a6 += a.avg6;
        a12 += a.avg12;
      }
      return [a3, a6, a12];
    },
    [rowAverages],
  );
  const monthlyAvgTotals = useMemo(() => sumAverages(monthlyCats), [sumAverages, monthlyCats]);
  const yearlyAvgTotals = useMemo(() => sumAverages(yearlyCats), [sumAverages, yearlyCats]);
  const grandAvgTotals: [number, number, number] = [
    monthlyAvgTotals[0] + yearlyAvgTotals[0],
    monthlyAvgTotals[1] + yearlyAvgTotals[1],
    monthlyAvgTotals[2] + yearlyAvgTotals[2],
  ];

  const loading =
    schemeQ.isLoading ||
    categoriesQ.isLoading ||
    budgetQ.isLoading ||
    actualsQ.isLoading ||
    revisedAllQ.isLoading ||
    trailingActualsQ.isLoading ||
    defaultPeriod.loading;
  const firstError =
    schemeQ.error ??
    categoriesQ.error ??
    budgetQ.error ??
    actualsQ.error ??
    revisedAllQ.error ??
    trailingActualsQ.error;

  const noActualsYet = asOfMonth === 0;

  const varianceTone = grand.variance > 0 ? 'text-[#ff9d8e]' : 'text-[#7fdbb1]';

  return (
    <div className="min-w-0 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 max-w-[680px] items-start gap-3">
          <div className="mt-1 w-1 self-stretch rounded-full bg-gold-500" aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-[26px] font-extrabold tracking-tight text-navy-800">Reforecast</h1>
              <span className="rounded-full bg-navy-100 px-2.5 py-1 text-xs font-bold tracking-wide text-navy-700">
                FY {year}
              </span>
              {!noActualsYet && (
                <span className="text-xs font-medium text-gray-500">
                  Actuals through {MONTH_NAMES_LONG[asOfMonth - 1]} · Forecasting{' '}
                  {MONTH_NAMES_LONG[firstForecastMonth - 1]}–Dec
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">
              Adjust expectations as actuals arrive. Past months are locked to actuals; future months are your
              forecast. Use <strong className="font-semibold text-navy-700">Fill</strong> on a row for quick
              updates.
            </p>
          </div>
        </div>
        {tweaks.showProjectionKpi && !noActualsYet && (
          <div className="relative flex min-w-[360px] shrink-0 items-stretch gap-5 overflow-hidden rounded-xl bg-navy-800 py-3.5 pl-5 pr-6 text-white shadow-md">
            <div className="absolute bottom-0 left-0 top-0 w-1 bg-gold-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-gold-400">
                Projected {year} total
              </div>
              <div className="mt-0.5 text-[28px] font-extrabold tabular-nums tracking-tight">
                {fmtUsd(grand.projected)}
              </div>
              <div className="mt-1 text-[11.5px] text-white/55">
                <span className="tabular-nums">{fmtUsd(grand.actualYTD)}</span> actual ·{' '}
                <span className="tabular-nums">{fmtUsd(grand.forecastRem)}</span> forecast
              </div>
            </div>
            <div className="w-px bg-white/10" />
            <div className="min-w-[130px]">
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-white/50">
                vs Budget
              </div>
              <div className={`mt-0.5 flex items-center gap-1 text-[22px] font-extrabold tabular-nums ${varianceTone}`}>
                <span aria-hidden>{grand.variance > 0 ? '▲' : '▼'}</span>
                {fmtUsdSigned(grand.variance)}
              </div>
              <div className="mt-1 text-[11.5px] text-white/55">
                {fmtPct(grand.variancePct)} {grand.variance > 0 ? 'over' : 'under'}
              </div>
            </div>
          </div>
        )}
      </div>

      {!loading && !firstError && !noActualsYet && (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniKpi
            label="Actual YTD"
            value={fmtUsd(grand.actualYTD)}
            sub={`Jan – ${MONTHS[asOfMonth - 1]}`}
          />
          <MiniKpi
            label="Forecast remaining"
            value={fmtUsd(grand.forecastRem)}
            sub={`${MONTHS[firstForecastMonth - 1]} – Dec`}
          />
          <MiniKpi label="Original budget" value={fmtUsd(grand.budget)} sub={`FY ${year}`} />
          <MiniKpi
            label="Variance to budget"
            value={fmtUsdSigned(grand.variance)}
            sub={`${fmtPct(grand.variancePct)} ${grand.variance > 0 ? 'over' : 'under'}`}
            accentClass={grand.variance > 0 ? 'text-neg' : 'text-pos'}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-gray-200 bg-white px-3.5 py-2.5 shadow-xs">
        <Button variant="secondary" size="sm" onClick={matchAllToBudget} disabled={noActualsYet}>
          Match all to budget
        </Button>
        <Button variant="secondary" size="sm" onClick={extrapolateAllYtd} disabled={noActualsYet}>
          Extrapolate YTD run-rate
        </Button>
        <div className="hidden h-5 w-px bg-gray-200 sm:block" />
        <Button variant="secondary" size="sm" onClick={resetDraftToSeed} disabled={noActualsYet}>
          Reset
        </Button>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={noActualsYet}>
          Export
        </Button>
        <div className="flex-1" />
        <Link
          to={`/budget/${year}`}
          className="text-xs font-semibold text-navy-600 hover:text-navy-800"
        >
          ← Budget
        </Link>
        {overridesStore.isDirty && (
          <span className="text-xs font-medium text-warn">Unsaved edits</span>
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={noActualsYet || spendCats.length === 0 || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          Save Reforecast
        </Button>
      </div>

      {loading && (
        <div className="mt-6">
          <StatusPanel kind="loading" message="Loading…" />
        </div>
      )}
      {!loading && firstError && (
        <div className="mt-6">
          <StatusPanel
            kind="error"
            message="Couldn't load reforecast."
            detail={(firstError as Error).message}
          />
        </div>
      )}
      {!loading && !firstError && noActualsYet && (
        <div className="mt-6">
          <StatusPanel
            kind="empty"
            message={`No transactions in ${year} yet.`}
            detail="Once you have actuals, this page locks past months and lets you edit the remainder."
          />
        </div>
      )}
      {!loading && !firstError && !noActualsYet && spendCats.length === 0 && (
        <div className="mt-6">
          <StatusPanel kind="empty" message="No spend categories in the default scheme." />
        </div>
      )}

      {!loading && !firstError && !noActualsYet && spendCats.length > 0 && (
        <Card padded={false} className="mt-4 overflow-hidden rounded-xl border-gray-200 shadow-sm">
          <div className="overflow-x-auto">
            <div
              className="inline-block min-w-full"
              style={{
                minWidth:
                  260 + 12 * (dense ? 96 : 108) + (dense ? 120 : 132) + 110 + 3 * colAvgPx + 50,
              }}
            >
              <div className="sticky top-0 z-[5] flex border-b-2 border-navy-200 bg-navy-50">
                <div
                  className={`sticky left-0 z-[6] ${colCat} shrink-0 border-r-2 border-navy-200 bg-navy-50 px-[18px] py-3 text-[11px] font-bold uppercase tracking-wider text-navy-700`}
                >
                  Category
                </div>
                {months.map((p) => {
                  const isActual = p.month <= asOfMonth;
                  const isBoundary = p.month === firstForecastMonth;
                  return (
                    <div
                      key={periodKey(p)}
                      className={`${colMonthMin} flex shrink-0 flex-col items-end justify-end border-r border-navy-100 px-3 py-1.5 ${
                        isActual ? 'bg-gray-50' : 'bg-navy-50'
                      } ${isBoundary ? 'border-l-2 border-l-gold-500' : ''}`}
                    >
                      <span
                        className={`text-[9.5px] font-bold uppercase tracking-wide ${
                          isActual ? 'text-gray-400' : 'text-gold-600'
                        }`}
                      >
                        {isActual ? 'Actual' : 'Forecast'}
                      </span>
                      <span className={`text-xs font-bold uppercase tracking-wide ${isActual ? 'text-gray-500' : 'text-navy-700'}`}>
                        {MONTHS[p.month - 1]}
                      </span>
                    </div>
                  );
                })}
                <div
                  className={`${colTot} flex shrink-0 items-center justify-end border-l-2 border-navy-200 bg-navy-100 px-3.5 text-[11px] font-bold uppercase tracking-wider text-navy-800`}
                >
                  Projected
                </div>
                <div
                  className={`${colVar} flex shrink-0 items-center justify-end px-3 text-[11px] font-bold uppercase tracking-wide text-navy-500`}
                >
                  vs Budget
                </div>
                {(['3-mo', '6-mo', '12-mo'] as const).map((lbl, i) => (
                  <div
                    key={lbl}
                    className={`${colAvg} flex shrink-0 flex-col items-end justify-end bg-gray-50/70 px-3 py-1.5 ${
                      i === 0 ? 'border-l-2 border-navy-200' : 'border-l border-gray-200'
                    }`}
                  >
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">
                      Avg
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      {lbl}
                    </span>
                  </div>
                ))}
                <div className={`${colEasy} shrink-0`} />
              </div>

              {SPEND_GROUP_ORDER.map((group) => {
                const cats = spendCats
                  .filter((c) => canonicalSpendGroup(c.group_name) === group)
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
                if (cats.length === 0) return null;
                const isYearly = group === 'Yearly';
                const isCollapsed = collapsed[group];
                const subs = months.map((p) => {
                  let s = 0;
                  for (const c of cats) {
                    if (p.month <= asOfMonth) s += actualsLookup.get(`${c.id}|${periodKey(p)}`) ?? 0;
                    else s += getForecast(c.id, p.month);
                  }
                  return s;
                });
                const subProj = subs.reduce((a, b) => a + b, 0);
                let gBudget = 0;
                let gProj = 0;
                let gAvg3 = 0;
                let gAvg6 = 0;
                let gAvg12 = 0;
                for (const c of cats) {
                  const rm = rowMetricsForCategory(c, asOfMonth, actualsLookup, getForecast, budgetLookup, year);
                  gBudget += rm.budgetTotal;
                  gProj += rm.projected;
                  const a = rowAverages(c.id);
                  gAvg3 += a.avg3;
                  gAvg6 += a.avg6;
                  gAvg12 += a.avg12;
                }
                const gVar = gProj - gBudget;

                return (
                  <div key={group}>
                    <button
                      type="button"
                      onClick={() => setCollapsed((x) => ({ ...x, [group]: !x[group] }))}
                      className={`flex w-full border-b text-left ${isYearly ? 'border-gold-300 bg-gold-100' : 'border-navy-200 bg-navy-100'}`}
                    >
                      <div
                        className={`sticky left-0 z-[4] ${colCat} flex shrink-0 items-center border-r-2 px-[18px] py-2.5 text-[11.5px] font-bold uppercase tracking-wider ${
                          isYearly ? 'border-gold-300 bg-gold-100 text-gold-600' : 'border-navy-200 bg-navy-100 text-navy-700'
                        }`}
                      >
                        <span className={`mr-2 inline-block transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>▾</span>
                        {group}
                        {isYearly && (
                          <span className="ml-2 rounded-full bg-gold-500 px-1.5 py-px text-[9.5px] font-semibold text-white">
                            Yearly
                          </span>
                        )}
                      </div>
                      {months.map((p) => (
                        <div
                          key={periodKey(p)}
                          className={`${colMonthMin} shrink-0 border-r ${isYearly ? 'border-gold-300' : 'border-navy-200'} ${
                            p.month === firstForecastMonth ? 'border-l-2 border-l-gold-500' : ''
                          }`}
                        />
                      ))}
                      <div className={`${colTot} shrink-0 border-l-2 ${isYearly ? 'border-gold-300 bg-gold-100' : 'border-navy-200 bg-navy-100'}`} />
                      <div className={`${colVar} shrink-0`} />
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className={`${colAvg} shrink-0 ${i === 0 ? 'border-l-2 border-navy-200' : ''}`}
                        />
                      ))}
                      <div className={`${colEasy} shrink-0`} />
                    </button>

                    {!isCollapsed &&
                      cats.map((c) => {
                        const rm = rowMetricsForCategory(c, asOfMonth, actualsLookup, getForecast, budgetLookup, year);
                        const avgs = rowAverages(c.id);
                        const isMonthlyKind = !c.is_yearly && canonicalSpendGroup(c.group_name) !== 'Yearly';
                        return (
                          <div key={c.id} className={`group flex ${rowH} bg-white`}>
                            <div
                              className={`sticky left-0 z-[3] ${colCat} flex shrink-0 items-center border-b border-gray-100 border-r-2 border-gray-200 bg-white px-[18px] text-[13.5px] font-medium text-navy-800 group-hover:bg-navy-50`}
                            >
                              {c.name}
                            </div>
                            {months.map((p, mi) => {
                              const locked = p.month <= asOfMonth;
                              const v = locked
                                ? actualsLookup.get(`${c.id}|${periodKey(p)}`)
                                : getForecast(c.id, p.month);
                              const boundary = p.month === firstForecastMonth;
                              return (
                                <div key={periodKey(p)} className="flex shrink-0">
                                  <ReforecastMatrixCell
                                    catId={c.id}
                                    monthIdx={mi}
                                    month={p.month}
                                    year={year}
                                    months={months}
                                    asOfMonth={asOfMonth}
                                    locked={locked}
                                    value={locked ? v ?? 0 : getForecast(c.id, p.month)}
                                    actualDisplay={v}
                                    isYearlyRow={isYearly}
                                    cellFs={cellFs}
                                    colMonthMin={colMonthMin}
                                    boundary={boundary}
                                    categoryName={c.name}
                                    onSave={(n) => setForecast(c.id, p.month, n)}
                                    onEnterDown={() => {
                                      const idx = orderedCats.findIndex((x) => x.id === c.id);
                                      const next = orderedCats[idx + 1];
                                      if (!next) return;
                                      document
                                        .querySelector<HTMLElement>(`[data-rf-cell="${next.id}:${mi}"]`)
                                        ?.focus();
                                    }}
                                  />
                                </div>
                              );
                            })}
                            <div
                              className={`${colTot} flex shrink-0 items-center justify-end border-b border-gray-100 border-l-2 border-navy-200 bg-navy-50 px-3.5 text-[13.5px] font-bold tabular-nums text-navy-800`}
                            >
                              {rm.projected > 0 ? fmtUsd(rm.projected) : <span className="text-gray-300">—</span>}
                            </div>
                            <div className={`${colVar} flex shrink-0 flex-col items-end justify-center gap-0.5 border-b border-gray-100 px-3 py-1`}>
                              {rm.budgetTotal > 0 ? (
                                <>
                                  <div
                                    className={`flex items-center gap-0.5 text-[12.5px] font-bold tabular-nums ${rm.variance === 0 ? 'text-gray-400' : rm.variance > 0 ? 'text-neg' : 'text-pos'}`}
                                  >
                                    {rm.variance !== 0 && <span aria-hidden>{rm.variance > 0 ? '▲' : '▼'}</span>}
                                    {fmtUsdSigned(rm.variance)}
                                  </div>
                                  {tweaks.showVarianceBars && (
                                    <VarianceMiniBar projected={rm.projected} budget={rm.budgetTotal} />
                                  )}
                                </>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                            {([avgs.avg3, avgs.avg6, avgs.avg12] as const).map((a, i) => (
                              <div
                                key={i}
                                className={`${colAvg} flex shrink-0 items-center justify-end border-b border-gray-100 bg-gray-50/40 px-3 tabular-nums ${cellFs} text-gray-600 ${
                                  i === 0 ? 'border-l-2 border-navy-200' : 'border-l border-gray-100'
                                }`}
                              >
                                {Math.round(a) !== 0 ? fmtUsd(a) : <span className="text-gray-300">—</span>}
                              </div>
                            ))}
                            <div
                              className={`flex shrink-0 items-center justify-center border-b border-gray-100 px-1 ${colEasy}`}
                            >
                              {isMonthlyKind ? (
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  className="rounded-md border border-navy-200 bg-white px-1.5 py-1 text-[10px] font-bold text-navy-600 opacity-0 transition-opacity hover:bg-navy-50 group-hover:opacity-100"
                                  onClick={(e) => setFillPopover({ catId: c.id, anchor: e.currentTarget })}
                                >
                                  Fill
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}

                    {tweaks.highlightSubtotals && (
                      <div
                        className={`flex ${rowH} border-b-2 ${isYearly ? 'border-gold-300 bg-gold-100' : 'border-navy-200 bg-navy-50'}`}
                      >
                        <div
                          className={`sticky left-0 z-[3] ${colCat} flex shrink-0 items-center border-r-2 px-[18px] text-[13px] font-bold ${isYearly ? 'border-gold-300 bg-gold-100 text-gold-600' : 'border-navy-200 bg-navy-50 text-navy-800'}`}
                        >
                          {group} subtotal
                        </div>
                        {months.map((p, i) => (
                          <div
                            key={periodKey(p)}
                            className={`${colMonthMin} flex shrink-0 items-center justify-end border-r px-3 tabular-nums ${cellFs} font-bold ${isYearly ? 'border-gold-300 text-gold-600' : 'border-navy-200 text-navy-700'} ${
                              p.month === firstForecastMonth ? 'border-l-2 border-l-gold-500' : ''
                            }`}
                          >
                            {subs[i]! > 0 ? fmtUsd(subs[i]!) : <span className="text-gray-300">—</span>}
                          </div>
                        ))}
                        <div
                          className={`${colTot} flex shrink-0 items-center justify-end border-l-2 px-3.5 text-sm font-extrabold tabular-nums ${isYearly ? 'border-gold-600 bg-gold-300 text-gold-600' : 'border-navy-300 bg-navy-100 text-navy-800'}`}
                        >
                          {fmtUsd(subProj)}
                        </div>
                        <div
                          className={`${colVar} flex shrink-0 items-center justify-end px-3 text-[12.5px] font-bold tabular-nums ${gVar === 0 ? 'text-gray-400' : gVar > 0 ? 'text-neg' : 'text-pos'}`}
                        >
                          {fmtUsdSigned(gVar)}
                        </div>
                        {([gAvg3, gAvg6, gAvg12] as const).map((a, i) => (
                          <div
                            key={i}
                            className={`${colAvg} flex shrink-0 items-center justify-end px-3 tabular-nums ${cellFs} font-bold ${isYearly ? 'text-gold-600' : 'text-navy-700'} ${
                              i === 0
                                ? isYearly
                                  ? 'border-l-2 border-gold-300'
                                  : 'border-l-2 border-navy-200'
                                : ''
                            }`}
                          >
                            {Math.round(a) !== 0 ? fmtUsd(a) : <span className="text-gray-300">—</span>}
                          </div>
                        ))}
                        <div className={`${colEasy} ${isYearly ? 'bg-gold-100' : 'bg-navy-50'}`} />
                      </div>
                    )}
                  </div>
                );
              })}

              <SummaryRowFlex
                label="Monthly Categories Total"
                values={monthlyProjected}
                total={monthlyProjected.reduce((a, b) => a + b, 0)}
                avgTotals={monthlyAvgTotals}
                tone="navy"
                firstForecastMonth={firstForecastMonth}
                colCat={colCat}
                colMonthMin={colMonthMin}
                colTot={colTot}
                colVar={colVar}
                colAvg={colAvg}
                colEasy={colEasy}
                rowH={rowH}
                cellFs={cellFs}
              />
              <SummaryRowFlex
                label="Yearly Categories Total"
                values={yearlyProjected}
                total={yearlyProjected.reduce((a, b) => a + b, 0)}
                avgTotals={yearlyAvgTotals}
                tone="gold"
                firstForecastMonth={firstForecastMonth}
                colCat={colCat}
                colMonthMin={colMonthMin}
                colTot={colTot}
                colVar={colVar}
                colAvg={colAvg}
                colEasy={colEasy}
                rowH={rowH}
                cellFs={cellFs}
              />
              <GrandSummaryFlex
                label="Projected Total"
                values={grandMonthly}
                total={grand.projected}
                variance={grand.variance}
                avgTotals={grandAvgTotals}
                firstForecastMonth={firstForecastMonth}
                colCat={colCat}
                colMonthMin={colMonthMin}
                colVar={colVar}
                colAvg={colAvg}
                colEasy={colEasy}
                rowH={rowH}
                cellFs={cellFs}
              />
            </div>
          </div>
        </Card>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <details className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-xs">
          <summary className="cursor-pointer font-semibold text-navy-700">Display options</summary>
          <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2">
            <label className="flex items-center gap-2">
              Density
              <select
                className="rounded border border-gray-200 px-2 py-1"
                value={tweaks.density}
                onChange={(e) =>
                  setTweaks((t) => ({ ...t, density: e.target.value as ReforecastTweaks['density'] }))
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tweaks.showProjectionKpi}
                onChange={(e) => setTweaks((t) => ({ ...t, showProjectionKpi: e.target.checked }))}
              />
              Show projection KPI
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tweaks.highlightSubtotals}
                onChange={(e) => setTweaks((t) => ({ ...t, highlightSubtotals: e.target.checked }))}
              />
              Highlight subtotal rows
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tweaks.showVarianceBars}
                onChange={(e) => setTweaks((t) => ({ ...t, showVarianceBars: e.target.checked }))}
              />
              Show variance bars
            </label>
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/budget/${year - 1}/revise`)}>
            ← {year - 1}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/budget/${year + 1}/revise`)}>
            {year + 1} →
          </Button>
          <Link
            to="/reports/budget-matrix"
            className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            Budget report
          </Link>
        </div>
      </div>

      {toast && <Toast msg={toast} />}

      {fillPopover &&
        (() => {
          const cat = orderedCats.find((c) => c.id === fillPopover.catId);
          if (!cat) return null;
          const rm = rowMetricsForCategory(cat, asOfMonth, actualsLookup, getForecast, budgetLookup, year);
          return (
            <FillPopover
              anchor={fillPopover.anchor}
              metrics={rm}
              onClose={() => setFillPopover(null)}
              onPick={(mode) => {
                const next = new Map(overrides);
                for (let m = asOfMonth + 1; m <= 12; m++) {
                  const k = `${fillPopover.catId}|${m}`;
                  if (mode === 'match-budget') {
                    next.set(k, budgetAmount(fillPopover.catId, m));
                  } else if (mode === 'ytd') {
                    next.set(k, Math.round(rm.ytdAvg));
                  } else if (mode === '3mo') {
                    next.set(k, Math.round(rm.last3Avg));
                  } else {
                    next.set(k, 0);
                  }
                }
                overridesStore.replace(next);
                setFillPopover(null);
                showToast('Reforecast updated');
              }}
            />
          );
        })()}
    </div>
  );
}

function rowMetricsForCategory(
  c: ReportCategory,
  asOfMonth: number,
  actuals: ActualLookup,
  getForecast: (id: string, m: number) => number,
  budgetLookup: BudgetLookup,
  year: number,
) {
  let actualYTD = 0;
  let forecastRem = 0;
  let budgetTotal = 0;
  for (let month = 1; month <= 12; month++) {
    budgetTotal += budgetLookup.get(`${c.id}|${periodKey({ year, month })}`) ?? 0;
    if (month <= asOfMonth) {
      actualYTD += actuals.get(`${c.id}|${periodKey({ year, month })}`) ?? 0;
    } else {
      forecastRem += getForecast(c.id, month);
    }
  }
  const projected = actualYTD + forecastRem;
  const variance = projected - budgetTotal;
  const ytdAvg = asOfMonth > 0 ? actualYTD / asOfMonth : 0;
  const last3 = monthsSliceLastActuals(c.id, asOfMonth, actuals, year, 3);
  const last3Avg = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
  const budgetRemaining = monthsRangeSumBudget(c.id, asOfMonth + 1, 12, budgetLookup, year);
  return {
    projected,
    variance,
    budgetTotal,
    ytdAvg,
    last3Avg,
    budgetRemaining,
    actualYTD,
  };
}

function monthsSliceLastActuals(
  catId: string,
  asOfMonth: number,
  actuals: ActualLookup,
  year: number,
  n: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < n && asOfMonth - i >= 1; i++) {
    const m = asOfMonth - i;
    out.push(actuals.get(`${catId}|${periodKey({ year, month: m })}`) ?? 0);
  }
  return out.reverse();
}

function monthsRangeSumBudget(
  catId: string,
  fromM: number,
  toM: number,
  budgetLookup: BudgetLookup,
  year: number,
) {
  let s = 0;
  for (let m = fromM; m <= toM; m++) {
    s += budgetLookup.get(`${catId}|${periodKey({ year, month: m })}`) ?? 0;
  }
  return s;
}

function MiniKpi({
  label,
  value,
  sub,
  accentClass,
}: {
  label: string;
  value: string;
  sub: string;
  accentClass?: string;
}) {
  return (
    <div className="rounded-[10px] border border-gray-200 bg-white px-4 py-3 shadow-xs">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums tracking-tight ${accentClass ?? 'text-navy-600'}`}>
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-gray-400">{sub}</div>
    </div>
  );
}

function ReforecastMatrixCell({
  catId,
  monthIdx,
  month,
  year,
  months,
  asOfMonth,
  locked,
  value,
  actualDisplay,
  isYearlyRow,
  cellFs,
  colMonthMin,
  boundary,
  categoryName,
  onSave,
  onEnterDown,
}: {
  catId: string;
  monthIdx: number;
  month: number;
  year: number;
  months: Period[];
  asOfMonth: number;
  locked: boolean;
  value: number;
  actualDisplay: number | undefined;
  isYearlyRow: boolean;
  cellFs: string;
  colMonthMin: string;
  boundary: boolean;
  categoryName: string;
  onSave: (n: number) => void;
  onEnterDown: () => void;
}) {
  const boundaryCls = boundary ? 'border-l-2 border-l-gold-500' : '';
  const [editing, setEditing] = useState(false);
  const [draftStr, setDraftStr] = useState('');
  const skipBlur = useRef(false);

  useEffect(() => {
    if (!editing) setDraftStr(value === 0 ? '' : String(Math.round(value)));
  }, [value, editing]);

  const parseDraft = (): number => {
    const t = draftStr.trim();
    if (t === '') return 0;
    const n = Number(t.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : value;
  };

  if (locked) {
    const a = actualDisplay ?? 0;
    return (
      <div
        className={`${colMonthMin} flex h-full min-h-[36px] shrink-0 items-center justify-end border-b border-r border-gray-100 bg-gray-50 px-3 tabular-nums ${cellFs} text-gray-600 ${boundaryCls}`}
      >
        {a === 0 ? (
          <span className="text-gray-300">{isYearlyRow ? '' : '—'}</span>
        ) : (
          fmtUsd(a)
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <div className={`${colMonthMin} flex h-full shrink-0 border-b border-r border-gray-100 bg-white ${cellFs} ${boundaryCls}`}>
        <button
          type="button"
          data-rf-cell={`${catId}:${monthIdx}`}
          onClick={() => {
            setDraftStr(value === 0 ? '' : String(Math.round(value)));
            setEditing(true);
          }}
          className={`flex h-full min-h-[36px] w-full items-center justify-end px-3 text-right font-medium tabular-nums hover:bg-navy-50/80 focus:outline-none focus:ring-2 focus:ring-navy-400 focus:ring-inset ${
            value === 0 ? 'text-gray-300' : 'text-navy-800'
          }`}
        >
          {value === 0 ? (isYearlyRow ? '' : '—') : fmtUsd(value)}
        </button>
      </div>
    );
  }

  return (
    <div className={`${colMonthMin} flex h-full shrink-0 border-b border-r border-gray-100 bg-white ${cellFs} ${boundaryCls}`}>
      <input
        data-rf-cell={`${catId}:${monthIdx}`}
        autoFocus
        value={draftStr}
        onChange={(e) => setDraftStr(e.target.value)}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          const n = parseDraft();
          if (n !== value) onSave(n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const n = parseDraft();
            if (n !== value) onSave(n);
            setEditing(false);
            onEnterDown();
          } else if (e.key === 'Escape') {
            setDraftStr(value === 0 ? '' : String(Math.round(value)));
            setEditing(false);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            skipBlur.current = true;
            const n = parseDraft();
            if (n !== value) onSave(n);
            setEditing(false);
            const dir = e.shiftKey ? -1 : 1;
            let j = monthIdx + dir;
            while (j >= 0 && j < months.length) {
              if (months[j]!.month > asOfMonth) {
                document.querySelector<HTMLElement>(`[data-rf-cell="${catId}:${j}"]`)?.focus();
                return;
              }
              j += dir;
            }
          }
        }}
        className="h-full min-h-[36px] w-full border-0 bg-white px-3 py-0 text-right font-medium tabular-nums text-navy-800 shadow-[inset_0_0_0_2px_#3b559a] focus:outline-none"
        aria-label={`${categoryName} · ${MONTHS[month - 1]} ${year}`}
      />
    </div>
  );
}

function SummaryRowFlex({
  label,
  values,
  total,
  avgTotals,
  tone,
  firstForecastMonth,
  colCat,
  colMonthMin,
  colTot,
  colVar,
  colAvg,
  colEasy,
  rowH,
  cellFs,
}: {
  label: string;
  values: number[];
  total: number;
  avgTotals: [number, number, number];
  tone: 'navy' | 'gold';
  firstForecastMonth: number;
  colCat: string;
  colMonthMin: string;
  colTot: string;
  colVar: string;
  colAvg: string;
  colEasy: string;
  rowH: string;
  cellFs: string;
}) {
  const st =
    tone === 'gold'
      ? { bg: 'bg-gold-100', fg: 'text-gold-600', br: 'border-gold-300', tb: 'bg-gold-300', tf: 'text-gold-600' }
      : { bg: 'bg-navy-100', fg: 'text-navy-800', br: 'border-navy-200', tb: 'bg-navy-200', tf: 'text-navy-800' };

  return (
    <div className={`flex border-t-2 ${st.br} ${st.bg} ${rowH}`}>
      <div
        className={`sticky left-0 z-[3] ${colCat} shrink-0 border-r-2 ${st.br} ${st.bg} px-[18px] text-[12.5px] font-bold uppercase tracking-wide ${st.fg} flex items-center`}
      >
        {label}
      </div>
      {values.map((v, i) => {
        const month = i + 1;
        return (
          <div
            key={i}
            className={`${colMonthMin} flex shrink-0 items-center justify-end border-r px-3 tabular-nums ${cellFs} font-bold ${st.fg} ${
              month === firstForecastMonth ? 'border-l-2 border-l-gold-500' : ''
            }`}
          >
            {v > 0 ? fmtUsd(v) : <span className="text-gray-300">—</span>}
          </div>
        );
      })}
      <div
        className={`${colTot} flex shrink-0 items-center justify-end border-l-2 px-3.5 text-sm font-extrabold tabular-nums ${tone === 'gold' ? 'border-gold-600 bg-gold-300 text-gold-600' : 'border-navy-300 bg-navy-200 text-navy-800'}`}
      >
        {fmtUsd(total)}
      </div>
      <div className={`${colVar} shrink-0 ${st.bg}`} />
      {avgTotals.map((a, i) => (
        <div
          key={i}
          className={`${colAvg} flex shrink-0 items-center justify-end px-3 tabular-nums ${cellFs} font-bold ${st.fg} ${st.bg} ${
            i === 0 ? `border-l-2 ${st.br}` : ''
          }`}
        >
          {Math.round(a) !== 0 ? fmtUsd(a) : <span className="text-gray-300">—</span>}
        </div>
      ))}
      <div className={`${colEasy} shrink-0 ${st.bg}`} />
    </div>
  );
}

function GrandSummaryFlex({
  label,
  values,
  total,
  variance,
  avgTotals,
  firstForecastMonth,
  colCat,
  colMonthMin,
  colVar,
  colAvg,
  colEasy,
  rowH,
  cellFs,
}: {
  label: string;
  values: number[];
  total: number;
  variance: number;
  avgTotals: [number, number, number];
  firstForecastMonth: number;
  colCat: string;
  colMonthMin: string;
  colVar: string;
  colAvg: string;
  colEasy: string;
  rowH: string;
  cellFs: string;
}) {
  const over = variance > 0;
  return (
    <div className={`flex border-t-2 border-navy-900 bg-navy-800 ${rowH}`}>
      <div
        className={`sticky left-0 z-[3] ${colCat} shrink-0 border-r-2 border-navy-900 bg-navy-800 px-[18px] text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2 py-3`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden />
        {label}
      </div>
      {values.map((v, i) => {
        const month = i + 1;
        return (
          <div
            key={i}
            className={`flex ${colMonthMin} shrink-0 items-center justify-end border-r border-navy-700 px-3 py-3 tabular-nums ${cellFs} font-extrabold text-white ${
              month === firstForecastMonth ? 'border-l-2 border-l-gold-500' : ''
            }`}
          >
            {v > 0 ? fmtUsd(v) : <span className="text-white/30">—</span>}
          </div>
        );
      })}
      <div className="flex shrink-0 items-center justify-end border-l-2 border-gold-500 bg-gold-500 px-3.5 py-3 text-lg font-extrabold tabular-nums text-navy-900">
        {fmtUsd(total)}
      </div>
      <div
        className={`${colVar} flex shrink-0 items-center justify-end px-3 py-3 text-sm font-extrabold tabular-nums ${over ? 'text-[#ff9d8e]' : 'text-[#7fdbb1]'}`}
      >
        {variance !== 0 && <span className="mr-0.5">{over ? '▲' : '▼'}</span>}
        {fmtUsdSigned(variance)}
      </div>
      {avgTotals.map((a, i) => (
        <div
          key={i}
          className={`${colAvg} flex shrink-0 items-center justify-end px-3 py-3 tabular-nums ${cellFs} font-extrabold text-white ${
            i === 0 ? 'border-l-2 border-navy-700' : ''
          }`}
        >
          {Math.round(a) !== 0 ? fmtUsd(a) : <span className="text-white/30">—</span>}
        </div>
      ))}
      <div className={`${colEasy} bg-navy-800`} />
    </div>
  );
}

function FillPopover({
  anchor,
  metrics,
  onClose,
  onPick,
}: {
  anchor: HTMLElement;
  metrics: ReturnType<typeof rowMetricsForCategory>;
  onClose: () => void;
  onPick: (mode: 'match-budget' | 'ytd' | '3mo' | 'clear') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + 6 + window.scrollY;
  const left = Math.min(rect.left + window.scrollX - 120, window.innerWidth - 280);

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-[220px] rounded-[10px] border border-gray-200 bg-white p-1.5 shadow-lg"
      style={{ top, left }}
    >
      <div className="px-2.5 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
        Reforecast forward from…
      </div>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-navy-50"
        onClick={() => onPick('match-budget')}
      >
        Match original budget
        <span className="font-mono text-[11.5px] text-gray-400">{fmtUsd(metrics.budgetRemaining)}</span>
      </button>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-navy-50"
        onClick={() => onPick('ytd')}
      >
        Run-rate YTD avg
        <span className="font-mono text-[11.5px] text-gray-400">{fmtUsd(metrics.ytdAvg)} / mo</span>
      </button>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-navy-50"
        onClick={() => onPick('3mo')}
      >
        Run-rate last 3 mo
        <span className="font-mono text-[11.5px] text-gray-400">{fmtUsd(metrics.last3Avg)} / mo</span>
      </button>
      <div className="my-1 h-px bg-gray-100" />
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] text-gray-600 hover:bg-navy-50"
        onClick={() => onPick('clear')}
      >
        Clear forecast
        <span className="font-mono text-[11.5px] text-gray-400">$0</span>
      </button>
    </div>
  );
}
