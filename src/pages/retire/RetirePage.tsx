/**
 * Retirement page — Phase 7 (tabbed layout).
 *
 * Route: /retire
 *
 * Three tabs:
 *   Inputs      — starting balance, annual spend, pinned inputs, outputs KPIs.
 *   Projection  — year-by-year sequence-of-returns table.
 *   Dashboard   — horizontal bar charts showing projected balances at
 *                 various return rates for Jeff's default retire age and two
 *                 earlier what-if ages (retire age − 10, retire age − 5).
 *
 * Balance sheet slice for starting balance uses the app header month
 * (`useAppPeriod`). Year nav for the projection is still the header year;
 * birth years / retire ages are edited in Inputs for what-ifs.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { useAppPeriod } from '@/lib/appPeriodContext';
import {
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchSchemeCategories,
  type ReportCategory,
} from '@/api/reports';
import {
  fetchAllRevisedForYear,
  filterToAsOf,
  listSnapshotMonths,
  type RevisedBudgetRow,
} from '@/api/reforecast';
import {
  fetchBalanceSheetItems,
  fetchBalanceSheetValues,
} from '@/api/balanceSheet';
import {
  effectiveValuesAt,
  periodToBsMonth,
  type BsItem,
} from '@/features/balance-sheet/effective';
import {
  PINNED_RETIRE_KEYS,
  RETIRE_KEY_KINDS,
  RETIRE_KEY_LABELS,
  RETIRE_LEGACY_SPEND_KEY,
  RETIRE_LEGACY_STARTING_BALANCE_KEY,
  RETIRE_SPEND_EXCLUDED_CATEGORY_IDS_KEY,
  RETIRE_SPEND_EXTRA_KEY,
  RETIRE_SPEND_MANUAL_DEFAULT,
  RETIRE_START_BS_ITEM_IDS_KEY,
  RETIRE_START_EXTRA_KEY,
  fetchRetireInputs,
  resolvePinnedInputs,
  upsertRetireInput,
  upsertRetireInputText,
  deleteRetireInput,
  type PinnedRetireKey,
  type RetireInputRow,
  type RetireValueKind,
} from '@/api/retire';
import {
  buildRetireProjection,
  type RetireProjectionRow,
} from '@/features/retire/projection';
import {
  hasRetireStartComposition,
  parseRetireStartBsItemIds,
  resolveRetireStartingBalance,
  sumEffectiveForBsItemIds,
} from '@/features/retire/startingBalance';
import {
  aggregateReforecastAnnualByCategory,
  parseRetireSpendExcludedIds,
  readLegacyRetireSpendAnnual,
  readRetireSpendExtraAnnual,
  reforecastSpendGrandTotal,
  resolveRetireAnnualSpend,
} from '@/features/retire/reforecastSpend';
import {
  canonicalSpendGroup,
  SPEND_GROUP_ORDER,
  type SpendGroup,
} from '@/features/reports/grouping';
import { buildFanChart } from '@/features/retire/fanChart';
import { StatusPanel } from '@/components/StatusPanel';
import { fmtUsd, fmtPct } from '@/lib/money';
import { formatPeriod, type Period } from '@/lib/period';
import { sumByGroup } from '@/api/dashboard';
import { Badge, Button, Card as DsCard, RT } from '@/components/ds';

const PROJECTION_RATES = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12] as const;

type RetireTab = 'inputs' | 'projection' | 'dashboard';

const TABS: { id: RetireTab; label: string }[] = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'projection', label: 'Projection' },
  { id: 'dashboard', label: 'Dashboard' },
];

// ----------------------------------------------------------------------------
// Input parsing helpers
// ----------------------------------------------------------------------------

function parseValue(raw: string, kind: RetireValueKind): number | null {
  const cleaned = raw.replace(/[$,%\s]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (kind === 'rate') {
    return n > 1 ? n / 100 : n;
  }
  return n;
}

function displayValue(value: number, kind: RetireValueKind): string {
  if (kind === 'rate') return (value * 100).toFixed(2);
  if (kind === 'age' || kind === 'year') return String(Math.round(value));
  return String(value);
}

function suffixFor(kind: RetireValueKind): string {
  if (kind === 'rate') return '%';
  if (kind === 'dollars') return '';
  return '';
}

// ============================================================================
// Page
// ============================================================================

export function RetirePage() {
  const household = useHousehold();
  const qc = useQueryClient();
  const { period } = useAppPeriod();
  const currentYear = period.year;
  const monthsLeft = Math.max(0, 12 - period.month);
  const [activeTab, setActiveTab] = useState<RetireTab>('inputs');

  // ---- Queries ----------------------------------------------------------

  const inputsQ = useQuery({
    queryKey: ['retire-inputs', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchRetireInputs(household!.id),
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

  const reforecastQ = useQuery({
    queryKey: ['reforecast-year', household?.id, period.year],
    enabled: !!household?.id,
    queryFn: () =>
      fetchAllRevisedForYear({ household_id: household!.id, year: period.year }),
  });

  // ---- Loading / error gates --------------------------------------------

  const loading =
    !household ||
    inputsQ.isLoading ||
    itemsQ.isLoading ||
    valuesQ.isLoading ||
    schemeQ.isLoading ||
    categoriesQ.isLoading ||
    reforecastQ.isLoading;
  const err =
    inputsQ.error ||
    itemsQ.error ||
    valuesQ.error ||
    schemeQ.error ||
    categoriesQ.error ||
    reforecastQ.error;

  // ---- Derived ----------------------------------------------------------

  const retireRows = inputsQ.data ?? [];

  const effectiveBs = useMemo(() => {
    const values = valuesQ.data ?? [];
    if (values.length === 0) return new Map<string, number>();
    return effectiveValuesAt(values, periodToBsMonth(period));
  }, [valuesQ.data, period]);

  const resolvedStartingBalance = useMemo(
    () => resolveRetireStartingBalance(retireRows, effectiveBs, itemsQ.data ?? []),
    [retireRows, effectiveBs, itemsQ.data],
  );

  const spendCategories = useMemo(() => {
    const cats = categoriesQ.data ?? [];
    return cats
      .filter((c) => canonicalSpendGroup(c.group_name) !== null)
      .sort((a, b) => {
        const ga = canonicalSpendGroup(a.group_name)!;
        const gb = canonicalSpendGroup(b.group_name)!;
        const ia = SPEND_GROUP_ORDER.indexOf(ga);
        const ib = SPEND_GROUP_ORDER.indexOf(gb);
        if (ia !== ib) return ia - ib;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  }, [categoriesQ.data]);

  const latestReforecastRows = useMemo(() => {
    const all = reforecastQ.data ?? [];
    const months = listSnapshotMonths(all);
    if (months.length === 0) return [];
    return filterToAsOf(all, months[0]!);
  }, [reforecastQ.data]);

  const resolvedRetireSpend = useMemo(
    () => resolveRetireAnnualSpend(retireRows, latestReforecastRows, spendCategories),
    [retireRows, latestReforecastRows, spendCategories],
  );

  const inputs = useMemo(
    () => ({
      ...resolvePinnedInputs(retireRows),
      starting_balance: resolvedStartingBalance,
      retire_spend: resolvedRetireSpend,
    }),
    [retireRows, resolvedStartingBalance, resolvedRetireSpend],
  );

  // Suppress the unused-import warning for sumByGroup; we keep the import as
  // a future hook (when we want per-category breakdown on this page).
  void sumByGroup;

  // ---- Projections ------------------------------------------------------

  const projection = useMemo(
    () =>
      buildRetireProjection(inputs, {
        startYear: currentYear,
        monthsLeftInFirstYear: monthsLeft || 12,
      }),
    [inputs, currentYear, monthsLeft],
  );

  // ---- Dashboard chart data (accumulation-only at various rates & ages) --

  const jeffRetireAge = inputs.jeff_retire_age;
  const jeffBirthYear = inputs.jeff_birth_year;
  const yearlyContrib = inputs.jeff_yearly_contrib + inputs.brit_yearly_contrib;

  const dashboardCharts = useMemo(() => {
    const ages = [jeffRetireAge - 10, jeffRetireAge - 5, jeffRetireAge];
    return ages.map((age) => {
      const retireYr = jeffBirthYear + age;
      const series = buildFanChart({
        startingBalance: inputs.starting_balance,
        yearlyContrib,
        monthsLeftInFirstYear: monthsLeft || 12,
        startYear: currentYear,
        endYear: Math.max(retireYr, currentYear + 1),
        rates: PROJECTION_RATES,
      });
      const lastPoint = series.points[series.points.length - 1];
      return {
        age,
        retireYear: retireYr,
        bars: PROJECTION_RATES.map((rate) => ({
          rate,
          balance: lastPoint?.byRate.get(rate) ?? 0,
        })),
      };
    });
  }, [jeffRetireAge, jeffBirthYear, inputs.starting_balance, yearlyContrib, monthsLeft, currentYear]);

  // ---- Mutation helper --------------------------------------------------

  async function commitInput(key: PinnedRetireKey, value: number | null) {
    if (!household) return;
    await upsertRetireInput({
      household_id: household.id,
      key,
      value,
    });
    qc.invalidateQueries({ queryKey: ['retire-inputs', household.id] });
  }

  async function invalidateRetireInputs() {
    if (!household) return;
    qc.invalidateQueries({ queryKey: ['retire-inputs', household.id] });
  }

  async function persistBsStartIds(nextIds: string[]) {
    if (!household) return;
    const rowsSnapshot = retireRows;
    const wasLegacyOnly = !hasRetireStartComposition(rowsSnapshot);
    await upsertRetireInputText({
      household_id: household.id,
      key: RETIRE_START_BS_ITEM_IDS_KEY,
      text: JSON.stringify(nextIds),
    });
    if (wasLegacyOnly && nextIds.length > 0) {
      const leg = rowsSnapshot.find((r) => r.key === RETIRE_LEGACY_STARTING_BALANCE_KEY);
      if (leg && Number.isFinite(leg.value) && leg.value > 0) {
        const fromNew = sumEffectiveForBsItemIds(nextIds, effectiveBs, itemsQ.data ?? []);
        const implied = Math.max(0, leg.value - fromNew);
        await upsertRetireInput({
          household_id: household.id,
          key: RETIRE_START_EXTRA_KEY,
          value: implied,
        });
      }
    }
    await invalidateRetireInputs();
  }

  async function commitStartExtra(n: number | null) {
    if (!household) return;
    if (n == null || !Number.isFinite(n)) {
      await deleteRetireInput({ household_id: household.id, key: RETIRE_START_EXTRA_KEY });
    } else {
      await upsertRetireInput({
        household_id: household.id,
        key: RETIRE_START_EXTRA_KEY,
        value: n,
      });
    }
    await invalidateRetireInputs();
  }

  async function clearStartComposition() {
    if (!household) return;
    await deleteRetireInput({ household_id: household.id, key: RETIRE_START_BS_ITEM_IDS_KEY });
    await deleteRetireInput({ household_id: household.id, key: RETIRE_START_EXTRA_KEY });
    await invalidateRetireInputs();
  }

  async function persistSpendExcluded(next: Set<string>) {
    if (!household) return;
    await upsertRetireInputText({
      household_id: household.id,
      key: RETIRE_SPEND_EXCLUDED_CATEGORY_IDS_KEY,
      text: JSON.stringify([...next]),
    });
    await invalidateRetireInputs();
  }

  async function commitLegacyRetireSpend(n: number | null) {
    if (!household) return;
    if (n == null || !Number.isFinite(n)) {
      await deleteRetireInput({ household_id: household.id, key: RETIRE_LEGACY_SPEND_KEY });
    } else {
      await upsertRetireInput({
        household_id: household.id,
        key: RETIRE_LEGACY_SPEND_KEY,
        value: n,
      });
    }
    await invalidateRetireInputs();
  }

  async function commitRetireSpendExtra(n: number | null) {
    if (!household) return;
    if (n == null || !Number.isFinite(n)) {
      await deleteRetireInput({ household_id: household.id, key: RETIRE_SPEND_EXTRA_KEY });
    } else {
      await upsertRetireInput({
        household_id: household.id,
        key: RETIRE_SPEND_EXTRA_KEY,
        value: n,
      });
    }
    await invalidateRetireInputs();
  }

  const selectedBsIds = useMemo(() => parseRetireStartBsItemIds(retireRows), [retireRows]);

  // ---- Render -----------------------------------------------------------

  if (err) {
    return (
      <StatusPanel
        kind="error"
        message="Couldn't load Retire data."
        detail={String((err as Error).message ?? err)}
      />
    );
  }
  if (loading) {
    return <StatusPanel kind="loading" message="Loading Retire…" />;
  }

  const summary = projection.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body-base text-gray-500">
          Sequence-of-returns projection from {currentYear}.
        </p>
        <MoneyLastsBadge summary={summary} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-navy-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-navy-700 text-navy-900'
                : 'text-gray-500 hover:text-navy-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ───── Inputs tab ───── */}
      {activeTab === 'inputs' && (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <KpiCard
              title="Money at retire age"
              subtitle={`End of ${summary.laterRetireStartYear - 1} — before the later retirement in ${summary.laterRetireStartYear}`}
            >
              <div className="text-3xl font-bold tabular-nums text-navy-900">
                {summary.moneyAtRetireAge == null
                  ? '—'
                  : fmtUsd(summary.moneyAtRetireAge)}
              </div>
            </KpiCard>
            <KpiCard
              title="Retirement starting balance"
              subtitle="Checked balance sheet assets plus manual adjustment (or legacy total if not linked)"
            >
              <div className="text-3xl font-bold tabular-nums text-navy-900">
                {fmtUsd(resolvedStartingBalance)}
              </div>
            </KpiCard>
          </section>

          <StartingBalanceSection
            rows={retireRows}
            items={itemsQ.data ?? []}
            effective={effectiveBs}
            period={period}
            resolvedTotal={resolvedStartingBalance}
            selectedIds={selectedBsIds}
            onToggleBsId={async (id) => {
              const next = selectedBsIds.includes(id)
                ? selectedBsIds.filter((x) => x !== id)
                : [...selectedBsIds, id];
              await persistBsStartIds(next);
            }}
            onCommitExtra={(n) => commitStartExtra(n)}
            onClearComposition={() => clearStartComposition()}
            onCommitLegacy={async (n) => {
              if (!household) return;
              if (n == null || !Number.isFinite(n)) {
                await deleteRetireInput({
                  household_id: household.id,
                  key: RETIRE_LEGACY_STARTING_BALANCE_KEY,
                });
              } else {
                await upsertRetireInput({
                  household_id: household.id,
                  key: RETIRE_LEGACY_STARTING_BALANCE_KEY,
                  value: n,
                });
              }
              await invalidateRetireInputs();
            }}
          />

          <RetireSpendSection
            year={currentYear}
            rows={retireRows}
            spendCategories={spendCategories}
            latestReforecastRows={latestReforecastRows}
            resolvedAnnualSpend={resolvedRetireSpend}
            onToggleCategoryExcluded={async (categoryId) => {
              const ex = parseRetireSpendExcludedIds(retireRows);
              if (ex.has(categoryId)) ex.delete(categoryId);
              else ex.add(categoryId);
              await persistSpendExcluded(ex);
            }}
            onClearSpendExclusions={async () => {
              if (!household) return;
              await deleteRetireInput({
                household_id: household.id,
                key: RETIRE_SPEND_EXCLUDED_CATEGORY_IDS_KEY,
              });
              await invalidateRetireInputs();
            }}
            onCommitManual={(n) => commitLegacyRetireSpend(n)}
            onCommitSpendExtra={(n) => commitRetireSpendExtra(n)}
          />

          <DsCard padded={false}>
            <DsCard.Header title="Inputs" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 md:grid-cols-2 lg:grid-cols-3">
              {PINNED_RETIRE_KEYS.map((k) => (
                <RetireInputRow
                  key={k}
                  k={k}
                  kind={RETIRE_KEY_KINDS[k]}
                  label={RETIRE_KEY_LABELS[k]}
                  value={inputs[k]}
                  onCommit={(v) => commitInput(k, v)}
                />
              ))}
            </div>
          </DsCard>

          <DsCard padded={false}>
            <DsCard.Header
              title="Outputs"
              subtitle="Key outcomes from the projection with your current inputs."
            />
            <div className="divide-y divide-navy-100">
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="text-gray-700">Money lasts</span>
                <span className="font-semibold text-navy-900">
                  {summary.moneyLasts === 'Forever' ? 'Forever' : `${summary.moneyLasts} years`}
                </span>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-gray-700">Money at retire age</span>
                  <span className="font-semibold tabular-nums text-navy-900">
                    {summary.moneyAtRetireAge == null ? '—' : fmtUsd(summary.moneyAtRetireAge)}
                  </span>
                </div>
                <p className="mt-1 text-caption text-gray-500">
                  Balance at end of {summary.laterRetireStartYear - 1}, the calendar year before the{' '}
                  <span className="font-medium text-gray-700">later</span> of Jeff or Brit reaches retire age (
                  {summary.laterRetireStartYear}).
                </p>
              </div>
              <div className="bg-navy-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                Age when money runs out
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="text-gray-700">Jeff</span>
                <span className="font-semibold tabular-nums text-navy-900">
                  {summary.jeffRunsOutAge === 'Never' ? 'Never' : summary.jeffRunsOutAge}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="text-gray-700">Brit</span>
                <span className="font-semibold tabular-nums text-navy-900">
                  {summary.britRunsOutAge === 'Never' ? 'Never' : summary.britRunsOutAge}
                </span>
              </div>
            </div>
          </DsCard>
        </>
      )}

      {/* ───── Projection tab ───── */}
      {activeTab === 'projection' && (
        <DsCard padded={false}>
          <DsCard.Header
            title={`Year-by-year projection (${(inputs.return_rate * 100).toFixed(1)}% return, ${(inputs.retire_tax_rate * 100).toFixed(0)}% tax)`}
            subtitle={`${projection.rows.length} years`}
          />
          <RetireTable rows={projection.rows} firstNegIdx={summary.firstNegativeIndex} />
        </DsCard>
      )}

      {/* ───── Dashboard tab ───── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <DsCard padded={false}>
            <DsCard.Header title="Inputs" subtitle="Changes here sync with the Inputs tab." />
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 md:grid-cols-2 lg:grid-cols-3">
              {PINNED_RETIRE_KEYS.map((k) => (
                <RetireInputRow
                  key={k}
                  k={k}
                  kind={RETIRE_KEY_KINDS[k]}
                  label={RETIRE_KEY_LABELS[k]}
                  value={inputs[k]}
                  onCommit={(v) => commitInput(k, v)}
                />
              ))}
            </div>
          </DsCard>

          <DsCard>
            <div className="text-h4 text-navy-800">
              Proj Retirement Balances by Return Rate (Age {jeffRetireAge})
            </div>
            <div className="mt-0.5 text-caption text-gray-500">
              Starting balance {fmtUsd(inputs.starting_balance)} + {fmtUsd(yearlyContrib)}/yr contributions, no spending
            </div>
            <div className="mt-4">
              <HorizontalBarChart bars={dashboardCharts[2].bars} large />
            </div>
          </DsCard>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DsCard>
              <div className="text-h4 text-navy-800">
                Retire at {dashboardCharts[0].age}
              </div>
              <div className="mt-0.5 text-caption text-gray-500">
                {currentYear} → {dashboardCharts[0].retireYear}
              </div>
              <div className="mt-4">
                <HorizontalBarChart bars={dashboardCharts[0].bars} />
              </div>
            </DsCard>
            <DsCard>
              <div className="text-h4 text-navy-800">
                Retire at {dashboardCharts[1].age}
              </div>
              <div className="mt-0.5 text-caption text-gray-500">
                {currentYear} → {dashboardCharts[1].retireYear}
              </div>
              <div className="mt-4">
                <HorizontalBarChart bars={dashboardCharts[1].bars} />
              </div>
            </DsCard>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function StartingBalanceSection({
  rows,
  items,
  effective,
  period,
  resolvedTotal,
  selectedIds,
  onToggleBsId,
  onCommitExtra,
  onClearComposition,
  onCommitLegacy,
}: {
  rows: RetireInputRow[];
  items: BsItem[];
  effective: Map<string, number>;
  period: Period;
  resolvedTotal: number;
  selectedIds: string[];
  onToggleBsId: (id: string) => Promise<void>;
  onCommitExtra: (n: number | null) => Promise<void>;
  onClearComposition: () => Promise<void>;
  onCommitLegacy: (n: number | null) => Promise<void>;
}) {
  const hasComp = hasRetireStartComposition(rows);
  const extraRow = rows.find((r) => r.key === RETIRE_START_EXTRA_KEY);
  const extraNum = extraRow && Number.isFinite(extraRow.value) ? extraRow.value : null;
  const legacyRow = rows.find((r) => r.key === RETIRE_LEGACY_STARTING_BALANCE_KEY);
  const legacyNum =
    legacyRow && Number.isFinite(legacyRow.value) ? legacyRow.value : null;

  const fromBs = sumEffectiveForBsItemIds(selectedIds, effective, items);
  const extraForSummary = extraNum ?? 0;

  const assets = useMemo(
    () =>
      items
        .filter((i) => i.is_active && i.type === 'asset')
        .sort(
          (a, b) =>
            a.sort_order - b.sort_order ||
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        ),
    [items],
  );

  const [extraDraft, setExtraDraft] = useState('');
  useEffect(() => {
    setExtraDraft(extraNum == null ? '' : String(extraNum));
  }, [extraNum]);

  const [legacyDraft, setLegacyDraft] = useState('');
  useEffect(() => {
    setLegacyDraft(legacyNum == null ? '' : String(legacyNum));
  }, [legacyNum]);

  return (
    <DsCard padded={false}>
      <DsCard.Header
        title="Starting balance"
        subtitle={`Balance sheet portion uses ${formatPeriod(period)} (same as the header). Check asset accounts, add any extra dollars, or enter a single legacy amount when not using balance sheet links.`}
        action={
          hasComp ? (
            <Button variant="secondary" size="sm" onClick={() => void onClearComposition()}>
              Clear BS link
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4 p-4">
        {!hasComp && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Single starting amount</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={legacyDraft}
                onChange={(e) => setLegacyDraft(e.target.value)}
                onBlur={() => {
                  const cleaned = legacyDraft.replace(/[$,\s]/g, '').trim();
                  if (cleaned === '') {
                    if (legacyNum != null) void onCommitLegacy(null);
                    return;
                  }
                  const p = parseValue(legacyDraft, 'dollars');
                  if (p === null || !Number.isFinite(p)) {
                    setLegacyDraft(legacyNum == null ? '' : String(legacyNum));
                    return;
                  }
                  if (p === legacyNum) return;
                  void onCommitLegacy(p);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="w-40 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
              />
            </div>
          </div>
        )}

        <div>
          <div className="text-label uppercase tracking-wider text-gray-500">
            Balance sheet assets
          </div>
          <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-md border border-navy-100 p-2">
            {assets.length === 0 ? (
              <p className="text-caption text-gray-400">
                No active assets on the balance sheet. Add some under Planning → Balance Sheet.
              </p>
            ) : (
              assets.map((it) => {
                const ev = effective.get(it.id);
                return (
                  <label
                    key={it.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-navy-50/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(it.id)}
                      onChange={() => void onToggleBsId(it.id)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-gray-800">{it.name}</span>
                    {it.equity_group ? (
                      <span className="text-caption text-gray-400">({it.equity_group})</span>
                    ) : null}
                    <span className="ml-auto shrink-0 tabular-nums text-caption text-gray-500">
                      {ev == null ? '—' : fmtUsd(ev)}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-navy-100 pt-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label className="text-label uppercase tracking-wider text-gray-500">
              Additional (manual)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={extraDraft}
              onChange={(e) => setExtraDraft(e.target.value)}
              onBlur={() => {
                const cleaned = extraDraft.replace(/[$,\s]/g, '').trim();
                if (cleaned === '') {
                  if (extraNum != null) void onCommitExtra(null);
                  return;
                }
                const p = parseValue(extraDraft, 'dollars');
                if (p === null || !Number.isFinite(p)) {
                  setExtraDraft(extraNum == null ? '' : String(extraNum));
                  return;
                }
                if (p === extraNum) return;
                void onCommitExtra(p);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="mt-1 w-40 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
            />
          </div>
          <div className="text-right text-sm text-gray-600">
            <div>
              From balance sheet picks:{' '}
              <span className="font-semibold text-navy-800">{fmtUsd(fromBs)}</span>
            </div>
            <div>
              Additional:{' '}
              <span className="font-semibold text-navy-800">{fmtUsd(extraForSummary)}</span>
            </div>
            <div className="mt-1 text-base font-bold text-navy-900">
              Total starting balance: {fmtUsd(resolvedTotal)}
            </div>
          </div>
        </div>
      </div>
    </DsCard>
  );
}

function RetireSpendSection({
  year,
  rows,
  spendCategories,
  latestReforecastRows,
  resolvedAnnualSpend,
  onToggleCategoryExcluded,
  onClearSpendExclusions,
  onCommitManual,
  onCommitSpendExtra,
}: {
  year: number;
  rows: RetireInputRow[];
  spendCategories: ReportCategory[];
  latestReforecastRows: RevisedBudgetRow[];
  resolvedAnnualSpend: number;
  onToggleCategoryExcluded: (categoryId: string) => Promise<void>;
  onClearSpendExclusions: () => Promise<void>;
  onCommitManual: (n: number | null) => Promise<void>;
  onCommitSpendExtra: (n: number | null) => Promise<void>;
}) {
  const hasReforecast = latestReforecastRows.length > 0;
  const annualByCategory = useMemo(
    () => aggregateReforecastAnnualByCategory(latestReforecastRows),
    [latestReforecastRows],
  );
  const reforecastGrand = useMemo(
    () => reforecastSpendGrandTotal(spendCategories, annualByCategory),
    [spendCategories, annualByCategory],
  );
  const reforecastAsOf = latestReforecastRows[0]?.as_of_month ?? null;
  const categoriesBySpendGroup = useMemo(() => {
    const m = new Map<SpendGroup, ReportCategory[]>();
    for (const g of SPEND_GROUP_ORDER) m.set(g, []);
    for (const c of spendCategories) {
      const g = canonicalSpendGroup(c.group_name);
      if (!g) continue;
      m.get(g)!.push(c);
    }
    return m;
  }, [spendCategories]);
  const excluded = parseRetireSpendExcludedIds(rows);
  const manualRow = rows.find((r) => r.key === RETIRE_LEGACY_SPEND_KEY);
  const manualStored = manualRow && Number.isFinite(manualRow.value) ? manualRow.value : null;
  const spendExtraNum = readRetireSpendExtraAnnual(rows);
  const includedReforecastSpend = useMemo(() => {
    const ex = parseRetireSpendExcludedIds(rows);
    let t = 0;
    for (const c of spendCategories) {
      if (ex.has(c.id)) continue;
      t += annualByCategory.get(c.id) ?? 0;
    }
    return t;
  }, [rows, spendCategories, annualByCategory]);

  const [manualDraft, setManualDraft] = useState('');
  useEffect(() => {
    if (hasReforecast) return;
    const display =
      manualStored == null ? readLegacyRetireSpendAnnual(rows) : manualStored;
    setManualDraft(String(Math.round(display)));
  }, [hasReforecast, manualStored, rows]);

  const [spendExtraDraft, setSpendExtraDraft] = useState('');
  useEffect(() => {
    if (!hasReforecast) return;
    setSpendExtraDraft(spendExtraNum === 0 ? '' : String(spendExtraNum));
  }, [hasReforecast, spendExtraNum]);

  return (
    <DsCard padded={false}>
      <DsCard.Header
        title="Annual retirement spend"
        subtitle={
          hasReforecast ? (
            <>
              Latest reforecast for {year}
              {reforecastAsOf != null ? ` (snapshot as-of month ${reforecastAsOf})` : ''}. Uncheck a
              category to exclude it from the projection total (for example, rent if it goes away
              in retirement). Use additional manual to layer on costs not in the budget (travel,
              healthcare buffer, etc.).
            </>
          ) : (
            <>
              No saved reforecast for {year}. Enter an annual amount below, or build a snapshot in{' '}
              <Link to={`/budget/${year}/revise`} className="font-medium text-navy-700 underline">
                Reforecast
              </Link>
              .
            </>
          )
        }
        action={
          hasReforecast && excluded.size > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => void onClearSpendExclusions()}>
              Reset exclusions
            </Button>
          ) : undefined
        }
      />
      <div className="p-4">
        {!hasReforecast && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Annual retirement spend</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={manualDraft}
                onChange={(e) => setManualDraft(e.target.value)}
                onBlur={() => {
                  const cleaned = manualDraft.replace(/[$,\s]/g, '').trim();
                  if (cleaned === '') {
                    void onCommitManual(null);
                    return;
                  }
                  const p = parseValue(manualDraft, 'dollars');
                  if (p === null || !Number.isFinite(p)) {
                    const display =
                      manualStored == null
                        ? readLegacyRetireSpendAnnual(rows)
                        : manualStored;
                    setManualDraft(String(Math.round(display)));
                    return;
                  }
                  if (p === manualStored) return;
                  void onCommitManual(p);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="w-44 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
              />
            </div>
          </div>
        )}

        {hasReforecast && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
              <span>
                Reforecast full-year spend (all categories):{' '}
                <span className="font-semibold text-navy-800">{fmtUsd(reforecastGrand)}</span>
              </span>
              <Link
                to={`/budget/${year}/revise`}
                className="shrink-0 text-sm font-medium text-navy-700 underline hover:text-navy-900"
              >
                Edit in Reforecast →
              </Link>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-navy-100">
              <table className={RT.table}>
                <thead className={RT.head}>
                  <tr>
                    <th className={`${RT.th} w-10`} aria-label="Include" />
                    <th className={`${RT.th} ${RT.thLeft}`}>Category</th>
                    <th className={`${RT.th} ${RT.thRight}`}>Annual</th>
                  </tr>
                </thead>
                <tbody>
                  {SPEND_GROUP_ORDER.map((group) => {
                    const cats = categoriesBySpendGroup.get(group) ?? [];
                    if (cats.length === 0) return null;
                    const groupAnnualTotal = cats.reduce(
                      (sum, c) => sum + (annualByCategory.get(c.id) ?? 0),
                      0,
                    );
                    return (
                      <Fragment key={group}>
                        <tr className={RT.groupRow}>
                          <td colSpan={3} className={RT.groupCell}>
                            {group}
                          </td>
                        </tr>
                        {cats.map((c) => {
                          const annual = annualByCategory.get(c.id) ?? 0;
                          const included = !excluded.has(c.id);
                          return (
                            <tr key={c.id} className={RT.detailRow}>
                              <td className="px-3 py-1.5 align-middle">
                                <input
                                  type="checkbox"
                                  checked={included}
                                  onChange={() => void onToggleCategoryExcluded(c.id)}
                                  className="rounded border-gray-300"
                                  title="Include in retirement spend"
                                />
                              </td>
                              <td className={RT.cellLeft}>{c.name}</td>
                              <td className={RT.cellRight}>{fmtUsd(annual)}</td>
                            </tr>
                          );
                        })}
                        <tr className={RT.subtotalRow}>
                          <td colSpan={2} className={RT.cellLeft}>
                            {group} subtotal
                          </td>
                          <td className={RT.cellRight}>{fmtUsd(groupAnnualTotal)}</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-navy-100 pt-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <label className="text-label uppercase tracking-wider text-gray-500">
                  Additional (manual)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={spendExtraDraft}
                  onChange={(e) => setSpendExtraDraft(e.target.value)}
                  onBlur={() => {
                    const cleaned = spendExtraDraft.replace(/[$,\s]/g, '').trim();
                    if (cleaned === '') {
                      if (spendExtraNum !== 0) void onCommitSpendExtra(null);
                      return;
                    }
                    const p = parseValue(spendExtraDraft, 'dollars');
                    if (p === null || !Number.isFinite(p)) {
                      setSpendExtraDraft(spendExtraNum === 0 ? '' : String(spendExtraNum));
                      return;
                    }
                    if (p === spendExtraNum) return;
                    void onCommitSpendExtra(p);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  placeholder="0"
                  className="mt-1 w-44 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
                />
              </div>
              <p className="max-w-md text-caption text-gray-500 sm:text-right">
                Annual dollars added on top of checked categories (not a budget line). Use a
                negative value to reduce the total. Clear the field to drop the adjustment.
              </p>
            </div>
            <div className="mt-3 rounded-md bg-navy-50 px-4 py-3 text-sm text-navy-900">
              {Math.abs(spendExtraNum) > 0.005 && (
                <div className="mb-2 space-y-1 border-b border-navy-200/60 pb-2 text-caption text-gray-700">
                  <div className="flex justify-between gap-4">
                    <span>Included reforecast</span>
                    <span className="shrink-0 font-semibold tabular-nums text-navy-800">
                      {fmtUsd(includedReforecastSpend)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Additional (manual)</span>
                    <span className="shrink-0 font-semibold tabular-nums text-navy-800">
                      {fmtUsd(spendExtraNum)}
                    </span>
                  </div>
                </div>
              )}
              <span className="font-semibold">Projection uses </span>
              <span className="text-lg font-bold tabular-nums">{fmtUsd(resolvedAnnualSpend)}</span>
              <span className="font-semibold"> /yr</span>
              {reforecastGrand > includedReforecastSpend + 0.005 && (
                <span className="ml-2 text-caption text-gray-600">
                  (excluding {fmtUsd(reforecastGrand - includedReforecastSpend)} from unchecked
                  lines)
                </span>
              )}
            </div>
          </>
        )}

        {!hasReforecast && (
          <p className="mt-3 text-caption text-gray-500">
            If you clear the field, the model uses the default {fmtUsd(RETIRE_SPEND_MANUAL_DEFAULT)}{' '}
            /yr until you save a number.
          </p>
        )}
      </div>
    </DsCard>
  );
}

function MoneyLastsBadge({
  summary,
}: {
  summary: ReturnType<typeof buildRetireProjection>['summary'];
}) {
  const lasts = summary.moneyLasts;
  if (lasts === 'Forever') {
    return (
      <Badge tone="pos" dot>
        Money lasts forever
      </Badge>
    );
  }
  return (
    <Badge tone="warn" dot>
      Runs out in {lasts} year{lasts === 1 ? '' : 's'}
      {summary.jeffRunsOutAge !== 'Never' && (
        <span className="ml-2 opacity-80">
          (Jeff age {summary.jeffRunsOutAge}, Brit age {summary.britRunsOutAge})
        </span>
      )}
    </Badge>
  );
}

function KpiCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <DsCard>
      <div className="text-label uppercase text-gray-500">{title}</div>
      {subtitle && (
        <div className="mt-0.5 text-caption text-gray-500">{subtitle}</div>
      )}
      <div className="mt-3">{children}</div>
    </DsCard>
  );
}

function RetireInputRow({
  kind,
  label,
  value,
  onCommit,
}: {
  k: PinnedRetireKey;
  kind: RetireValueKind;
  label: string;
  value: number;
  onCommit: (v: number | null) => void;
}) {
  const display = displayValue(value, kind);
  const [local, setLocal] = useState(display);
  useEffect(() => setLocal(display), [display]);

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm text-gray-700">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            const parsed = parseValue(local, kind);
            if (parsed === null || !Number.isFinite(parsed)) {
              setLocal(display);
              return;
            }
            if (parsed === value) return;
            onCommit(parsed);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setLocal(display);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
        />
        <span className="w-3 text-xs text-gray-400">{suffixFor(kind)}</span>
      </div>
    </div>
  );
}

function RetireTable({
  rows,
  firstNegIdx,
}: {
  rows: RetireProjectionRow[];
  firstNegIdx: number | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className={RT.head}>
          <tr>
            <th className={`${RT.th} ${RT.thLeft}`}>Year</th>
            <th className={`${RT.th} ${RT.thRight}`}>Jeff age</th>
            <th className={`${RT.th} ${RT.thRight}`}>Brit age</th>
            <th className={`${RT.th} ${RT.thRight}`}>Contribs</th>
            <th className={`${RT.th} ${RT.thRight}`}>SS</th>
            <th className={`${RT.th} ${RT.thRight}`}>Spend</th>
            <th className={`${RT.th} ${RT.thRight}`}>Taxes</th>
            <th className={`${RT.th} ${RT.thRight}`}>Beg</th>
            <th className={`${RT.th} ${RT.thRight}`}>Gains</th>
            <th className={`${RT.th} ${RT.thRight}`}>End</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-100">
          {rows.map((r, i) => {
            const isFirstNeg = firstNegIdx !== null && i === firstNegIdx;
            const isNeg = r.endBalance < 0;
            return (
              <tr
                key={r.year}
                className={
                  isFirstNeg
                    ? 'bg-warn-soft'
                    : isNeg
                      ? 'bg-neg-soft'
                      : 'hover:bg-navy-50/40'
                }
              >
                <td className="px-3 py-1 font-semibold tabular-nums text-navy-800">
                  {r.year}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">{r.jeffAge}</td>
                <td className="px-3 py-1 text-right tabular-nums">{r.britAge}</td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {r.jeffContrib + r.britContrib === 0
                    ? ''
                    : fmtUsd(r.jeffContrib + r.britContrib, { decimals: 0 })}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {r.jeffSs + r.britSs === 0
                    ? ''
                    : fmtUsd(r.jeffSs + r.britSs, { decimals: 0 })}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {r.spend === 0 ? '' : fmtUsd(r.spend, { decimals: 0 })}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {r.taxes === 0 ? '' : fmtUsd(r.taxes, { decimals: 0 })}
                </td>
                <td className="px-3 py-1 text-right tabular-nums text-gray-500">
                  {fmtUsd(r.begBalance, { decimals: 0 })}
                </td>
                <td className="px-3 py-1 text-right tabular-nums text-gray-500">
                  {fmtUsd(r.interestGains, { decimals: 0 })}
                </td>
                <td
                  className={`px-3 py-1 text-right font-semibold tabular-nums ${
                    isNeg ? 'text-neg' : 'text-navy-900'
                  }`}
                >
                  {fmtUsd(r.endBalance, { decimals: 0 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Use fmtPct so it's not flagged as unused (we may use it in tooltips later).
void fmtPct;

// ----------------------------------------------------------------------------
// Horizontal bar chart — projected balances by return rate
// ----------------------------------------------------------------------------

const BAR_COLORS = [
  '#3b559a', // navy-500 (lighter, for smallest bars)
  '#2f4580',
  '#243460',
  '#1e2c52',
  '#182445',
  '#0d1527', // navy-900 (darkest, for largest bars)
];

function HorizontalBarChart({
  bars,
  large,
}: {
  bars: { rate: number; balance: number }[];
  large?: boolean;
}) {
  const maxVal = Math.max(...bars.map((b) => b.balance), 1);
  const barHeight = large ? 36 : 28;
  const gap = large ? 10 : 6;

  return (
    <div className="space-y-0" style={{ gap }}>
      {bars.map((bar, i) => {
        const widthPct = Math.max(1, (bar.balance / maxVal) * 100);
        return (
          <div key={bar.rate} className="flex items-center" style={{ gap: 8, marginBottom: gap }}>
            <div
              className="shrink-0 text-right tabular-nums text-gray-600"
              style={{ width: 32, fontSize: large ? 13 : 12 }}
            >
              {(bar.rate * 100).toFixed(0)}%
            </div>
            <div className="relative flex-1" style={{ height: barHeight }}>
              <div
                className="absolute inset-y-0 left-0 rounded-r"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                }}
              />
              <span
                className="absolute inset-y-0 flex items-center font-semibold tabular-nums text-white"
                style={{
                  left: `${Math.min(widthPct, 97)}%`,
                  paddingLeft: 8,
                  fontSize: large ? 13 : 11,
                  color: widthPct > 60 ? '#ffffff' : '#1a2744',
                  transform: widthPct > 60 ? `translateX(calc(-100% - 8px))` : undefined,
                }}
              >
                {fmtUsd(bar.balance, { decimals: 0 })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
