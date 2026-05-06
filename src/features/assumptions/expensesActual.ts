/**
 * Builds a 12-month expense series by blending monthly actuals, reforecast,
 * and budgets (same shape as the old Assumptions actual-leg helper).
 *
 * The Assumptions page now uses `reforecastProjectedGrandTotal` for the actual
 * waterfall expenses total (aligned with Reforecast “Projected Total”) and
 * sums budgets + optional `expenses_projection` for the projection leg.
 *
 * Historical note — Phase 6 draft described this revised-forecast mix as:
 *
 *   For each month of the target year:
 *     - if month <= latest-actuals month → use actual spend that month
 *     - else if a reforecast snapshot exists → use the latest snapshot's
 *       budget for that month
 *     - else                                → fall back to the original
 *       tf_budgets value for that month
 *   sum across all 12 months × all spend categories.
 */

import type {
  MonthlyActualRow,
  BudgetRow,
  ReportCategory,
} from '@/api/reports';
import type { RevisedBudgetRow } from '@/api/reforecast';
import { canonicalSpendGroup } from '@/features/reports/grouping';

/**
 * Compute the per-month "effective spend" series for the year, blending
 * actuals + reforecast + budget per the rules above. Returns 12 numbers.
 *
 * @param latestActualMonth   The system-wide latest-actuals month for the
 *                            year being computed. If the latest-actuals
 *                            month is in a *prior* year, pass 12 (the year
 *                            is conceptually "done" — actuals own all 12
 *                            months). If it's a FUTURE year, pass 0
 *                            (actuals own none of it).
 */
export function buildExpensesSeries(args: {
  year: number;
  latestActualMonth: number; // 0..12, see jsdoc
  actuals: MonthlyActualRow[];
  budgets: BudgetRow[];
  /** Latest reforecast snapshot rows for the year (filtered to one as_of_month). */
  reforecast: RevisedBudgetRow[];
  categories: ReportCategory[];
}): number[] {
  const { year, latestActualMonth, actuals, budgets, reforecast, categories } = args;

  // Spend-only category set.
  const spendIds = new Set(
    categories
      .filter((c) => canonicalSpendGroup(c.group_name) !== null)
      .map((c) => c.id),
  );

  // Index actuals by (cat, month).
  const actualByCatMonth = new Map<string, number>();
  for (const r of actuals) {
    if (r.year !== year) continue;
    if (!spendIds.has(r.category_id)) continue;
    actualByCatMonth.set(`${r.category_id}|${r.month}`, Number(r.total));
  }

  // Index budgets by (cat, month).
  const budgetByCatMonth = new Map<string, number>();
  for (const r of budgets) {
    if (r.year !== year) continue;
    if (!spendIds.has(r.category_id)) continue;
    budgetByCatMonth.set(`${r.category_id}|${r.month}`, Number(r.amount));
  }

  // Index reforecast by (cat, month) — caller has already filtered to one
  // as_of_month and one year.
  const reforecastByCatMonth = new Map<string, number>();
  for (const r of reforecast) {
    if (!spendIds.has(r.category_id)) continue;
    reforecastByCatMonth.set(`${r.category_id}|${r.month}`, Number(r.amount));
  }

  const series: number[] = Array(12).fill(0);
  for (let month = 1; month <= 12; month++) {
    let monthSum = 0;
    for (const catId of spendIds) {
      const k = `${catId}|${month}`;
      let v: number;
      if (month <= latestActualMonth) {
        // Actual; if missing, treat as 0 (no spend in that category that month).
        v = actualByCatMonth.get(k) ?? 0;
      } else {
        // Future month — prefer reforecast, fall back to budget, then 0.
        v = reforecastByCatMonth.get(k) ?? budgetByCatMonth.get(k) ?? 0;
      }
      monthSum += v;
    }
    series[month - 1] = monthSum;
  }
  return series;
}

/** Sum the 12-month series. */
export function sumSeries(series: number[]): number {
  return series.reduce((a, b) => a + b, 0);
}
