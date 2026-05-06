/**
 * Assumptions & Projections page — Phase 6.
 *
 * Route: /assumptions  (anchors on the year of useDefaultPeriod)
 *        /assumptions/:year  (bookmarkable for any year)
 *
 * Replaces the spreadsheet's "Main Detail" tab. Five sections:
 *
 *   1. Header — year nav + Projection-vs-Actual waterfall side-by-side.
 *   2. Simple Percentages — small 2-column summary table.
 *   3. Income — "Projection" (annual single-cell column) and "Actual"
 *      (12-month grid) tables, source rows you can add / rename / delete.
 *   4. Savings — same shape as Income, account rows.
 *   5. Tax assumptions — pinned typed fields (rates + prev-year inputs)
 *      plus a custom keys area for one-offs.
 *
 * Decision log (locked with user):
 *   - Income / Savings projection: ONE annual cell per source (stored at
 *     month=0). Actual: 12-month grid per source (months 1..12).
 *   - Income / Savings actuals: manual entry only. No category linkage.
 *   - Tax: detail assumptions (rates + prior-year refs), optional explicit
 *     projection vs actual effective tax % (else sum of fed+state+SS+
 *     medicare), plus free-form custom rows.
 *   - Waterfall: inline-SVG, no chart lib (Phase 7 brings Highcharts).
 *   - Expenses projection leg: sum of Budget Editor spend-category budgets for
 *     the year plus an optional manual add (tf_household_settings.data.
 *     expenses_projection.{year}).
 *   - Expenses actual leg: Reforecast "Projected Total" plus optional manual add
 *     (tf_household_settings.data.expenses_actual.{year}). Simple Percentages
 *     leftover = income − tax − savings − expenses for each column.
 *   - Year anchor: useDefaultPeriod, same as Reforecast / Budget / Dashboard.
 */

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { useDefaultPeriod } from '@/lib/useDefaultPeriod';
import {
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchSchemeCategories,
  fetchBudgetYear,
  fetchMonthlyActuals,
  budgetsToLookup,
  actualsToLookup,
} from '@/api/reports';
import { fetchAllRevisedForYear } from '@/api/reforecast';
import {
  PINNED_TAX_DETAIL_KEYS,
  PINNED_TAX_KEYS,
  PINNED_TAX_SIMPLE_KEYS,
  TAX_KEY_LABELS,
  deleteIncomeRow,
  deleteIncomeSource,
  deleteSavingsAccount,
  deleteSavingsRow,
  deleteTaxAssumption,
  fetchExpensesActual,
  fetchExpensesProjection,
  fetchIncomePlan,
  fetchSavingsPlan,
  fetchTaxAssumptions,
  isRateKey,
  renameIncomeSource,
  renameSavingsAccount,
  setExpensesActual,
  setExpensesProjection,
  upsertIncomeRow,
  upsertSavingsRow,
  upsertTaxAssumption,
  type PinnedTaxKey,
  type TaxAssumptionRow,
} from '@/api/assumptions';
import {
  actualByName,
  actualGrid,
  actualTotal,
  buildSimplePercentages,
  buildWaterfall,
  listSources,
  projectionByName,
  projectionTotal,
} from '@/features/assumptions/rollup';
import {
  reforecastProjectedGrandTotal,
  spendCategoriesOnly,
  sumSpendBudgetYearTotal,
} from '@/features/budget/reforecastProjectedGrand';
import { WaterfallChart } from '@/components/WaterfallChart';
import { StatusPanel } from '@/components/StatusPanel';
import { fmtUsd, fmtPct } from '@/lib/money';
import { MONTH_NAMES_SHORT } from '@/lib/period';
import { Button, Card, RT } from '@/components/ds';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function parseMoneyInput(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseRateInput(s: string): number | null {
  // Accepts "28%", "0.28", "28" (treated as percent if > 1).
  const cleaned = s.replace(/[%\s]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

function formatMoneyCellDisplay(
  v: number | null,
  currencyDisplay: boolean,
): string {
  if (v == null) return '';
  return currencyDisplay ? fmtUsd(v, { decimals: 0 }) : String(v);
}

/** Money input that auto-saves on blur. Null/empty deletes. */
function MoneyCell({
  value,
  onCommit,
  className = '',
  placeholder,
  currencyDisplay = false,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  className?: string;
  placeholder?: string;
  /** When true, show committed values as `$12,345` (editable raw while focused). */
  currencyDisplay?: boolean;
}) {
  const [local, setLocal] = useState(() => formatMoneyCellDisplay(value, currencyDisplay));
  // Sync when external value changes (e.g. after refetch).
  useEffect(() => {
    setLocal(formatMoneyCellDisplay(value, currencyDisplay));
  }, [value, currencyDisplay]);

  function revertLocal() {
    setLocal(formatMoneyCellDisplay(value, currencyDisplay));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        if (currencyDisplay && value != null) {
          setLocal(String(value));
        }
      }}
      onBlur={() => {
        const parsed = parseMoneyInput(local);
        if (local.trim() !== '' && parsed === null) {
          revertLocal();
          return;
        }
        const before = value;
        const after = parsed;
        if (before !== after) {
          onCommit(parsed);
        }
        if (currencyDisplay) {
          setLocal(parsed == null ? '' : fmtUsd(parsed, { decimals: 0 }));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          revertLocal();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className={`w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200 ${className}`}
    />
  );
}

// ============================================================================
// Page
// ============================================================================

export function AssumptionsPage() {
  const { year: yearParam } = useParams();
  const navigate = useNavigate();
  const household = useHousehold();
  const defaultPeriod = useDefaultPeriod();
  const qc = useQueryClient();

  // Year anchor: URL param if present, else useDefaultPeriod.
  const resolvedYear = useMemo(() => {
    const y = Number(yearParam);
    if (Number.isFinite(y) && y > 1900) return y;
    return defaultPeriod.period.year;
  }, [yearParam, defaultPeriod.period.year]);

  /** Same `as_of_month` convention as ReforecastPage for the viewed year. */
  const reforecastAsOfMonth = useMemo(() => {
    const lp = defaultPeriod.period;
    if (resolvedYear < lp.year) return 12;
    if (resolvedYear > lp.year) return 0;
    return lp.month;
  }, [defaultPeriod.period, resolvedYear]);

  // ---- Queries ------------------------------------------------------------

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

  const incomeQ = useQuery({
    queryKey: ['assumptions-income', household?.id, resolvedYear],
    enabled: !!household?.id,
    queryFn: () =>
      fetchIncomePlan({ household_id: household!.id, year: resolvedYear }),
  });

  const savingsQ = useQuery({
    queryKey: ['assumptions-savings', household?.id, resolvedYear],
    enabled: !!household?.id,
    queryFn: () =>
      fetchSavingsPlan({ household_id: household!.id, year: resolvedYear }),
  });

  const taxQ = useQuery({
    queryKey: ['assumptions-tax', household?.id, resolvedYear],
    enabled: !!household?.id,
    queryFn: () =>
      fetchTaxAssumptions({ household_id: household!.id, year: resolvedYear }),
  });

  const expensesProjectionQ = useQuery({
    queryKey: ['assumptions-expenses-proj', household?.id, resolvedYear],
    enabled: !!household?.id,
    queryFn: () =>
      fetchExpensesProjection({ household_id: household!.id, year: resolvedYear }),
  });

  const expensesActualManualQ = useQuery({
    queryKey: ['assumptions-expenses-actual-manual', household?.id, resolvedYear],
    enabled: !!household?.id,
    queryFn: () =>
      fetchExpensesActual({ household_id: household!.id, year: resolvedYear }),
  });

  const budgetsQ = useQuery({
    queryKey: ['budget-year', household?.id, resolvedYear],
    enabled: !!household?.id,
    queryFn: () =>
      fetchBudgetYear({ household_id: household!.id, year: resolvedYear }),
  });

  const actualsQ = useQuery({
    queryKey: ['monthly-actuals-yearly', household?.id, schemeQ.data, resolvedYear],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: { year: resolvedYear, month: 1 },
        to: { year: resolvedYear, month: 12 },
      }),
  });

  const reforecastAllQ = useQuery({
    queryKey: ['revised-all', household?.id, resolvedYear],
    enabled: !!household?.id,
    queryFn: () =>
      fetchAllRevisedForYear({ household_id: household!.id, year: resolvedYear }),
  });

  // ---- Loading / error gates ---------------------------------------------

  const loading =
    !household ||
    incomeQ.isLoading ||
    savingsQ.isLoading ||
    taxQ.isLoading ||
    expensesProjectionQ.isLoading ||
    expensesActualManualQ.isLoading ||
    schemeQ.isLoading ||
    categoriesQ.isLoading ||
    budgetsQ.isLoading ||
    actualsQ.isLoading ||
    reforecastAllQ.isLoading ||
    defaultPeriod.loading;

  const err =
    incomeQ.error ||
    savingsQ.error ||
    taxQ.error ||
    expensesProjectionQ.error ||
    expensesActualManualQ.error ||
    schemeQ.error ||
    categoriesQ.error ||
    budgetsQ.error ||
    actualsQ.error ||
    reforecastAllQ.error;

  // ---- Derived data -------------------------------------------------------

  const incomeRows = incomeQ.data ?? [];
  const savingsRows = savingsQ.data ?? [];
  const taxRows = taxQ.data ?? [];
  /** Optional amount added on top of the Budget Editor spend total. */
  const expensesManualAdd = expensesProjectionQ.data ?? null;
  /** Optional amount added on top of the Reforecast projected spend total. */
  const expensesActualManualAdd = expensesActualManualQ.data ?? null;

  const budgetLookup = useMemo(
    () => (budgetsQ.data ? budgetsToLookup(budgetsQ.data) : new Map()),
    [budgetsQ.data],
  );
  const actualsLookup = useMemo(
    () => (actualsQ.data ? actualsToLookup(actualsQ.data) : new Map()),
    [actualsQ.data],
  );

  const spendCats = useMemo(
    () => spendCategoriesOnly(categoriesQ.data ?? []),
    [categoriesQ.data],
  );

  const budgetSpendYearTotal = useMemo(
    () => sumSpendBudgetYearTotal(spendCats, resolvedYear, budgetLookup),
    [spendCats, resolvedYear, budgetLookup],
  );

  const expensesProjForWaterfall = useMemo(
    () => budgetSpendYearTotal + (expensesManualAdd ?? 0),
    [budgetSpendYearTotal, expensesManualAdd],
  );

  const reforecastExpensesTotal = useMemo(() => {
    if (!budgetsQ.data || !actualsQ.data || !categoriesQ.data || reforecastAllQ.data === undefined) {
      return 0;
    }
    return reforecastProjectedGrandTotal({
      spendCats,
      year: resolvedYear,
      asOfMonth: reforecastAsOfMonth,
      budgetLookup,
      actualsLookup,
      revisedAll: reforecastAllQ.data,
    });
  }, [
    budgetsQ.data,
    actualsQ.data,
    categoriesQ.data,
    reforecastAllQ.data,
    spendCats,
    resolvedYear,
    reforecastAsOfMonth,
    budgetLookup,
    actualsLookup,
  ]);

  const expensesActualForWaterfall = useMemo(
    () => reforecastExpensesTotal + (expensesActualManualAdd ?? 0),
    [reforecastExpensesTotal, expensesActualManualAdd],
  );

  const incomeSources = useMemo(() => listSources(incomeRows), [incomeRows]);
  const savingsAccounts = useMemo(() => listSources(savingsRows), [savingsRows]);

  const incomeProjByName = useMemo(
    () => projectionByName(incomeRows),
    [incomeRows],
  );
  const incomeActualGrid = useMemo(() => actualGrid(incomeRows), [incomeRows]);
  const incomeActualByName = useMemo(() => actualByName(incomeRows), [incomeRows]);
  const incomeProjTotal = useMemo(() => projectionTotal(incomeRows), [incomeRows]);
  const incomeActualTotal = useMemo(() => actualTotal(incomeRows), [incomeRows]);

  const savingsProjByName = useMemo(
    () => projectionByName(savingsRows),
    [savingsRows],
  );
  const savingsActualGrid = useMemo(() => actualGrid(savingsRows), [savingsRows]);
  const savingsActualByName = useMemo(
    () => actualByName(savingsRows),
    [savingsRows],
  );
  const savingsProjTotal = useMemo(
    () => projectionTotal(savingsRows),
    [savingsRows],
  );
  const savingsActualTotal = useMemo(
    () => actualTotal(savingsRows),
    [savingsRows],
  );

  // Tax — index for fast lookup.
  const taxByKey = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of taxRows) m.set(r.key, r.value);
    return m;
  }, [taxRows]);

  /** Sum of fed + state + SS + medicare — suggested effective % for projection & actual. */
  const suggestedCompositeTaxRate = useMemo(() => {
    let sum = 0;
    for (const k of ['fed_rate', 'state_rate', 'ss_rate', 'medicare_rate']) {
      const v = taxByKey.get(k);
      if (typeof v === 'number') sum += v;
    }
    return sum;
  }, [taxByKey]);

  const projectionTaxRateEffective = useMemo(() => {
    const v = taxByKey.get('projection_tax_rate');
    return v != null ? v : suggestedCompositeTaxRate;
  }, [taxByKey, suggestedCompositeTaxRate]);

  const actualTaxRateEffective = useMemo(() => {
    const v = taxByKey.get('actual_tax_rate');
    return v != null ? v : suggestedCompositeTaxRate;
  }, [taxByKey, suggestedCompositeTaxRate]);

  // Waterfalls.
  const projWaterfall = useMemo(
    () =>
      buildWaterfall({
        income: incomeProjTotal,
        tax: incomeProjTotal * projectionTaxRateEffective,
        expenses: expensesProjForWaterfall,
        savings: savingsProjTotal,
      }),
    [
      incomeProjTotal,
      projectionTaxRateEffective,
      expensesProjForWaterfall,
      savingsProjTotal,
    ],
  );

  const actualWaterfall = useMemo(
    () =>
      buildWaterfall({
        income: incomeActualTotal,
        tax: incomeActualTotal * actualTaxRateEffective,
        expenses: expensesActualForWaterfall,
        savings: savingsActualTotal,
      }),
    [
      incomeActualTotal,
      actualTaxRateEffective,
      expensesActualForWaterfall,
      savingsActualTotal,
    ],
  );

  const projPercentages = useMemo(
    () =>
      buildSimplePercentages({
        income: incomeProjTotal,
        savingsDollars: savingsProjTotal,
        expensesDollars: expensesProjForWaterfall,
        taxPct: projectionTaxRateEffective,
      }),
    [
      incomeProjTotal,
      savingsProjTotal,
      expensesProjForWaterfall,
      projectionTaxRateEffective,
    ],
  );

  const actualPercentages = useMemo(
    () =>
      buildSimplePercentages({
        income: incomeActualTotal,
        savingsDollars: savingsActualTotal,
        expensesDollars: expensesActualForWaterfall,
        taxPct: actualTaxRateEffective,
      }),
    [
      incomeActualTotal,
      savingsActualTotal,
      expensesActualForWaterfall,
      actualTaxRateEffective,
    ],
  );

  // ---- Mutation helpers (each one invalidates the relevant query) --------

  function invalidate(key: string) {
    qc.invalidateQueries({ queryKey: [key, household?.id, resolvedYear] });
  }

  async function commitIncomeProjection(source: string, amount: number | null) {
    if (!household) return;
    if (amount == null) {
      await deleteIncomeRow({
        household_id: household.id,
        year: resolvedYear,
        source_name: source,
        month: 0,
        is_actual: false,
      });
    } else {
      await upsertIncomeRow({
        household_id: household.id,
        year: resolvedYear,
        source_name: source,
        month: 0,
        is_actual: false,
        amount,
      });
    }
    invalidate('assumptions-income');
  }

  async function commitIncomeActual(
    source: string,
    month: number,
    amount: number | null,
  ) {
    if (!household) return;
    if (amount == null) {
      await deleteIncomeRow({
        household_id: household.id,
        year: resolvedYear,
        source_name: source,
        month,
        is_actual: true,
      });
    } else {
      await upsertIncomeRow({
        household_id: household.id,
        year: resolvedYear,
        source_name: source,
        month,
        is_actual: true,
        amount,
      });
    }
    invalidate('assumptions-income');
  }

  async function commitSavingsProjection(account: string, amount: number | null) {
    if (!household) return;
    if (amount == null) {
      await deleteSavingsRow({
        household_id: household.id,
        year: resolvedYear,
        account_name: account,
        month: 0,
        is_actual: false,
      });
    } else {
      await upsertSavingsRow({
        household_id: household.id,
        year: resolvedYear,
        account_name: account,
        month: 0,
        is_actual: false,
        amount,
      });
    }
    invalidate('assumptions-savings');
  }

  async function commitSavingsActual(
    account: string,
    month: number,
    amount: number | null,
  ) {
    if (!household) return;
    if (amount == null) {
      await deleteSavingsRow({
        household_id: household.id,
        year: resolvedYear,
        account_name: account,
        month,
        is_actual: true,
      });
    } else {
      await upsertSavingsRow({
        household_id: household.id,
        year: resolvedYear,
        account_name: account,
        month,
        is_actual: true,
        amount,
      });
    }
    invalidate('assumptions-savings');
  }

  async function commitTaxValue(key: string, value: number | null) {
    if (!household) return;
    if (value == null) {
      await deleteTaxAssumption({
        household_id: household.id,
        year: resolvedYear,
        key,
      });
    } else {
      await upsertTaxAssumption({
        household_id: household.id,
        year: resolvedYear,
        key,
        value,
      });
    }
    invalidate('assumptions-tax');
  }

  async function commitExpensesManualAdd(amount: number | null) {
    if (!household) return;
    await setExpensesProjection({
      household_id: household.id,
      year: resolvedYear,
      amount,
    });
    invalidate('assumptions-expenses-proj');
  }

  async function commitExpensesActualManualAdd(amount: number | null) {
    if (!household) return;
    await setExpensesActual({
      household_id: household.id,
      year: resolvedYear,
      amount,
    });
    invalidate('assumptions-expenses-actual-manual');
  }

  // Add / rename / delete row management
  const [newIncomeName, setNewIncomeName] = useState('');
  const [newSavingsName, setNewSavingsName] = useState('');
  const [newTaxKey, setNewTaxKey] = useState('');

  async function addIncomeSource() {
    if (!household) return;
    const n = newIncomeName.trim();
    if (!n) return;
    if (incomeSources.includes(n)) {
      setNewIncomeName('');
      return;
    }
    // Insert a placeholder projection row at amount=0 so the source appears.
    await upsertIncomeRow({
      household_id: household.id,
      year: resolvedYear,
      source_name: n,
      month: 0,
      is_actual: false,
      amount: 0,
    });
    setNewIncomeName('');
    invalidate('assumptions-income');
  }

  async function removeIncomeSource(name: string) {
    if (!household) return;
    if (!confirm(`Delete "${name}" and ALL its monthly actuals for ${resolvedYear}?`)) return;
    await deleteIncomeSource({
      household_id: household.id,
      year: resolvedYear,
      source_name: name,
    });
    invalidate('assumptions-income');
  }

  async function renameIncome(from: string, to: string) {
    if (!household) return;
    const t = to.trim();
    if (!t || t === from) return;
    if (incomeSources.includes(t)) {
      alert(`A source named "${t}" already exists.`);
      return;
    }
    await renameIncomeSource({
      household_id: household.id,
      year: resolvedYear,
      from,
      to: t,
    });
    invalidate('assumptions-income');
  }

  async function addSavingsAccount() {
    if (!household) return;
    const n = newSavingsName.trim();
    if (!n) return;
    if (savingsAccounts.includes(n)) {
      setNewSavingsName('');
      return;
    }
    await upsertSavingsRow({
      household_id: household.id,
      year: resolvedYear,
      account_name: n,
      month: 0,
      is_actual: false,
      amount: 0,
    });
    setNewSavingsName('');
    invalidate('assumptions-savings');
  }

  async function removeSavingsAccount(name: string) {
    if (!household) return;
    if (!confirm(`Delete "${name}" and ALL its monthly actuals for ${resolvedYear}?`)) return;
    await deleteSavingsAccount({
      household_id: household.id,
      year: resolvedYear,
      account_name: name,
    });
    invalidate('assumptions-savings');
  }

  async function renameSavings(from: string, to: string) {
    if (!household) return;
    const t = to.trim();
    if (!t || t === from) return;
    if (savingsAccounts.includes(t)) {
      alert(`An account named "${t}" already exists.`);
      return;
    }
    await renameSavingsAccount({
      household_id: household.id,
      year: resolvedYear,
      from,
      to: t,
    });
    invalidate('assumptions-savings');
  }

  async function addCustomTaxKey() {
    if (!household) return;
    const k = newTaxKey.trim();
    if (!k) return;
    if (taxByKey.has(k)) {
      setNewTaxKey('');
      return;
    }
    await upsertTaxAssumption({
      household_id: household.id,
      year: resolvedYear,
      key: k,
      value: 0,
    });
    setNewTaxKey('');
    invalidate('assumptions-tax');
  }

  // ---- Render -------------------------------------------------------------

  if (err) {
    return (
      <StatusPanel
        kind="error"
        message="Couldn't load Assumptions data."
        detail={String((err as Error).message ?? err)}
      />
    );
  }

  if (loading) {
    return <StatusPanel kind="loading" message="Loading Assumptions…" />;
  }

  // Custom tax keys = anything stored that isn't a pinned key.
  const pinnedSet = new Set<string>(PINNED_TAX_KEYS);
  const customTaxRows = taxRows.filter((r) => !pinnedSet.has(r.key));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body-base text-gray-500">
          Income, savings, and tax projection for {resolvedYear}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/assumptions/${resolvedYear - 1}`)}
          >
            ← {resolvedYear - 1}
          </Button>
          <span className="rounded-md bg-navy-100 px-2 py-1 text-sm font-bold tabular-nums text-navy-800">
            {resolvedYear}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/assumptions/${resolvedYear + 1}`)}
          >
            {resolvedYear + 1} →
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <WaterfallChart waterfall={projWaterfall} caption="Projection" />
        </Card>
        <Card>
          <WaterfallChart waterfall={actualWaterfall} caption="Actual" />
        </Card>
      </section>

      <Card padded={false}>
        <Card.Header title="Simple Percentages" />
        <table className={RT.table}>
          <thead className={RT.head}>
            <tr>
              <th className={`${RT.th} ${RT.thLeft}`}>Metric</th>
              <th className={`${RT.th} ${RT.thRight}`}>Projection</th>
              <th className={`${RT.th} ${RT.thRight}`}>Actual</th>
            </tr>
          </thead>
          <tbody>
            <tr className={RT.detailRow}>
              <td className={RT.cellLeft}>Income</td>
              <td className={RT.cellRight}>{fmtUsd(projPercentages.income)}</td>
              <td className={RT.cellRight}>{fmtUsd(actualPercentages.income)}</td>
            </tr>
            <tr className={RT.detailRow}>
              <td className={RT.cellLeft}>Tax %</td>
              <td className={RT.cellRight}>
                {fmtPct(projPercentages.taxPct * 100, { decimals: 1 })}
              </td>
              <td className={RT.cellRight}>
                {fmtPct(actualPercentages.taxPct * 100, { decimals: 1 })}
              </td>
            </tr>
            <tr className={RT.detailRow}>
              <td className={RT.cellLeft}>Tax $</td>
              <td className={RT.cellRight}>{fmtUsd(projPercentages.taxDollars)}</td>
              <td className={RT.cellRight}>{fmtUsd(actualPercentages.taxDollars)}</td>
            </tr>
            <tr className={RT.detailRow}>
              <td className={RT.cellLeft}>Savings %</td>
              <td className={RT.cellRight}>
                {fmtPct(projPercentages.savingsPct * 100, { decimals: 1 })}
              </td>
              <td className={RT.cellRight}>
                {fmtPct(actualPercentages.savingsPct * 100, { decimals: 1 })}
              </td>
            </tr>
            <tr className={RT.detailRow}>
              <td className={RT.cellLeft}>Savings $</td>
              <td className={RT.cellRight}>{fmtUsd(projPercentages.savingsDollars)}</td>
              <td className={RT.cellRight}>{fmtUsd(actualPercentages.savingsDollars)}</td>
            </tr>
            <tr className={RT.detailRow}>
              <td className={RT.cellLeft}>Expenses %</td>
              <td className={RT.cellRight}>
                {fmtPct(projPercentages.expensesPct * 100, { decimals: 1 })}
              </td>
              <td className={RT.cellRight}>
                {fmtPct(actualPercentages.expensesPct * 100, { decimals: 1 })}
              </td>
            </tr>
            <tr className={RT.detailRow}>
              <td className={RT.cellLeft}>Expenses $</td>
              <td className={RT.cellRight}>{fmtUsd(projPercentages.expensesDollars)}</td>
              <td className={RT.cellRight}>{fmtUsd(actualPercentages.expensesDollars)}</td>
            </tr>
            <tr className={RT.subtotalRow}>
              <td className={RT.cellLeft}>Leftover</td>
              <td className={RT.cellRight}>{fmtUsd(projPercentages.leftover)}</td>
              <td className={RT.cellRight}>{fmtUsd(actualPercentages.leftover)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="mb-2 text-h4 text-navy-800">Expenses ({resolvedYear})</div>
        <p className="mb-3 text-sm text-gray-500">
          <strong className="font-semibold text-navy-700">Projection</strong> uses the{' '}
          <Link to={`/budget/${resolvedYear}`} className="text-navy-600 underline">
            Budget
          </Link>{' '}
          spend-category yearly total plus any manual add below.{' '}
          <strong className="font-semibold text-navy-700">Actual</strong> starts from{' '}
          <Link to={`/budget/${resolvedYear}/revise`} className="text-navy-600 underline">
            Reforecast
          </Link>{' '}
          “Projected Total” (YTD transactions through the latest actual month, then saved forecast /
          budget), plus an optional manual add. Unsaved Reforecast edits are not included until you
          save.
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-navy-100 bg-navy-50/40 px-3 py-2.5">
            <dt className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Projection — budget spend total
            </dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-navy-800">
              {fmtUsd(budgetSpendYearTotal)}
            </dd>
            <dt className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">
              Manual add
            </dt>
            <dd className="mt-1">
              <div className="max-w-[10rem]">
                <MoneyCell
                  value={expensesManualAdd}
                  onCommit={commitExpensesManualAdd}
                  placeholder="0"
                />
              </div>
            </dd>
            <dt className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">
              Projection — expenses (waterfall / Simple %)
            </dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-navy-800">
              {fmtUsd(expensesProjForWaterfall)}
            </dd>
          </div>
          <div className="rounded-lg border border-navy-100 bg-white px-3 py-2.5">
            <dt className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Actual — Reforecast projected total
            </dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-navy-800">
              {fmtUsd(reforecastExpensesTotal)}
            </dd>
            <dt className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">
              Manual add
            </dt>
            <dd className="mt-1">
              <div className="max-w-[10rem]">
                <MoneyCell
                  value={expensesActualManualAdd}
                  onCommit={commitExpensesActualManualAdd}
                  placeholder="0"
                />
              </div>
            </dd>
            <dt className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">
              Actual — expenses (waterfall / Simple %)
            </dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-navy-800">
              {fmtUsd(expensesActualForWaterfall)}
            </dd>
            <dd className="mt-2 text-xs text-gray-500">
              As-of month for blending:{' '}
              {reforecastAsOfMonth === 0
                ? 'none yet (full year from budget / snapshot seed)'
                : reforecastAsOfMonth === 12
                  ? 'Dec (full year actuals)'
                  : `${MONTH_NAMES_SHORT[reforecastAsOfMonth - 1]} (${reforecastAsOfMonth})`}
            </dd>
          </div>
        </dl>
      </Card>

      <Card padded={false}>
        <Card.Header
          title="Income"
          action={
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newIncomeName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewIncomeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addIncomeSource();
                }}
                placeholder="Add source (e.g. Brit Salary)…"
                className="w-56 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
              />
              <Button size="sm" onClick={addIncomeSource}>
                Add
              </Button>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={RT.head}>
              <tr>
                <th
                  className={`${RT.th} ${RT.thLeft} sticky left-0 z-10 bg-navy-50/80`}
                >
                  Source
                </th>
                <th className={`${RT.th} ${RT.thRight}`}>Projection</th>
                <th className={`${RT.th} ${RT.thRight}`}>Actual YTD</th>
                {MONTH_NAMES_SHORT.map((m) => (
                  <th key={m} className={`${RT.th} ${RT.thRight}`}>
                    {m}
                  </th>
                ))}
                <th className={RT.th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {incomeSources.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-4 py-6 text-center text-gray-400">
                    No income sources yet. Add one above.
                  </td>
                </tr>
              )}
              {incomeSources.map((src) => {
                const proj = incomeProjByName.get(src) ?? null;
                const actuals = incomeActualGrid.get(src) ?? Array(12).fill(0);
                return (
                  <IncomeOrSavingsRow
                    key={src}
                    name={src}
                    projection={proj}
                    actuals={actuals}
                    actualTotal={incomeActualByName.get(src) ?? 0}
                    onRenameRow={(to) => renameIncome(src, to)}
                    onDeleteRow={() => removeIncomeSource(src)}
                    onCommitProjection={(v) => commitIncomeProjection(src, v)}
                    onCommitActual={(month, v) => commitIncomeActual(src, month, v)}
                  />
                );
              })}
            </tbody>
            {incomeSources.length > 0 && (
              <tfoot className="bg-navy-50 font-semibold text-navy-800">
                <tr>
                  <td className="sticky left-0 z-10 bg-navy-50 px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(incomeProjTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(incomeActualTotal)}</td>
                  {MONTH_NAMES_SHORT.map((_, i) => {
                    let t = 0;
                    for (const arr of incomeActualGrid.values()) t += arr[i] ?? 0;
                    return (
                      <td key={i} className="px-2 py-2 text-right tabular-nums">
                        {t === 0 ? '' : fmtUsd(t)}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <Card padded={false}>
        <Card.Header
          title="Savings"
          action={
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSavingsName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewSavingsName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSavingsAccount();
                }}
                placeholder="Add account (e.g. Brit - 401K)…"
                className="w-56 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
              />
              <Button size="sm" onClick={addSavingsAccount}>
                Add
              </Button>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={RT.head}>
              <tr>
                <th
                  className={`${RT.th} ${RT.thLeft} sticky left-0 z-10 bg-navy-50/80`}
                >
                  Account
                </th>
                <th className={`${RT.th} ${RT.thRight}`}>Projection</th>
                <th className={`${RT.th} ${RT.thRight}`}>Actual YTD</th>
                {MONTH_NAMES_SHORT.map((m) => (
                  <th key={m} className={`${RT.th} ${RT.thRight}`}>
                    {m}
                  </th>
                ))}
                <th className={RT.th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {savingsAccounts.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-4 py-6 text-center text-gray-400">
                    No savings accounts yet. Add one above.
                  </td>
                </tr>
              )}
              {savingsAccounts.map((acc) => {
                const proj = savingsProjByName.get(acc) ?? null;
                const actuals = savingsActualGrid.get(acc) ?? Array(12).fill(0);
                return (
                  <IncomeOrSavingsRow
                    key={acc}
                    name={acc}
                    projection={proj}
                    actuals={actuals}
                    actualTotal={savingsActualByName.get(acc) ?? 0}
                    formatProjectionCurrency
                    onRenameRow={(to) => renameSavings(acc, to)}
                    onDeleteRow={() => removeSavingsAccount(acc)}
                    onCommitProjection={(v) => commitSavingsProjection(acc, v)}
                    onCommitActual={(month, v) => commitSavingsActual(acc, month, v)}
                  />
                );
              })}
            </tbody>
            {savingsAccounts.length > 0 && (
              <tfoot className="bg-navy-50 font-semibold text-navy-800">
                <tr>
                  <td className="sticky left-0 z-10 bg-navy-50 px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(savingsProjTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(savingsActualTotal)}</td>
                  {MONTH_NAMES_SHORT.map((_, i) => {
                    let t = 0;
                    for (const arr of savingsActualGrid.values()) t += arr[i] ?? 0;
                    return (
                      <td key={i} className="px-2 py-2 text-right tabular-nums">
                        {t === 0 ? '' : fmtUsd(t)}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <Card padded={false}>
        <Card.Header title="Tax assumptions" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 md:grid-cols-2">
          {PINNED_TAX_DETAIL_KEYS.map((k) => (
            <TaxRow
              key={k}
              k={k}
              label={TAX_KEY_LABELS[k]}
              value={taxByKey.get(k) ?? null}
              onCommit={(v) => commitTaxValue(k, v)}
            />
          ))}
        </div>
        <div className="border-t border-navy-100 bg-gray-50 px-4 py-2 text-caption text-gray-600">
          Suggested effective tax % (Fed + State + SS + Medicare){' '}
          <span className="text-gray-500">
            — use below when Projection / Actual tax % are left empty:
          </span>{' '}
          <span className="font-semibold text-navy-800">
            {fmtPct(suggestedCompositeTaxRate * 100, { decimals: 2 })}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-navy-100 p-4 md:grid-cols-2">
          {PINNED_TAX_SIMPLE_KEYS.map((k) => (
            <TaxRow
              key={k}
              k={k}
              label={TAX_KEY_LABELS[k]}
              value={taxByKey.get(k) ?? null}
              onCommit={(v) => commitTaxValue(k, v)}
              hint={`Suggested from detail rates: ${fmtPct(suggestedCompositeTaxRate * 100, { decimals: 2 })} (used when this field is empty)`}
            />
          ))}
        </div>
        <div className="border-t border-navy-100 p-4">
          <div className="mb-2 text-label uppercase text-gray-500">
            Custom keys
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
            {customTaxRows.map((r) => (
              <CustomTaxRow
                key={r.key}
                row={r}
                onCommit={(v) => commitTaxValue(r.key, v)}
                onDelete={() => commitTaxValue(r.key, null)}
              />
            ))}
            {customTaxRows.length === 0 && (
              <div className="text-sm text-gray-400">None.</div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={newTaxKey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTaxKey(e.target.value)}
              placeholder="Add custom key (e.g. effective_marginal_rate)…"
              className="w-72 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCustomTaxKey();
              }}
            />
            <Button size="sm" onClick={addCustomTaxKey}>
              Add
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function IncomeOrSavingsRow(props: {
  name: string;
  projection: number | null;
  actuals: number[];
  actualTotal: number;
  /** Savings projection column: show `$` + thousands separators when not editing. */
  formatProjectionCurrency?: boolean;
  onRenameRow: (newName: string) => void;
  onDeleteRow: () => void;
  onCommitProjection: (v: number | null) => void;
  onCommitActual: (month: number, v: number | null) => void;
}) {
  const {
    name,
    projection,
    actuals,
    actualTotal,
    formatProjectionCurrency = false,
    onRenameRow,
    onDeleteRow,
    onCommitProjection,
    onCommitActual,
  } = props;

  const [editingName, setEditingName] = useState(name);
  useEffect(() => setEditingName(name), [name]);

  return (
    <tr className="hover:bg-navy-50/40">
      <td className="sticky left-0 z-10 bg-white px-3 py-1">
        <input
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onBlur={() => {
            if (editingName.trim() !== name) onRenameRow(editingName);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setEditingName(name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-44 rounded-md border border-transparent bg-white px-1 py-0.5 text-sm hover:border-navy-200 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
        />
      </td>
      <td className="px-3 py-1">
        <MoneyCell
          value={projection}
          onCommit={onCommitProjection}
          placeholder="0"
          currencyDisplay={formatProjectionCurrency}
        />
      </td>
      <td className="px-3 py-1 text-right text-sm tabular-nums text-gray-600">
        {actualTotal === 0 ? '' : fmtUsd(actualTotal)}
      </td>
      {actuals.map((a, i) => (
        <td key={i} className="px-1 py-1">
          <MoneyCell
            value={a === 0 ? null : a}
            onCommit={(v) => onCommitActual(i + 1, v)}
            placeholder=""
          />
        </td>
      ))}
      <td className="px-2 py-1">
        <button
          onClick={onDeleteRow}
          title={`Delete ${name}`}
          className="text-xs font-bold text-neg hover:underline"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function TaxRow({
  k,
  label,
  value,
  onCommit,
  hint,
}: {
  k: PinnedTaxKey;
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  hint?: string;
}) {
  const isRate = isRateKey(k);
  const display = value == null ? '' : isRate ? String((value * 100).toFixed(2)) : String(value);
  const [local, setLocal] = useState(display);
  useEffect(() => setLocal(display), [display]);

  function commit() {
    if (local.trim() === '') {
      onCommit(null);
      return;
    }
    const parsed = isRate ? parseRateInput(local) : parseMoneyInput(local);
    if (parsed === null) {
      setLocal(display);
      return;
    }
    onCommit(parsed);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm text-gray-700">{label}</label>
        <div className="flex shrink-0 items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setLocal(display);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
            placeholder={isRate ? '0.00' : '0'}
          />
          <span className="w-3 text-xs text-gray-400">{isRate ? '%' : ''}</span>
        </div>
      </div>
      {hint ? <p className="text-xs leading-snug text-gray-500">{hint}</p> : null}
    </div>
  );
}

function CustomTaxRow({
  row,
  onCommit,
  onDelete,
}: {
  row: TaxAssumptionRow;
  onCommit: (v: number | null) => void;
  onDelete: () => void;
}) {
  const isRate = isRateKey(row.key);
  const display = row.value == null
    ? ''
    : isRate
      ? String((row.value * 100).toFixed(2))
      : String(row.value);
  const [local, setLocal] = useState(display);
  useEffect(() => setLocal(display), [display]);

  return (
    <div className="flex items-center justify-between gap-3">
      <code className="rounded bg-navy-50 px-2 py-0.5 text-xs text-navy-700">{row.key}</code>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            if (local.trim() === '') {
              onCommit(null);
              return;
            }
            const parsed = isRate ? parseRateInput(local) : parseMoneyInput(local);
            if (parsed === null) {
              setLocal(display);
              return;
            }
            onCommit(parsed);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
        />
        <span className="w-3 text-xs text-gray-400">{isRate ? '%' : ''}</span>
        <button
          onClick={onDelete}
          title="Remove key"
          className="text-xs font-bold text-neg hover:underline"
        >
          ×
        </button>
      </div>
    </div>
  );
}
