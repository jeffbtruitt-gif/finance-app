/**
 * Assumptions rollups — Phase 6.
 *
 * Pure functions that turn the raw rows from `src/api/assumptions.ts` into
 * the shapes the page renders:
 *
 *   - listSources(rows)            → distinct source/account names, ordered.
 *   - projectionTotal(rows, year)  → annual projection total across all sources.
 *   - actualTotal(rows, year)      → annual actual total across all months.
 *   - projectionByName(rows)       → Map<source_name, annual amount>.
 *   - actualGrid(rows)             → Map<source_name, [m1..m12]>.
 *   - actualMonthlyTotals(rows)    → number[12].
 *
 * Plus a single-shot waterfall calc (`buildWaterfall`) used by the chart and
 * the summary table. Expenses legs are caller-supplied (manual totals on the
 * Assumptions page).
 *
 * Sign convention:
 *   - All numbers in this module are stored / computed POSITIVE — Income +,
 *     Tax + (subtracted from income later), Expenses + (subtracted), Savings
 *     + (subtracted), Left Over = Income − Tax − Expenses − Savings.
 *   - This matches the spreadsheet's Main Detail tab. The sign-flip for
 *     income transactions (which are stored negative in tf_transactions)
 *     does NOT apply here because tf_income_plan stores the user-entered
 *     positive number directly — it's a plan, not a transaction.
 */

import type { IncomePlanRow, SavingsPlanRow } from '@/api/assumptions';

// ----------------------------------------------------------------------------
// Generic helpers — work for both IncomePlanRow (source_name) and
// SavingsPlanRow (account_name). We expose a generic version so the savings
// section can reuse the same machinery without copy-paste.
// ----------------------------------------------------------------------------

function nameOf(r: IncomePlanRow | SavingsPlanRow): string {
  return 'source_name' in r ? r.source_name : r.account_name;
}

/** Distinct source/account names, ordered by their first appearance. */
export function listSources(rows: Array<IncomePlanRow | SavingsPlanRow>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const n = nameOf(r);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/** projection (is_actual=false, month=0) amount per source. */
export function projectionByName(
  rows: Array<IncomePlanRow | SavingsPlanRow>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.is_actual) continue;
    if (r.month !== 0) continue;
    m.set(nameOf(r), Number(r.amount ?? 0));
  }
  return m;
}

/** actual grid: source → [m1..m12] (zero-filled). */
export function actualGrid(
  rows: Array<IncomePlanRow | SavingsPlanRow>,
): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.is_actual) continue;
    if (r.month < 1 || r.month > 12) continue;
    const n = nameOf(r);
    let arr = m.get(n);
    if (!arr) {
      arr = Array(12).fill(0);
      m.set(n, arr);
    }
    arr[r.month - 1] = Number(r.amount ?? 0);
  }
  return m;
}

/** Total of all projection rows. */
export function projectionTotal(
  rows: Array<IncomePlanRow | SavingsPlanRow>,
): number {
  let t = 0;
  for (const r of rows) {
    if (r.is_actual || r.month !== 0) continue;
    t += Number(r.amount ?? 0);
  }
  return t;
}

/** Total of all actual rows (sum across all sources, all months). */
export function actualTotal(
  rows: Array<IncomePlanRow | SavingsPlanRow>,
): number {
  let t = 0;
  for (const r of rows) {
    if (!r.is_actual) continue;
    if (r.month < 1 || r.month > 12) continue;
    t += Number(r.amount ?? 0);
  }
  return t;
}

/** Sum of all actual rows for one specific month (1..12). */
export function actualMonthlyTotal(
  rows: Array<IncomePlanRow | SavingsPlanRow>,
  month: number,
): number {
  let t = 0;
  for (const r of rows) {
    if (!r.is_actual) continue;
    if (r.month !== month) continue;
    t += Number(r.amount ?? 0);
  }
  return t;
}

/** Per-source actual annual total (sum of m1..m12 for that source). */
export function actualByName(
  rows: Array<IncomePlanRow | SavingsPlanRow>,
): Map<string, number> {
  const grid = actualGrid(rows);
  const m = new Map<string, number>();
  for (const [name, arr] of grid) {
    m.set(name, arr.reduce((a, b) => a + b, 0));
  }
  return m;
}

// ----------------------------------------------------------------------------
// Simple Percentages — mirrors rows 27-33 of the Main Detail tab
// ----------------------------------------------------------------------------

export interface SimplePercentages {
  income: number;
  taxPct: number;       // user input (or computed); 0..1
  taxDollars: number;   // income × taxPct
  savingsPct: number;   // savingsDollars / income
  savingsDollars: number;
  expensesPct: number;  // expensesDollars / income
  expensesDollars: number;
  /** income − tax − savings − expenses */
  leftover: number;
}

/**
 * Build the Simple Percentages summary for either side (projection or actual).
 *
 * The spreadsheet does this twice: once with projected income + the projected
 * tax %, once with actual income + the actual tax %. We let the caller pass
 * in `taxPct` (it might be the same fed+state+ss+medicare composite for both
 * columns, or you might compute actual tax % from prev-year tax paid /
 * actual income — your call at the page level).
 *
 * `savingsPct` / `expensesPct` mirror that pattern (dollars ÷ income).
 */
export function buildSimplePercentages(args: {
  income: number;
  savingsDollars: number;
  expensesDollars: number;
  taxPct: number;
}): SimplePercentages {
  const { income, savingsDollars, expensesDollars, taxPct } = args;
  const taxDollars = income * taxPct;
  const savingsPct = income > 0 ? savingsDollars / income : 0;
  const expensesPct = income > 0 ? expensesDollars / income : 0;
  return {
    income,
    taxPct,
    taxDollars,
    savingsPct,
    savingsDollars,
    expensesPct,
    expensesDollars,
    leftover: income - taxDollars - savingsDollars - expensesDollars,
  };
}

// ----------------------------------------------------------------------------
// Waterfall — Income → Tax → Expenses → Savings → Left Over
// ----------------------------------------------------------------------------

export interface WaterfallStep {
  /** Display label. */
  label: 'Income' | 'Tax' | 'Expenses' | 'Savings' | 'Left Over';
  /** Signed delta from running total: + for Income, − for Tax/Expenses/Savings. */
  delta: number;
  /** Running total after applying this step's delta. The first step (Income)
   *  starts at 0 + delta = delta itself. The last step (Left Over) is the
   *  running total at the end and has delta=0 conceptually but we surface it
   *  for the chart as a "final bar" sized to the running total. */
  total: number;
}

export interface Waterfall {
  steps: WaterfallStep[];
  income: number;
  tax: number;
  expenses: number;
  savings: number;
  leftover: number;
}

export function buildWaterfall(args: {
  income: number;
  tax: number;
  expenses: number;
  savings: number;
}): Waterfall {
  const { income, tax, expenses, savings } = args;
  const leftover = income - tax - expenses - savings;

  const steps: WaterfallStep[] = [
    { label: 'Income',    delta:  income,    total: income },
    { label: 'Tax',       delta: -tax,       total: income - tax },
    { label: 'Expenses',  delta: -expenses,  total: income - tax - expenses },
    { label: 'Savings',   delta: -savings,   total: leftover },
    { label: 'Left Over', delta: leftover,   total: leftover },
  ];

  return { steps, income, tax, expenses, savings, leftover };
}
