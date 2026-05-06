/**
 * Loads income/savings/tax/expense inputs for a year and builds the same
 * projection vs actual waterfalls as the Assumptions page — for embedding
 * on the dashboard without duplicating query wiring.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import type { Period } from '@/lib/period';
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
  fetchExpensesActual,
  fetchExpensesProjection,
  fetchIncomePlan,
  fetchSavingsPlan,
  fetchTaxAssumptions,
} from '@/api/assumptions';
import {
  actualTotal,
  buildSimplePercentages,
  buildWaterfall,
  projectionTotal,
  type Waterfall,
} from '@/features/assumptions/rollup';
import {
  reforecastProjectedGrandTotal,
  spendCategoriesOnly,
  sumSpendBudgetYearTotal,
} from '@/features/budget/reforecastProjectedGrand';

export interface AssumptionsWaterfallsResult {
  loading: boolean;
  error: unknown;
  projWaterfall: Waterfall | null;
  actualWaterfall: Waterfall | null;
  /** Actual savings ÷ actual income (0..1), same as Assumptions Simple %. */
  actualSavingsRatePct: number | null;
}

/**
 * @param anchorPeriod Same period as the app header picker — drives “actuals
 *   through” month when `year` matches that period’s year (same rule as
 *   Reforecast / Assumptions `as_of_month`).
 */
export function useAssumptionsWaterfalls(
  year: number,
  anchorPeriod: Period,
): AssumptionsWaterfallsResult {
  const household = useHousehold();

  const reforecastAsOfMonth = useMemo(() => {
    const lp = anchorPeriod;
    if (year < lp.year) return 12;
    if (year > lp.year) return 0;
    return lp.month;
  }, [anchorPeriod.year, anchorPeriod.month, year]);

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
    queryKey: ['assumptions-income', household?.id, year],
    enabled: !!household?.id,
    queryFn: () => fetchIncomePlan({ household_id: household!.id, year }),
  });

  const savingsQ = useQuery({
    queryKey: ['assumptions-savings', household?.id, year],
    enabled: !!household?.id,
    queryFn: () => fetchSavingsPlan({ household_id: household!.id, year }),
  });

  const taxQ = useQuery({
    queryKey: ['assumptions-tax', household?.id, year],
    enabled: !!household?.id,
    queryFn: () => fetchTaxAssumptions({ household_id: household!.id, year }),
  });

  const expensesProjectionQ = useQuery({
    queryKey: ['assumptions-expenses-proj', household?.id, year],
    enabled: !!household?.id,
    queryFn: () =>
      fetchExpensesProjection({ household_id: household!.id, year }),
  });

  const expensesActualManualQ = useQuery({
    queryKey: ['assumptions-expenses-actual-manual', household?.id, year],
    enabled: !!household?.id,
    queryFn: () => fetchExpensesActual({ household_id: household!.id, year }),
  });

  const budgetsQ = useQuery({
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

  const reforecastAllQ = useQuery({
    queryKey: ['revised-all', household?.id, year],
    enabled: !!household?.id,
    queryFn: () =>
      fetchAllRevisedForYear({ household_id: household!.id, year }),
  });

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
    reforecastAllQ.isLoading;

  const error =
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

  const ready =
    !!household &&
    !loading &&
    !error &&
    budgetsQ.data !== undefined &&
    actualsQ.data !== undefined &&
    categoriesQ.data !== undefined &&
    reforecastAllQ.data !== undefined;

  const waterfalls = useMemo(() => {
    if (!ready || !household) {
      return {
        projWaterfall: null as Waterfall | null,
        actualWaterfall: null as Waterfall | null,
        actualSavingsRatePct: null as number | null,
      };
    }

    const incomeRows = incomeQ.data ?? [];
    const savingsRows = savingsQ.data ?? [];
    const taxRows = taxQ.data ?? [];
    const expensesManualAdd = expensesProjectionQ.data ?? null;
    const expensesActualManualAdd = expensesActualManualQ.data ?? null;

    const budgetLookup = budgetsToLookup(budgetsQ.data!);
    const actualsLookup = actualsToLookup(actualsQ.data!);
    const spendCats = spendCategoriesOnly(categoriesQ.data!);
    const budgetSpendYearTotal = sumSpendBudgetYearTotal(
      spendCats,
      year,
      budgetLookup,
    );
    const expensesProjForWaterfall =
      budgetSpendYearTotal + (expensesManualAdd ?? 0);
    const reforecastExpensesTotal = reforecastProjectedGrandTotal({
      spendCats,
      year,
      asOfMonth: reforecastAsOfMonth,
      budgetLookup,
      actualsLookup,
      revisedAll: reforecastAllQ.data!,
    });
    const expensesActualForWaterfall =
      reforecastExpensesTotal + (expensesActualManualAdd ?? 0);

    const incomeProjTotal = projectionTotal(incomeRows);
    const incomeActualTotal = actualTotal(incomeRows);
    const savingsProjTotal = projectionTotal(savingsRows);
    const savingsActualTotal = actualTotal(savingsRows);

    const taxByKey = new Map<string, number | null>();
    for (const r of taxRows) taxByKey.set(r.key, r.value);

    let suggestedCompositeTaxRate = 0;
    for (const k of ['fed_rate', 'state_rate', 'ss_rate', 'medicare_rate']) {
      const v = taxByKey.get(k);
      if (typeof v === 'number') suggestedCompositeTaxRate += v;
    }

    const projectionTaxRateEffective =
      taxByKey.get('projection_tax_rate') != null
        ? (taxByKey.get('projection_tax_rate') as number)
        : suggestedCompositeTaxRate;
    const actualTaxRateEffective =
      taxByKey.get('actual_tax_rate') != null
        ? (taxByKey.get('actual_tax_rate') as number)
        : suggestedCompositeTaxRate;

    const projWaterfall = buildWaterfall({
      income: incomeProjTotal,
      tax: incomeProjTotal * projectionTaxRateEffective,
      expenses: expensesProjForWaterfall,
      savings: savingsProjTotal,
    });

    const actualWaterfall = buildWaterfall({
      income: incomeActualTotal,
      tax: incomeActualTotal * actualTaxRateEffective,
      expenses: expensesActualForWaterfall,
      savings: savingsActualTotal,
    });

    const actualPercentages = buildSimplePercentages({
      income: incomeActualTotal,
      savingsDollars: savingsActualTotal,
      expensesDollars: expensesActualForWaterfall,
      taxPct: actualTaxRateEffective,
    });

    return {
      projWaterfall,
      actualWaterfall,
      actualSavingsRatePct: actualPercentages.savingsPct,
    };
  }, [
    ready,
    household,
    incomeQ.data,
    savingsQ.data,
    taxQ.data,
    expensesProjectionQ.data,
    expensesActualManualQ.data,
    budgetsQ.data,
    actualsQ.data,
    categoriesQ.data,
    reforecastAllQ.data,
    year,
    reforecastAsOfMonth,
  ]);

  return {
    loading: !!loading,
    error: error ?? null,
    projWaterfall: waterfalls.projWaterfall,
    actualWaterfall: waterfalls.actualWaterfall,
    actualSavingsRatePct: waterfalls.actualSavingsRatePct,
  };
}
