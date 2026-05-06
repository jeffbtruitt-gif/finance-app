/**
 * Computes the same FY total as Reforecast's "Projected Total" KPI:
 * for each spend category, actuals for months ≤ as_of_month and forecast
 * (saved snapshot seed, else budget) for later months.
 *
 * Does not include unsaved draft overrides from the Reforecast editor —
 * only persisted `tf_revised_budgets` rows (plus budgets / actuals).
 */

import type { ActualLookup, BudgetLookup, ReportCategory } from '@/api/reports';
import type { RevisedBudgetRow } from '@/api/reforecast';
import {
  filterToAsOf,
  findMostRecentPriorSnapshot,
  revisedToLookup,
  type RevisedLookup,
} from '@/api/reforecast';
import { periodKey } from '@/lib/period';
import { canonicalSpendGroup } from '@/features/reports/grouping';

/** Categories that participate in spend / Reforecast (same filter as ReforecastPage). */
export function spendCategoriesOnly(categories: ReportCategory[]): ReportCategory[] {
  return categories.filter((c) => canonicalSpendGroup(c.group_name) !== null);
}

/** FY sum of tf_budgets for spend categories — matches Reforecast "Original budget". */
export function sumSpendBudgetYearTotal(
  spendCats: ReportCategory[],
  year: number,
  budgetLookup: BudgetLookup,
): number {
  let t = 0;
  for (const c of spendCats) {
    for (let month = 1; month <= 12; month++) {
      t += budgetLookup.get(`${c.id}|${periodKey({ year, month })}`) ?? 0;
    }
  }
  return t;
}

function revisedSeedLookup(revisedAll: RevisedBudgetRow[], asOfMonth: number): RevisedLookup {
  let snap = filterToAsOf(revisedAll, asOfMonth);
  if (snap.length === 0) snap = findMostRecentPriorSnapshot(revisedAll, asOfMonth);
  return revisedToLookup(snap);
}

/** Sum actuals Jan..throughMonth for one category (raw storage sign). */
export function sumActualYtdThroughMonth(
  actualsLookup: ActualLookup,
  categoryId: string,
  year: number,
  throughMonth: number,
): number {
  let t = 0;
  for (let month = 1; month <= throughMonth; month++) {
    t += actualsLookup.get(`${categoryId}|${periodKey({ year, month })}`) ?? 0;
  }
  return t;
}

/** Sum budget amounts for Jan–Dec for one category. */
export function sumBudgetFullYearForCategory(
  budgetLookup: BudgetLookup,
  categoryId: string,
  year: number,
): number {
  let t = 0;
  for (let month = 1; month <= 12; month++) {
    t += budgetLookup.get(`${categoryId}|${periodKey({ year, month })}`) ?? 0;
  }
  return t;
}

export function reforecastProjectedGrandTotal(args: {
  spendCats: ReportCategory[];
  year: number;
  asOfMonth: number;
  budgetLookup: BudgetLookup;
  actualsLookup: ActualLookup;
  revisedAll: RevisedBudgetRow[];
}): number {
  const { spendCats, year, asOfMonth, budgetLookup, actualsLookup, revisedAll } = args;
  const revisedSeed = revisedSeedLookup(revisedAll, asOfMonth);

  const forecastForFutureMonth = (catId: string, month: number): number =>
    revisedSeed.get(`${catId}|${month}`) ??
    (budgetLookup.get(`${catId}|${periodKey({ year, month })}`) ?? 0);

  let total = 0;
  for (const c of spendCats) {
    for (let month = 1; month <= 12; month++) {
      if (month <= asOfMonth) {
        total += actualsLookup.get(`${c.id}|${periodKey({ year, month })}`) ?? 0;
      } else {
        total += forecastForFutureMonth(c.id, month);
      }
    }
  }
  return total;
}
