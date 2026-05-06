/**
 * Dashboard API — Phase 5.
 *
 * The dashboard is a roll-up of stuff already queryable elsewhere — we just
 * shape it into a single fetch so the home page renders in one round trip.
 *
 * Sign / sum conventions used here:
 *   - Spend categories are stored positive (money out). Sums are positive,
 *     no flip needed.
 *   - Income categories are stored negative (money in). For display we flip
 *     to positive ("you earned $X this YTD"). All flips happen in this
 *     module so the dashboard component layer can render values directly.
 *   - Savings categories are stored positive (money OUT into a savings
 *     account, treated as another spend category in raw form). For display
 *     we report savings-out as a positive "you saved $X" — the values are
 *     already positive, so identity.
 */

import { supabase } from './supabase';
import type { Period } from '@/lib/period';
import { ytdPeriods, periodKey } from '@/lib/period';
import {
  actualsToLookup,
  fetchMonthlyActuals,
  fetchSchemeCategories,
  type MonthlyActualRow,
  type ReportCategory,
} from './reports';
import { canonicalSpendGroup } from '@/features/reports/grouping';

export interface DashboardSums {
  /** Sum of ALL spend categories (Rent & House Maintenance + Food & Car + Other + Yearly) for the supplied periods. */
  spend: number;
  /** Sum of just the Yearly group (Insurance / Property Tax / Subscriptions / Charity in seed). */
  yearlySpend: number;
  /** Sum of Income categories, sign-flipped to positive ("you earned"). */
  income: number;
  /** Sum of Savings categories — already positive in storage. */
  savings: number;
}

/**
 * Sum a set of monthly-actual rows by category-group across the supplied
 * periods. Returns the four bucketed totals the dashboard cares about.
 */
export function sumByGroup(args: {
  rows: MonthlyActualRow[];
  categories: ReportCategory[];
  periods: Period[];
}): DashboardSums {
  const { rows, categories, periods } = args;
  const lookup = actualsToLookup(rows);

  let spend = 0;
  let yearlySpend = 0;
  let income = 0;
  let savings = 0;

  for (const c of categories) {
    if (!c.group_name) continue;
    let total = 0;
    for (const p of periods) {
      total += lookup.get(`${c.id}|${periodKey(p)}`) ?? 0;
    }
    const spendG = canonicalSpendGroup(c.group_name);
    if (spendG) {
      spend += total;
      if (spendG === 'Yearly') yearlySpend += total;
    } else if (c.group_name === 'Income') {
      // Stored negative; flip for "earned this much" presentation.
      income += -total;
    } else if (c.group_name === 'Savings') {
      // Stored positive (out of checking, into savings). Identity.
      savings += total;
    }
    // Transfer / other — intentionally skipped, not on the dashboard.
  }
  return { spend, yearlySpend, income, savings };
}

// ----------------------------------------------------------------------------
// Budget rollups — a year of tf_budgets summed by group
// ----------------------------------------------------------------------------

export interface BudgetRollupRow {
  category_id: string;
  year: number;
  month: number;
  amount: number;
}

export interface BudgetRollup {
  /** Sum of all spend-group budgets across the supplied periods. */
  spend: number;
  /** Sum of just Yearly budgets. */
  yearlySpend: number;
  /** Income budgets (kept positive — budgets are entered positive). */
  income: number;
  /** Savings budgets. */
  savings: number;
}

/**
 * Same period-bucketing as sumByGroup, but for tf_budgets rows. tf_budgets
 * stores amounts in their natural display sign (positive); income budgets
 * are entered as a positive expected paycheck, savings as a positive
 * contribution, etc. — no flip.
 */
export function rollupBudget(args: {
  rows: BudgetRollupRow[];
  categories: ReportCategory[];
  periods: Period[];
}): BudgetRollup {
  const { rows, categories, periods } = args;
  const periodKeys = new Set(periods.map((p) => periodKey(p)));
  const cat = new Map<string, ReportCategory>();
  for (const c of categories) cat.set(c.id, c);

  const out: BudgetRollup = { spend: 0, yearlySpend: 0, income: 0, savings: 0 };
  for (const r of rows) {
    const k = periodKey({ year: r.year, month: r.month });
    if (!periodKeys.has(k)) continue;
    const c = cat.get(r.category_id);
    if (!c?.group_name) continue;
    const amt = r.amount;
    const spendG = canonicalSpendGroup(c.group_name);
    if (spendG) {
      out.spend += amt;
      if (spendG === 'Yearly') out.yearlySpend += amt;
    } else if (c.group_name === 'Income') {
      out.income += amt;
    } else if (c.group_name === 'Savings') {
      out.savings += amt;
    }
  }
  return out;
}

/**
 * Convenience: fetch a year's worth of budget rows. We don't reuse
 * fetchBudgetYear from reports.ts directly because the dashboard wants to
 * fold in *all* groups (income/savings/yearly) and reports.ts is spend-only.
 * Same query underneath though.
 */
export async function fetchAllBudgetRows(args: {
  household_id: string;
  year: number;
}): Promise<BudgetRollupRow[]> {
  const { household_id, year } = args;
  const { data, error } = await supabase
    .from('tf_budgets')
    .select('category_id, year, month, amount')
    .eq('household_id', household_id)
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
}

// ----------------------------------------------------------------------------
// All-in-one fetcher used by DashboardPage. Pulled out so the page stays
// declarative; query is parallelised inside.
//
// FI multiplier: the page computes
//   FI multiplier = investable_assets / (trailing_12_spend × 25)
// using sumByGroup over the trailing-12 periods + the balance-sheet items
// whose equity_group ∈ INVESTABLE_GROUPS. That's all in the page; the API
// just hands it the data it needs.
// ----------------------------------------------------------------------------

export interface DashboardData {
  /** "1 MO" period — the latest-actuals month (system-wide default). */
  thisMonth: Period;
  /** YTD periods: Jan(thisMonth.year) .. thisMonth (inclusive). */
  ytd: Period[];
  /** Trailing 12 months ending at thisMonth, inclusive. */
  trailing12: Period[];

  /** All-time MonthlyActual rows we need for the dashboard math. We fetch a
   *  big enough window to cover both trailing-12 and YTD in one go. */
  monthlyRows: MonthlyActualRow[];

  budgetRows: BudgetRollupRow[];
  categories: ReportCategory[];
}

export async function fetchDashboardData(args: {
  household_id: string;
  scheme_id: string;
  thisMonth: Period;
}): Promise<DashboardData> {
  const { household_id, scheme_id, thisMonth } = args;
  const ytd = ytdPeriods(thisMonth);

  // Trailing-12 ending inclusive at thisMonth.
  const t12: Period[] = [];
  for (let i = 11; i >= 0; i--) {
    const idx = thisMonth.year * 12 + (thisMonth.month - 1) - i;
    t12.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }

  // The data window: from the START of trailing-12 (which may be in the
  // prior year) up through thisMonth. That covers YTD too since YTD ⊂ this
  // window when thisMonth is later in the year, and even when YTD straddles
  // (it can't — same year by construction). One fetch handles both.
  const from = t12[0];
  const to = thisMonth;

  const [monthlyRows, budgetRows, categories] = await Promise.all([
    fetchMonthlyActuals({ household_id, scheme_id, from, to }),
    fetchAllBudgetRows({ household_id, year: thisMonth.year }),
    fetchSchemeCategories(scheme_id),
  ]);

  return {
    thisMonth,
    ytd,
    trailing12: t12,
    monthlyRows,
    budgetRows,
    categories,
  };
}
