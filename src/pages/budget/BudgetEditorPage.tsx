import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchSchemeCategories,
  fetchBudgetYear,
  fetchMonthlyActuals,
  budgetsToLookup,
  actualsToLookup,
  upsertBudgetCell,
  upsertBudgetCells,
  deleteBudgetCell,
  type ReportCategory,
  type BudgetLookup,
  type ActualLookup,
} from '@/api/reports';
import { fmtUsd } from '@/lib/money';
import {
  fullYear,
  periodKey,
  shiftPeriod,
  MONTH_NAMES_SHORT,
  type Period,
} from '@/lib/period';
import {
  canonicalSpendGroup,
  SPEND_GROUP_ORDER,
  type SpendGroup,
} from '@/features/reports/grouping';
import { StatusPanel } from '@/components/StatusPanel';
import { Button, Card } from '@/components/ds';

const MONTHS = MONTH_NAMES_SHORT;
const TWEAK_KEY = 'tf:budget-matrix-tweaks';

type BudgetTweaks = {
  density: 'compact' | 'comfortable';
  showGrandTotalKpi: boolean;
  highlightSubtotals: boolean;
  stripeRows: boolean;
};

const DEFAULT_TWEAKS: BudgetTweaks = {
  density: 'comfortable',
  showGrandTotalKpi: true,
  highlightSubtotals: true,
  stripeRows: false,
};

function loadTweaks(): BudgetTweaks {
  try {
    const raw = localStorage.getItem(TWEAK_KEY);
    if (!raw) return DEFAULT_TWEAKS;
    const p = JSON.parse(raw) as Partial<BudgetTweaks>;
    return { ...DEFAULT_TWEAKS, ...p };
  } catch {
    return DEFAULT_TWEAKS;
  }
}

function Toast({ msg }: { msg: string }) {
  return (
    <div
      className="toast-enter fixed bottom-7 left-1/2 z-[2000] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
      role="status"
    >
      <span className="inline-block h-3.5 w-3.5 rounded-full bg-pos" aria-hidden />
      {msg}
    </div>
  );
}

export function BudgetEditorPage() {
  const { year: yearParam } = useParams();
  const navigate = useNavigate();
  const household = useHousehold();
  const qc = useQueryClient();

  const year = useMemo(() => {
    const y = Number(yearParam);
    return Number.isFinite(y) && y > 1900 ? y : new Date().getFullYear();
  }, [yearParam]);

  const months = useMemo(() => fullYear(year), [year]);
  const anchorPrevDec: Period = { year: year - 1, month: 12 };
  const extendedFrom = useMemo(() => shiftPeriod(anchorPrevDec, -(36 - 1)), [year]);

  const [tweaks, setTweaks] = useState<BudgetTweaks>(loadTweaks);
  useEffect(() => {
    localStorage.setItem(TWEAK_KEY, JSON.stringify(tweaks));
  }, [tweaks]);

  const [collapsed, setCollapsed] = useState<Partial<Record<SpendGroup, boolean>>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [avgPopover, setAvgPopover] = useState<{
    cat: ReportCategory;
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

  const avgActualsQ = useQuery({
    queryKey: ['budget-avg-actuals-extended', household?.id, schemeQ.data, year],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: extendedFrom,
        to: anchorPrevDec,
      }),
  });

  const budgetLookup: BudgetLookup = useMemo(
    () => (budgetQ.data ? budgetsToLookup(budgetQ.data) : new Map()),
    [budgetQ.data],
  );
  const actualsLookup: ActualLookup = useMemo(
    () => (avgActualsQ.data ? actualsToLookup(avgActualsQ.data) : new Map()),
    [avgActualsQ.data],
  );

  const spendCats: ReportCategory[] = useMemo(() => {
    if (!categoriesQ.data) return [];
    return categoriesQ.data.filter((c) => canonicalSpendGroup(c.group_name) !== null);
  }, [categoriesQ.data]);

  const orderedCats = useMemo(() => {
    const out: ReportCategory[] = [];
    for (const g of SPEND_GROUP_ORDER) {
      const cats = spendCats
        .filter((c) => canonicalSpendGroup(c.group_name) === g)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      out.push(...cats);
    }
    return out;
  }, [spendCats]);

  const invalidateBudget = () =>
    qc.invalidateQueries({ queryKey: ['budget-year', household?.id, year] });

  const avgTrailing = useCallback(
    (categoryId: string, n: 3 | 6 | 12 | 36): number => {
      let total = 0;
      for (let i = 0; i < n; i++) {
        const p = shiftPeriod(anchorPrevDec, -i);
        total += actualsLookup.get(`${categoryId}|${periodKey(p)}`) ?? 0;
      }
      return Math.round(total / n);
    },
    [actualsLookup, anchorPrevDec],
  );

  const handleCellSave = async (cat: ReportCategory, p: Period, raw: string) => {
    if (!household) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      await deleteBudgetCell({
        household_id: household.id,
        year: p.year,
        month: p.month,
        category_id: cat.id,
      });
      invalidateBudget();
      return;
    }
    const num = Number(trimmed.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(num)) return;

    const isMonthlyShape =
      !cat.is_yearly &&
      canonicalSpendGroup(cat.group_name) !== 'Yearly';

    if (isMonthlyShape && p.month === 1) {
      const febDecHaveNoBudget = months
        .filter((mp) => mp.month > 1)
        .every((mp) => budgetLookup.get(`${cat.id}|${periodKey(mp)}`) == null);
      if (febDecHaveNoBudget) {
        await upsertBudgetCells(
          months.map((mp) => ({
            household_id: household.id,
            year: mp.year,
            month: mp.month,
            category_id: cat.id,
            amount: num,
          })),
        );
        invalidateBudget();
        showToast('Copied to all 12 months');
        return;
      }
    }

    await upsertBudgetCell({
      household_id: household.id,
      year: p.year,
      month: p.month,
      category_id: cat.id,
      amount: num,
    });
    invalidateBudget();
  };

  const fillRow = async (cat: ReportCategory, n: 3 | 6 | 12 | 36) => {
    if (!household) return;
    const amount = avgTrailing(cat.id, n);
    const rows = months.map((p) => ({
      household_id: household.id,
      year: p.year,
      month: p.month,
      category_id: cat.id,
      amount,
    }));
    await upsertBudgetCells(rows);
    invalidateBudget();
    showToast('Filled 12 months from average');
    setAvgPopover(null);
  };

  const seedBudget = async (n: 3 | 6 | 12 | 36) => {
    if (!household) return;
    const monthlyCats = spendCats.filter((c) => !c.is_yearly);
    const toFill = monthlyCats.filter((c) =>
      months.every((p) => budgetLookup.get(`${c.id}|${periodKey(p)}`) == null),
    );
    const amountByCat = new Map<string, number>();
    for (const c of toFill) {
      amountByCat.set(c.id, avgTrailing(c.id, n));
    }
    const rows: Array<{
      household_id: string;
      year: number;
      month: number;
      category_id: string;
      amount: number;
    }> = [];
    for (const c of toFill) {
      const amt = amountByCat.get(c.id) ?? 0;
      for (const p of months) {
        rows.push({
          household_id: household.id,
          year: p.year,
          month: p.month,
          category_id: c.id,
          amount: amt,
        });
      }
    }
    if (rows.length) await upsertBudgetCells(rows);
    invalidateBudget();
    setSeedOpen(false);
    showToast(`Seeded ${toFill.length} empty monthly categories (${n}-month avg)`);
  };

  const exportCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = ['Category', 'Group', ...MONTHS.map((m) => `${m} ${year}`), 'Year total'];
    const lines = [header.join(',')];
    for (const c of orderedCats) {
      const g = canonicalSpendGroup(c.group_name) ?? '';
      const cells = months.map((p) => {
        const v = budgetLookup.get(`${c.id}|${periodKey(p)}`);
        return v == null ? '' : String(Math.round(v));
      });
      const yt = months.reduce((s, p) => s + (budgetLookup.get(`${c.id}|${periodKey(p)}`) ?? 0), 0);
      lines.push([esc(c.name), esc(g), ...cells, String(Math.round(yt))].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budget-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Exported CSV');
  };

  const resetAll = async () => {
    if (!household) return;
    const ops: Promise<void>[] = [];
    for (const c of spendCats) {
      for (const p of months) {
        if (budgetLookup.has(`${c.id}|${periodKey(p)}`)) {
          ops.push(
            deleteBudgetCell({
              household_id: household.id,
              year: p.year,
              month: p.month,
              category_id: c.id,
            }),
          );
        }
      }
    }
    await Promise.all(ops);
    invalidateBudget();
    setResetOpen(false);
    showToast('Budget cleared');
  };

  const dense = tweaks.density === 'compact';
  const rowH = dense ? 'min-h-8' : 'min-h-10';
  const cellFs = dense ? 'text-[12.5px]' : 'text-[13.5px]';
  const colMonthMin = dense ? 'min-w-[98px] w-[98px]' : 'min-w-[110px] w-[110px]';
  const colCat = 'min-w-[260px] w-[260px]';
  const colTot = dense ? 'min-w-[120px] w-[120px]' : 'min-w-[132px] w-[132px]';
  const colAvg = 'min-w-[78px] w-[78px]';

  const grandMonthly = useMemo(
    () => sumBudgetPerMonth(spendCats, months, budgetLookup),
    [spendCats, months, budgetLookup],
  );
  const grandTotal = grandMonthly.reduce((a, b) => a + b, 0);

  const monthlyCats = useMemo(
    () => spendCats.filter((c) => canonicalSpendGroup(c.group_name) !== 'Yearly'),
    [spendCats],
  );
  const yearlyCats = useMemo(
    () => spendCats.filter((c) => canonicalSpendGroup(c.group_name) === 'Yearly'),
    [spendCats],
  );

  const monthlyMonthly = useMemo(
    () => sumBudgetPerMonth(monthlyCats, months, budgetLookup),
    [monthlyCats, months, budgetLookup],
  );
  const yearlyMonthly = useMemo(
    () => sumBudgetPerMonth(yearlyCats, months, budgetLookup),
    [yearlyCats, months, budgetLookup],
  );

  const monthlyCatYearTotal = monthlyMonthly.reduce((a, b) => a + b, 0);
  const yearlyCatYearTotal = yearlyMonthly.reduce((a, b) => a + b, 0);
  const monthlyRunRateAvg = monthlyCatYearTotal / 12;

  const largestCat = useMemo(() => {
    let best: { c: ReportCategory; t: number } | null = null;
    for (const c of spendCats) {
      const t = months.reduce((s, p) => s + (budgetLookup.get(`${c.id}|${periodKey(p)}`) ?? 0), 0);
      if (!best || t > best.t) best = { c, t };
    }
    return best;
  }, [spendCats, months, budgetLookup]);

  const zeroBudgetCount = useMemo(() => {
    return spendCats.filter((c) => {
      const t = months.reduce((s, p) => s + (budgetLookup.get(`${c.id}|${periodKey(p)}`) ?? 0), 0);
      return t === 0;
    }).length;
  }, [spendCats, months, budgetLookup]);

  const groupCount = useMemo(() => {
    const s = new Set<string>();
    for (const c of spendCats) {
      const g = canonicalSpendGroup(c.group_name);
      if (g) s.add(g);
    }
    return s.size;
  }, [spendCats]);

  const loading =
    schemeQ.isLoading || categoriesQ.isLoading || budgetQ.isLoading || avgActualsQ.isLoading;
  const firstError =
    schemeQ.error ?? categoriesQ.error ?? budgetQ.error ?? avgActualsQ.error;

  useEffect(() => {
    if (!seedOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-seed-root]')) setSeedOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [seedOpen]);

  return (
    <div className="min-w-0 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-[680px]">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-[26px] font-extrabold tracking-tight text-navy-800">
              Budget
            </h1>
            <span className="rounded-full bg-navy-100 px-2.5 py-1 text-xs font-bold tracking-wide text-navy-700">
              FY {year}
            </span>
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">
            Plan how much you&apos;ll spend by category this year. Tab across months; Enter moves down a
            row. Enter January first while Feb–Dec are empty to copy across all twelve months, or use{' '}
            <strong className="font-semibold text-navy-700">Avg</strong> on a row to pull a trailing average.
          </p>
        </div>
        {tweaks.showGrandTotalKpi && (
          <div className="relative min-w-[280px] shrink-0 overflow-hidden rounded-xl bg-navy-800 py-3.5 pl-5 pr-6 text-white shadow-md">
            <div className="absolute bottom-0 left-0 top-0 w-1 bg-gold-500" aria-hidden />
            <div className="text-[10.5px] font-bold uppercase tracking-widest text-gold-400">
              Total budget · FY {year}
            </div>
            <div className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight">
              {fmtUsd(grandTotal)}
            </div>
            <div className="mt-0.5 text-[11.5px] tabular-nums text-white/60">
              {spendCats.length} categories · {groupCount} groups
            </div>
          </div>
        )}
      </div>

      {/* Sub-KPI strip */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpi
          label="Monthly run-rate avg"
          value={fmtUsd(monthlyRunRateAvg)}
          sub="Monthly categories ÷ 12"
        />
        <MiniKpi
          label="Yearly / one-time"
          value={fmtUsd(yearlyCatYearTotal)}
          sub="Lump-sum categories"
        />
        <MiniKpi
          label="Largest category"
          value={largestCat && largestCat.t > 0 ? fmtUsd(largestCat.t) : '—'}
          sub={largestCat && largestCat.t > 0 ? largestCat.c.name : '—'}
        />
        <MiniKpi
          label="$0 categories"
          value={String(zeroBudgetCount)}
          sub="Still need amounts"
          accent={zeroBudgetCount > 0 ? 'text-warn' : undefined}
        />
      </div>

      {/* Toolbar */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-gray-200 bg-white px-3.5 py-2.5 shadow-xs">
        <div className="relative" data-seed-root>
          <button
            type="button"
            onClick={() => setSeedOpen((o) => !o)}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-bold transition-colors ${
              seedOpen
                ? 'border-gold-400 bg-gold-100 text-gold-600'
                : 'border-gold-300 bg-white text-gold-600 hover:bg-gold-100'
            }`}
          >
            Seed budget ▾
          </button>
          {seedOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[240px] rounded-[10px] border border-gray-200 bg-white p-1.5 shadow-lg">
              <div className="px-2.5 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
                Fill empty monthly categories
              </div>
              {([3, 6, 12, 36] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] text-navy-800 hover:bg-navy-50"
                  onClick={() => seedBudget(n)}
                >
                  Last {n} months avg
                  <span className="font-mono text-[11.5px] text-gray-400">{n}mo</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setResetOpen(true)}>
          Reset all
        </Button>
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          Export CSV
        </Button>
        <div className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            invalidateBudget();
            showToast('Budget saved');
          }}
        >
          Save Budget
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
            message="Couldn't load the budget editor."
            detail={(firstError as Error).message}
          />
        </div>
      )}
      {!loading && !firstError && spendCats.length === 0 && (
        <div className="mt-6">
          <StatusPanel kind="empty" message="No spend categories found in the default scheme." />
        </div>
      )}

      {!loading && !firstError && spendCats.length > 0 && (
        <Card padded={false} className="mt-4 overflow-hidden rounded-xl border-gray-200 shadow-sm">
          <div className="grid-scroll overflow-x-auto">
            <div
              className="inline-block min-w-full"
              style={{
                minWidth:
                  260 + 12 * (dense ? 98 : 110) + (dense ? 120 : 132) + 78,
              }}
            >
              {/* Header row */}
              <div className="sticky top-0 z-[5] flex border-b-2 border-navy-200 bg-navy-50">
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
                  Year total
                </div>
                <div
                  className={`${colAvg} shrink-0 px-2 py-3.5 text-center text-[11px] font-bold uppercase tracking-wide text-navy-500`}
                >
                  Avg ▾
                </div>
              </div>

              {SPEND_GROUP_ORDER.map((group) => {
                const cats = spendCats
                  .filter((c) => canonicalSpendGroup(c.group_name) === group)
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
                if (cats.length === 0) return null;
                const isYearly = group === 'Yearly';
                const isCollapsed = collapsed[group];
                const subs = sumBudgetPerMonth(cats, months, budgetLookup);
                const subYear = subs.reduce((a, b) => a + b, 0);

                return (
                  <div key={group}>
                    <button
                      type="button"
                      onClick={() => setCollapsed((c) => ({ ...c, [group]: !c[group] }))}
                      className={`flex w-full border-b border-navy-100 text-left ${
                        isYearly ? 'border-gold-300 bg-gold-100' : 'bg-navy-100'
                      }`}
                    >
                      <div
                        className={`sticky left-0 z-[4] ${colCat} shrink-0 border-r-2 px-[18px] py-2.5 text-[11.5px] font-bold uppercase tracking-wider ${
                          isYearly ? 'border-gold-300 text-gold-600' : 'border-navy-200 text-navy-700'
                        }`}
                      >
                        <span
                          className={`mr-2 inline-flex transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                          aria-hidden
                        >
                          ▾
                        </span>
                        {group}
                        {isYearly && (
                          <span className="ml-2 rounded-full bg-gold-500 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-white">
                            Yearly
                          </span>
                        )}
                      </div>
                      {months.map((_, i) => (
                        <div
                          key={i}
                          className={`${colMonthMin} shrink-0 border-r ${isYearly ? 'border-gold-300' : 'border-navy-200'}`}
                        />
                      ))}
                      <div
                        className={`${colTot} shrink-0 border-l-2 ${isYearly ? 'border-gold-300 bg-gold-100' : 'border-navy-200 bg-navy-100'}`}
                      />
                      <div className={`${colAvg} shrink-0`} />
                    </button>

                    {!isCollapsed &&
                      cats.map((c, ci) => {
                        const stripe = tweaks.stripeRows && ci % 2 === 1;
                        const cells = months.map((p) => budgetLookup.get(`${c.id}|${periodKey(p)}`));
                        const yearTotal = cells.reduce<number>((a, v) => a + (v ?? 0), 0);
                        return (
                          <div
                            key={c.id}
                            className={`group flex ${rowH} ${stripe ? 'bg-gray-50' : 'bg-white'}`}
                          >
                            <div
                              className={`sticky left-0 z-[3] ${colCat} shrink-0 border-b border-gray-100 border-r-2 border-gray-200 px-[18px] text-[13.5px] font-medium text-navy-800 ${stripe ? 'bg-gray-50' : 'bg-white'} group-hover:bg-navy-50/40`}
                            >
                              {c.name}
                            </div>
                            {months.map((p, mi) => (
                              <BudgetMatrixCell
                                key={periodKey(p)}
                                catId={c.id}
                                monthIdx={mi}
                                period={p}
                                category={c}
                                value={cells[mi]}
                                cellFs={cellFs}
                                colMonthMin={colMonthMin}
                                onSave={(raw) => handleCellSave(c, p, raw)}
                                onEnterDown={() => {
                                  const idx = orderedCats.findIndex((x) => x.id === c.id);
                                  const next = orderedCats[idx + 1];
                                  if (!next) return;
                                  document
                                    .querySelector<HTMLElement>(
                                      `[data-budget-cell="${next.id}:${mi}"]`,
                                    )
                                    ?.focus();
                                }}
                              />
                            ))}
                            <div
                              className={`${colTot} shrink-0 flex items-center justify-end border-b border-gray-100 border-l-2 border-navy-200 bg-navy-50 px-3.5 text-[13.5px] font-bold tabular-nums text-navy-800`}
                            >
                              {yearTotal > 0 ? fmtUsd(yearTotal) : <span className="text-gray-300">—</span>}
                            </div>
                            <div
                              className={`flex shrink-0 items-center justify-center border-b border-gray-100 px-2 ${colAvg} ${stripe ? 'bg-gray-50' : 'bg-white'} group-hover:bg-navy-50/40`}
                            >
                              {!c.is_yearly && canonicalSpendGroup(c.group_name) !== 'Yearly' ? (
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  className="rounded-md border border-navy-200 bg-white px-2.5 py-1 text-[11.5px] font-bold text-navy-600 opacity-0 transition-opacity hover:bg-navy-50 group-hover:opacity-100"
                                  title="Pull average"
                                  onClick={(e) => setAvgPopover({ cat: c, anchor: e.currentTarget })}
                                >
                                  Avg ▾
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
                          className={`sticky left-0 z-[3] ${colCat} shrink-0 border-r-2 px-[18px] text-[13px] font-bold ${isYearly ? 'border-gold-300 text-gold-600' : 'border-navy-200 text-navy-800'}`}
                        >
                          {group} subtotal
                        </div>
                        {subs.map((s, i) => (
                          <div
                            key={i}
                            className={`${colMonthMin} flex shrink-0 items-center justify-end border-r px-3 tabular-nums ${cellFs} font-bold ${isYearly ? 'border-gold-300 text-gold-600' : 'border-navy-200 text-navy-700'}`}
                          >
                            {s > 0 ? fmtUsd(s) : <span className="text-gray-300">—</span>}
                          </div>
                        ))}
                        <div
                          className={`${colTot} flex shrink-0 items-center justify-end border-l-2 px-3.5 text-sm font-extrabold tabular-nums ${isYearly ? 'border-gold-600 bg-gold-300 text-gold-600' : 'border-navy-300 bg-navy-100 text-navy-800'}`}
                        >
                          {fmtUsd(subYear)}
                        </div>
                        <div className={`${colAvg} ${isYearly ? 'bg-gold-100' : 'bg-navy-50'}`} />
                      </div>
                    )}
                  </div>
                );
              })}

              <SummaryFlexRow
                label="Monthly Categories Total"
                values={monthlyMonthly}
                total={monthlyCatYearTotal}
                tone="navy"
                colCat={colCat}
                colMonthMin={colMonthMin}
                colTot={colTot}
                colAvg={colAvg}
                rowH={rowH}
                cellFs={cellFs}
              />
              <SummaryFlexRow
                label="Yearly Categories Total"
                values={yearlyMonthly}
                total={yearlyCatYearTotal}
                tone="gold"
                colCat={colCat}
                colMonthMin={colMonthMin}
                colTot={colTot}
                colAvg={colAvg}
                rowH={rowH}
                cellFs={cellFs}
              />
              <SummaryFlexRow
                label="Total Budget"
                values={grandMonthly}
                total={grandTotal}
                tone="grand"
                colCat={colCat}
                colMonthMin={colMonthMin}
                colTot={colTot}
                colAvg={colAvg}
                rowH={rowH}
                cellFs={cellFs}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Year nav */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <details className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-xs">
          <summary className="cursor-pointer font-semibold text-navy-700">Display options</summary>
          <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2">
            <label className="flex items-center gap-2">
              <span className="text-gray-600">Density</span>
              <select
                className="rounded border border-gray-200 px-2 py-1"
                value={tweaks.density}
                onChange={(e) =>
                  setTweaks((t) => ({ ...t, density: e.target.value as BudgetTweaks['density'] }))
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tweaks.showGrandTotalKpi}
                onChange={(e) => setTweaks((t) => ({ ...t, showGrandTotalKpi: e.target.checked }))}
              />
              Show grand-total KPI
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
                checked={tweaks.stripeRows}
                onChange={(e) => setTweaks((t) => ({ ...t, stripeRows: e.target.checked }))}
              />
              Alternate-row stripes
            </label>
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/budget/${year - 1}`)}>
            ← FY {year - 1}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/budget/${year + 1}`)}>
            FY {year + 1} →
          </Button>
          <Link
            to={`/budget/${year}/revise`}
            className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            Reforecast
          </Link>
          <Link
            to="/reports/budget-matrix"
            className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            Budget report
          </Link>
        </div>
      </div>

      {toast && <Toast msg={toast} />}

      {avgPopover && (
        <AvgPopoverPortal
          anchor={avgPopover.anchor}
          onClose={() => setAvgPopover(null)}
          onPickAvg={(n) => fillRow(avgPopover.cat, n)}
          onClearRow={async () => {
            if (!household) return;
            const rows = months.map((p) => ({
              household_id: household.id,
              year: p.year,
              month: p.month,
              category_id: avgPopover.cat.id,
              amount: 0,
            }));
            await upsertBudgetCells(rows);
            invalidateBudget();
            showToast('Row cleared');
            setAvgPopover(null);
          }}
          amounts={{
            3: avgTrailing(avgPopover.cat.id, 3),
            6: avgTrailing(avgPopover.cat.id, 6),
            12: avgTrailing(avgPopover.cat.id, 12),
            36: avgTrailing(avgPopover.cat.id, 36),
          }}
        />
      )}

      {resetOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-navy-800">Reset all budgets?</h2>
            <p className="mt-2 text-sm text-gray-600">
              This removes every budget cell for {year} across spend categories. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => void resetAll()}>
                Reset all
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniKpi({
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
      <div className={`mt-1 text-xl font-extrabold tabular-nums tracking-tight ${accent ?? 'text-navy-600'}`}>
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-gray-400">{sub}</div>
    </div>
  );
}

function AvgPopoverPortal({
  anchor,
  onClose,
  onPickAvg,
  onClearRow,
  amounts,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  onPickAvg: (n: 3 | 6 | 12 | 36) => void;
  onClearRow: () => void;
  amounts: Record<3 | 6 | 12 | 36, number>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rect = anchor.getBoundingClientRect();
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const top = rect.bottom + 6 + window.scrollY;
  const left = Math.min(rect.left + window.scrollX, window.innerWidth - 230);

  return (
    <div
      ref={ref}
      data-avg-popover
      className="fixed z-[100] min-w-[200px] rounded-[10px] border border-gray-200 bg-white p-1.5 shadow-lg"
      style={{ top, left }}
    >
      <div className="px-2.5 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
        Pull average → fill all 12 months
      </div>
      {([3, 6, 12, 36] as const).map((n) => (
        <button
          key={n}
          type="button"
          className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-navy-50"
          onClick={() => onPickAvg(n)}
        >
          Last {n} months avg
          <span className="font-mono text-[11.5px] text-gray-400">{fmtUsd(amounts[n])}</span>
        </button>
      ))}
      <div className="my-1 h-px bg-gray-100" />
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] text-gray-600 hover:bg-navy-50"
        onClick={() => onClearRow()}
      >
        Clear row
        <span className="font-mono text-[11.5px] text-gray-400">$0</span>
      </button>
    </div>
  );
}

function BudgetMatrixCell({
  catId,
  monthIdx,
  period,
  category,
  value,
  cellFs,
  colMonthMin,
  onSave,
  onEnterDown,
}: {
  catId: string;
  monthIdx: number;
  period: Period;
  category: ReportCategory;
  value: number | undefined;
  cellFs: string;
  colMonthMin: string;
  onSave: (raw: string) => void;
  onEnterDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value == null ? '' : String(value));
  }, [value, editing]);

  const baseline = value == null ? '' : String(value);
  const isYearlyRow =
    category.is_yearly || canonicalSpendGroup(category.group_name) === 'Yearly';

  const commitFromBlur = () => {
    if (draft !== baseline) onSave(draft);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        className={`${colMonthMin} shrink-0 border-b border-r border-gray-100 ${cellFs} tabular-nums`}
      >
        <button
          type="button"
          data-budget-cell={`${catId}:${monthIdx}`}
          onClick={() => {
            setDraft(value == null ? '' : String(value));
            setEditing(true);
          }}
          className={`flex h-full min-h-[36px] w-full items-center justify-end px-3 text-right font-medium hover:bg-navy-50/80 focus:outline-none focus:ring-2 focus:ring-navy-400 focus:ring-inset ${
            value == null ? 'text-gray-300' : 'text-navy-800'
          }`}
        >
          {value == null ? (isYearlyRow ? '' : '—') : fmtUsd(value)}
        </button>
      </div>
    );
  }

  return (
    <div className={`${colMonthMin} shrink-0 border-b border-r border-gray-100 ${cellFs}`}>
      <input
        data-budget-cell={`${catId}:${monthIdx}`}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          commitFromBlur();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (draft !== baseline) onSave(draft);
            setEditing(false);
            onEnterDown();
          } else if (e.key === 'Escape') {
            setDraft(baseline);
            setEditing(false);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            if (draft !== baseline) onSave(draft);
            setEditing(false);
            const next = monthIdx + (e.shiftKey ? -1 : 1);
            document
              .querySelector<HTMLElement>(`[data-budget-cell="${catId}:${next}"]`)
              ?.focus();
          }
        }}
        className="h-full min-h-[36px] w-full border-0 bg-white px-3 py-0 text-right font-medium tabular-nums text-navy-800 shadow-[inset_0_0_0_2px_#3b559a] focus:outline-none focus:ring-0"
        aria-label={`${category.name} · ${MONTHS[period.month - 1]} ${period.year}`}
      />
    </div>
  );
}

function SummaryFlexRow({
  label,
  values,
  total,
  tone,
  colCat,
  colMonthMin,
  colTot,
  colAvg,
  rowH,
  cellFs,
}: {
  label: string;
  values: number[];
  total: number;
  tone: 'navy' | 'gold' | 'grand';
  colCat: string;
  colMonthMin: string;
  colTot: string;
  colAvg: string;
  rowH: string;
  cellFs: string;
}) {
  const styles =
    tone === 'grand'
      ? {
          bg: 'bg-navy-800',
          fg: 'text-white',
          border: 'border-navy-900',
          totalBg: 'bg-gold-500',
          totalFg: 'text-navy-900',
        }
      : tone === 'gold'
        ? {
            bg: 'bg-gold-100',
            fg: 'text-gold-600',
            border: 'border-gold-300',
            totalBg: 'bg-gold-300',
            totalFg: 'text-gold-600',
          }
        : {
            bg: 'bg-navy-100',
            fg: 'text-navy-800',
            border: 'border-navy-200',
            totalBg: 'bg-navy-200',
            totalFg: 'text-navy-800',
          };

  return (
    <div className={`flex border-t-2 ${styles.border} ${styles.bg} ${rowH}`}>
      <div
        className={`sticky left-0 z-[3] ${colCat} shrink-0 border-r-2 ${styles.border} px-[18px] text-[12.5px] font-bold uppercase tracking-wide ${tone === 'grand' ? 'py-3 text-sm font-extrabold tracking-wider' : ''} ${styles.fg} flex items-center gap-2`}
      >
        {tone === 'grand' && <span className="h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden />}
        {label}
      </div>
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex ${colMonthMin} shrink-0 items-center justify-end border-r px-3 tabular-nums ${cellFs} font-bold ${styles.fg} ${
            tone === 'grand' ? 'py-3 text-[13.5px] font-extrabold' : ''
          }`}
        >
          {v > 0 ? (
            fmtUsd(v)
          ) : (
            <span className={tone === 'grand' ? 'text-white/30' : 'text-gray-300'}>—</span>
          )}
        </div>
      ))}
      <div
        className={`flex ${colTot} shrink-0 items-center justify-end border-l-2 ${tone === 'grand' ? 'border-gold-500' : tone === 'gold' ? 'border-gold-600' : 'border-navy-300'} px-3.5 tabular-nums ${styles.totalBg} ${styles.totalFg} ${
          tone === 'grand' ? 'text-lg font-extrabold' : 'text-sm font-extrabold'
        }`}
      >
        {fmtUsd(total)}
      </div>
      <div className={`${colAvg} shrink-0 ${styles.bg}`} />
    </div>
  );
}

function sumBudgetPerMonth(
  cats: ReportCategory[],
  months: Period[],
  budgets: BudgetLookup,
): number[] {
  return months.map((p) => {
    let s = 0;
    for (const c of cats) s += budgets.get(`${c.id}|${periodKey(p)}`) ?? 0;
    return s;
  });
}