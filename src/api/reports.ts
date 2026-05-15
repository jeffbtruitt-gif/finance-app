/**
 * Reports API — Phase 3.
 *
 * Queries `tf_v_monthly_category_actuals` (created in migration 04) and
 * `tf_budgets` to power the report pages. Everything is keyed by household.
 *
 * Sign convention reminder: storage is `out = positive`. These helpers return
 * raw stored amounts; the display layer (src/lib/money.ts) decides whether to
 * flip for presentation. For Phase 3 (spend-only reports) no flip is needed.
 */

import { supabase } from './supabase';
import type { Period } from '@/lib/period';
import { periodKey } from '@/lib/period';

// ============================================================================
// Types
// ============================================================================

export interface MonthlyActualRow {
  scheme_id: string;
  category_id: string;
  year: number;
  month: number;
  total: number;
  txn_count: number;
}

export interface BudgetRow {
  category_id: string;
  year: number;
  month: number;
  amount: number;
}

/** A single (category × period) actual lookup, keyed by `${category_id}|${YYYY-MM}` */
export type ActualLookup = Map<string, number>;

/** A single (category × period) budget lookup, same key. */
export type BudgetLookup = Map<string, number>;

// ============================================================================
// Actuals
// ============================================================================

/**
 * Fetch monthly actuals for the given household + scheme, restricted to a
 * (year, month) range. Range is inclusive on both ends.
 *
 * Used by:
 *   - 1 MO report  (single period: from = to = the picker's month)
 *   - YTD report   (from = Jan, to = picker's month; also a second call for prior year)
 *   - Averages     (from = picker - 12 months, to = picker)
 */
export async function fetchMonthlyActuals(args: {
  household_id: string;
  scheme_id: string;
  from: Period;
  to: Period;
}): Promise<MonthlyActualRow[]> {
  const { household_id, scheme_id, from, to } = args;

  // The view exposes year+month as integer columns. We translate the period
  // range into an OR of (year > X) OR (year = X AND month >= Y) etc.
  // Simpler: query the inclusive year range, then filter in JS. Cheaper for
  // the planner and avoids hairy OR chains in PostgREST.
  const { data, error } = await supabase
    .from('tf_v_monthly_category_actuals')
    .select('scheme_id, category_id, year, month, total, txn_count')
    .eq('household_id', household_id)
    .eq('scheme_id', scheme_id)
    .gte('year', from.year)
    .lte('year', to.year);
  if (error) throw error;

  const rows = (data ?? []) as MonthlyActualRow[];
  return rows.filter(r => {
    const after = r.year > from.year || (r.year === from.year && r.month >= from.month);
    const before = r.year < to.year || (r.year === to.year && r.month <= to.month);
    return after && before;
  }).map(r => ({ ...r, total: Number(r.total) }));
}

/**
 * Convenience: shape actuals into a (category_id, period) → total lookup map.
 */
export function actualsToLookup(rows: MonthlyActualRow[]): ActualLookup {
  const m: ActualLookup = new Map();
  for (const r of rows) {
    m.set(`${r.category_id}|${periodKey({ year: r.year, month: r.month })}`, r.total);
  }
  return m;
}

// ============================================================================
// Budgets
// ============================================================================

/**
 * Fetch the full budget for a year. Reports query a year at a time and
 * pivot client-side; the editor uses the same shape.
 */
export async function fetchBudgetYear(args: {
  household_id: string;
  year: number;
}): Promise<BudgetRow[]> {
  const { household_id, year } = args;
  const { data, error } = await supabase
    .from('tf_budgets')
    .select('category_id, year, month, amount')
    .eq('household_id', household_id)
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).map(r => ({ ...r, amount: Number(r.amount) }));
}

export function budgetsToLookup(rows: BudgetRow[]): BudgetLookup {
  const m: BudgetLookup = new Map();
  for (const r of rows) {
    m.set(`${r.category_id}|${periodKey({ year: r.year, month: r.month })}`, r.amount);
  }
  return m;
}

/**
 * Upsert a single budget cell. The grid editor calls this per cell on blur.
 * Setting amount = 0 still stores a row (intentional zero); use
 * `deleteBudgetCell` for "no budget set".
 */
export async function upsertBudgetCell(args: {
  household_id: string;
  year: number;
  month: number;
  category_id: string;
  amount: number;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_budgets')
    .upsert(
      {
        household_id: args.household_id,
        year: args.year,
        month: args.month,
        category_id: args.category_id,
        amount: args.amount,
      },
      { onConflict: 'household_id,year,month,category_id' },
    );
  if (error) throw error;
}

export async function deleteBudgetCell(args: {
  household_id: string;
  year: number;
  month: number;
  category_id: string;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_budgets')
    .delete()
    .eq('household_id', args.household_id)
    .eq('year', args.year)
    .eq('month', args.month)
    .eq('category_id', args.category_id);
  if (error) throw error;
}

/** Bulk upsert — used by "pull from averages" applied to a whole row. */
export async function upsertBudgetCells(
  rows: Array<{
    household_id: string;
    year: number;
    month: number;
    category_id: string;
    amount: number;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('tf_budgets')
    .upsert(rows, { onConflict: 'household_id,year,month,category_id' });
  if (error) throw error;
}

// ============================================================================
// Categories — for reports we need the full set including their grouping
// ============================================================================

export interface ReportCategory {
  id: string;
  name: string;
  group_name: string | null;
  sort_order: number;
  is_yearly: boolean;
  status: string;
  /** Hex override from `tf_categories.color_override`; charts fall back to palette. */
  color_override: string | null;
}

/**
 * All active categories for the scheme, ordered by sort_order.
 * Reports group by group_name + is_yearly client-side
 * (see src/features/reports/grouping.ts).
 */
export async function fetchSchemeCategories(scheme_id: string): Promise<ReportCategory[]> {
  const { data, error } = await supabase
    .from('tf_categories')
    .select('id, name, group_name, sort_order, is_yearly, status, color_override')
    .eq('scheme_id', scheme_id)
    .eq('status', 'active')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...(r as ReportCategory),
    color_override: (r as { color_override?: string | null }).color_override ?? null,
  }));
}

// ============================================================================
// Monthly Reports shell — transactions for a calendar month (+ drill filters)
// ============================================================================

export interface ReportShellTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  account_id: string;
  account_name: string;
  category_id: string | null;
  category_name: string | null;
  category_group: string | null;
}

const REPORT_TX_SELECT = `
  id, date, description, amount, account_id,
  account:tf_accounts!inner ( name ),
  tf_transaction_categories (
    scheme_id,
    category_id,
    category:tf_categories ( name, group_name )
  )
`;

function mapReportShellRow(scheme_id: string, r: any): ReportShellTransaction {
  const account_name: string = Array.isArray(r.account)
    ? r.account[0]?.name ?? ''
    : r.account?.name ?? '';
  const tcs = r.tf_transaction_categories;
  const arr: any[] = Array.isArray(tcs) ? tcs : tcs ? [tcs] : [];
  const tc = arr.find((x) => x?.scheme_id === scheme_id);
  const cat = tc?.category;
  const catObj = Array.isArray(cat) ? cat[0] : cat;
  return {
    id: r.id,
    date: r.date,
    description: r.description,
    amount: Number(r.amount),
    account_id: String(r.account_id ?? ''),
    account_name,
    category_id: tc?.category_id ?? null,
    category_name: catObj?.name ?? null,
    category_group: catObj?.group_name ?? null,
  };
}

/**
 * Household transactions with default-scheme category metadata (for reports).
 * Omit both `from` and `to` for all-time (newest first, capped at 8000 rows).
 * Pass both for an inclusive date range.
 */
export async function fetchReportShellTransactions(args: {
  household_id: string;
  scheme_id: string;
  /** Inclusive lower bound; omit with `to` for no date filter. */
  from?: string;
  /** Inclusive upper bound; omit with `from` for no date filter. */
  to?: string;
}): Promise<ReportShellTransaction[]> {
  const { household_id, scheme_id, from, to } = args;
  let q = supabase
    .from('tf_transactions')
    .select(REPORT_TX_SELECT)
    .eq('household_id', household_id);
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  const { data, error } = await q.order('date', { ascending: false }).limit(8000);
  if (error) throw error;
  return ((data as any[]) ?? []).map((r) => mapReportShellRow(scheme_id, r));
}

// ============================================================================
// Single Detail — transactions for one category in a date range
// ============================================================================

export interface DetailTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  account_name: string;
  notes: string | null;
  tag: string | null;
}

export async function fetchCategoryTransactions(args: {
  household_id: string;
  scheme_id: string;
  category_id?: string;
  from?: string; // ISO date; omit for "all time"
  to?: string;   // ISO date; omit for "all time"
}): Promise<DetailTransaction[]> {
  const { household_id, scheme_id, category_id, from, to } = args;

  let catQ = supabase
    .from('tf_transaction_categories')
    .select('transaction_id')
    .eq('scheme_id', scheme_id);
  if (category_id) catQ = catQ.eq('category_id', category_id);
  const { data: catRows, error: catErr } = await catQ;
  if (catErr) throw catErr;
  const ids = [...new Set((catRows ?? []).map(r => r.transaction_id))];
  if (ids.length === 0) return [];

  // Fetch transactions in chunks (Postgres `in` clause practical limit).
  const CHUNK = 500;
  const all: DetailTransaction[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    // We embed the account name through the FK; the embed isn't declared in
    // our hand-rolled `Database` types so the row type widens to `any`. That's
    // fine — the runtime shape is well-known and we cast once below.
    let q = supabase
      .from('tf_transactions')
      .select('id, date, description, amount, notes, tag, account:tf_accounts!inner(name)')
      .eq('household_id', household_id)
      .in('id', slice);
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
    const { data, error } = await q.order('date', { ascending: false });
    if (error) throw error;
    for (const r of (data as any[]) ?? []) {
      const account_name: string = Array.isArray(r.account)
        ? r.account[0]?.name ?? ''
        : r.account?.name ?? '';
      all.push({
        id: r.id,
        date: r.date,
        description: r.description,
        amount: Number(r.amount),
        account_name,
        notes: r.notes ?? null,
        tag: r.tag ?? null,
      });
    }
  }

  return all.sort((a, b) => b.date.localeCompare(a.date));
}

// ============================================================================
// Latest-month-with-data lookup
// ============================================================================

/**
 * Returns the most recent (year, month) for which there is ANY transaction
 * for this household in this scheme. Used by the Averages page to anchor its
 * 12-month history grid on real data instead of the picker, so empty trailing
 * months don't waste columns.
 *
 * Returns null when the household has no categorized transactions yet.
 */
export async function fetchLatestActualPeriod(args: {
  household_id: string;
  scheme_id: string;
}): Promise<{ year: number; month: number } | null> {
  const { household_id, scheme_id } = args;

  // The view aggregates per (household, scheme, category, year, month). We
  // ask Postgres to sort by year+month desc and take the top row. We can't
  // .order() on an expression in PostgREST, but year then month works because
  // both are integer columns.
  const { data, error } = await supabase
    .from('tf_v_monthly_category_actuals')
    .select('year, month')
    .eq('household_id', household_id)
    .eq('scheme_id', scheme_id)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return { year: data[0].year, month: data[0].month };
}

// ============================================================================
// Default scheme lookup — every page needs the active scheme; we centralize.
// ============================================================================

/** TanStack Query key; cached data must be the scheme UUID string from `fetchDefaultSchemeId`. */
export function defaultSchemeQueryKey(householdId: string | undefined) {
  return ['default-scheme-id', householdId] as const;
}

export async function fetchDefaultSchemeId(household_id: string): Promise<string> {
  const { data, error } = await supabase
    .from('tf_category_schemes')
    .select('id')
    .eq('household_id', household_id)
    .eq('is_default', true)
    .single();
  if (error) throw error;
  return data.id;
}
