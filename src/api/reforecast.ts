/**
 * Reforecast API — Phase 4.
 *
 * Workflow:
 *   1. Pick a year (defaults to the year of the latest-actuals month).
 *   2. as_of_month is locked to the latest month with any transaction
 *      (system-wide convention). When that month is not in the year being
 *      revised — e.g. you're revising 2026 mid-2027 — we fall back to month 12
 *      of the year being revised, since by then "as of now" means "after the
 *      year is done".
 *   3. The editor seeds future-month cells from the most recent prior snapshot
 *      for the same year (any as_of_month); falls back to tf_budgets if none.
 *   4. Past-month cells (months <= as_of_month) display the live actual,
 *      read-only.
 *   5. Save upserts (year, as_of_month, category, month) rows; same as_of_month
 *      saves overwrite in place (unique constraint added in migration 06).
 */

import { supabase } from './supabase';

// ============================================================================
// Latest actual period (system-wide default)
// ============================================================================

/**
 * The latest month with any transaction for the household. Returns null when
 * no transactions exist yet.
 *
 * Unlike `fetchLatestActualPeriod` in reports.ts (which is scheme-scoped via
 * the monthly view), this hits the dedicated `tf_v_latest_actual_period` view
 * — useful for the system-wide default that doesn't depend on a specific
 * scheme.
 */
export async function fetchLatestActualPeriodGlobal(
  household_id: string,
): Promise<{ year: number; month: number } | null> {
  const { data, error } = await supabase
    .from('tf_v_latest_actual_period')
    .select('year, month')
    .eq('household_id', household_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { year: data.year, month: data.month };
}

// ============================================================================
// Revised snapshots
// ============================================================================

export interface RevisedBudgetRow {
  category_id: string;
  year: number;
  as_of_month: number;
  month: number;
  amount: number;
  created_at: string;
}

/**
 * All snapshots for a year, regardless of as_of_month. Used to:
 *   - Find the "most recent prior" snapshot to seed the editor.
 *   - List existing snapshots in the UI (so the user knows whether saving
 *     today will overwrite an existing as_of-this-month snapshot).
 */
export async function fetchAllRevisedForYear(args: {
  household_id: string;
  year: number;
}): Promise<RevisedBudgetRow[]> {
  const { household_id, year } = args;
  const { data, error } = await supabase
    .from('tf_revised_budgets')
    .select('category_id, year, as_of_month, month, amount, created_at')
    .eq('household_id', household_id)
    .eq('year', year)
    .order('as_of_month', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/**
 * Returns the distinct as_of_months that have at least one revised row for
 * the given year. Most-recent first. The Reforecast page surfaces this as a
 * "previously saved snapshots" panel.
 */
export function listSnapshotMonths(rows: RevisedBudgetRow[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const r of rows) {
    if (!seen.has(r.as_of_month)) {
      seen.add(r.as_of_month);
      out.push(r.as_of_month);
    }
  }
  // already in desc order from the query, but defensive sort
  return out.sort((a, b) => b - a);
}

/** Filter the all-snapshots fetch down to ONE specific as_of_month. */
export function filterToAsOf(
  rows: RevisedBudgetRow[],
  as_of_month: number,
): RevisedBudgetRow[] {
  return rows.filter((r) => r.as_of_month === as_of_month);
}

/**
 * Build a (category_id, month) → amount lookup from the supplied snapshot rows.
 * Same key shape as the budget/actuals lookups in reports.ts — just keyed on
 * month-only since revised snapshots are scoped to one year.
 */
export type RevisedLookup = Map<string, number>;

export function revisedToLookup(rows: RevisedBudgetRow[]): RevisedLookup {
  const m: RevisedLookup = new Map();
  for (const r of rows) m.set(`${r.category_id}|${r.month}`, r.amount);
  return m;
}

/**
 * Find the most recent prior snapshot relative to the given as_of_month. Used
 * to seed the editor when no snapshot exists yet for as_of_month. "Most
 * recent" means the largest as_of_month strictly less than the target; if
 * none exists, returns an empty list (caller falls back to tf_budgets).
 */
export function findMostRecentPriorSnapshot(
  rows: RevisedBudgetRow[],
  as_of_month: number,
): RevisedBudgetRow[] {
  // Largest as_of_month that is < as_of_month, OR if as_of_month itself has no
  // rows, the largest one overall. The caller passes the target as_of_month so
  // we don't accidentally pick "the same month" as the prior.
  const months = listSnapshotMonths(rows).filter((m) => m < as_of_month);
  if (months.length === 0) return [];
  const target = months[0]; // months is desc-sorted
  return filterToAsOf(rows, target);
}

/**
 * Save (upsert) a complete snapshot for (household, year, as_of_month).
 *
 * The unique constraint on (household_id, year, as_of_month, category_id,
 * month) means we can use a bulk upsert: same as_of_month re-save overwrites
 * each cell in place; new as_of_month creates fresh rows.
 *
 * We DON'T delete cells the user emptied — we leave them as zero. Reason:
 * `tf_revised_budgets.amount` is `not null` and a snapshot conceptually
 * represents "the budget as of this revision date" so a missing row would be
 * ambiguous (vs explicit zero). The editor saves zeros for any cell the user
 * cleared.
 */
export async function saveRevisedSnapshot(args: {
  household_id: string;
  year: number;
  as_of_month: number;
  cells: Array<{ category_id: string; month: number; amount: number }>;
}): Promise<void> {
  const { household_id, year, as_of_month, cells } = args;
  if (cells.length === 0) return;

  const payload = cells.map((c) => ({
    household_id,
    year,
    as_of_month,
    category_id: c.category_id,
    month: c.month,
    amount: c.amount,
  }));

  const { error } = await supabase
    .from('tf_revised_budgets')
    .upsert(payload, {
      onConflict: 'household_id,year,as_of_month,category_id,month',
    });
  if (error) throw error;
}
