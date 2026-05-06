/**
 * Assumptions API — Phase 6.
 *
 * Wraps three tables (tf_income_plan, tf_savings_plan, tf_tax_assumptions)
 * plus the JSON blob in tf_household_settings for an optional per-year
 * expenses manual add (layered on top of Budget Editor spend totals on the
 * Assumptions page).
 *
 * Storage model (Phase 6 decision):
 *   - Income / Savings projection rows: month=0, is_actual=false. ONE row per
 *     (year, source_name) — annual total. Matches the spreadsheet's "Income
 *     Projection" / "Savings Projection" sections.
 *   - Income / Savings actual rows: month=1..12, is_actual=true. UP TO TWELVE
 *     rows per (year, source_name). Matches "Income Actual" / "Savings Actual".
 *   - Tax: free key/value, but the page pins a known set (fed_rate,
 *     state_rate, ss_rate, medicare_rate, prev_total_income, prev_taxable_fed,
 *     prev_tax_paid_fed, prev_taxable_state, prev_tax_paid_state).
 *   - Expenses projection manual add: expenses_projection.{year} on top of FY
 *     budget spend total.
 *   - Expenses actual manual add: expenses_actual.{year} on top of the
 *     Reforecast projected spend total for the year.
 */

import { supabase } from './supabase';

// ----------------------------------------------------------------------------
// Income plan
// ----------------------------------------------------------------------------

export interface IncomePlanRow {
  id: string;
  year: number;
  source_name: string;
  month: number;       // 0 for annual projection, 1..12 for monthly actual
  amount: number | null;
  is_actual: boolean;
  notes: string | null;
}

export async function fetchIncomePlan(args: {
  household_id: string;
  year: number;
}): Promise<IncomePlanRow[]> {
  const { household_id, year } = args;
  const { data, error } = await supabase
    .from('tf_income_plan')
    .select('id, year, source_name, month, amount, is_actual, notes')
    .eq('household_id', household_id)
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    year: r.year,
    source_name: r.source_name,
    month: r.month,
    amount: r.amount == null ? null : Number(r.amount),
    is_actual: r.is_actual,
    notes: r.notes ?? null,
  }));
}

export async function upsertIncomeRow(args: {
  household_id: string;
  year: number;
  source_name: string;
  month: number;
  is_actual: boolean;
  amount: number | null;
  notes?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_income_plan')
    .upsert(
      {
        household_id: args.household_id,
        year: args.year,
        source_name: args.source_name,
        month: args.month,
        is_actual: args.is_actual,
        amount: args.amount,
        notes: args.notes ?? null,
      },
      { onConflict: 'household_id,year,source_name,month,is_actual' },
    );
  if (error) throw error;
}

export async function deleteIncomeRow(args: {
  household_id: string;
  year: number;
  source_name: string;
  month: number;
  is_actual: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_income_plan')
    .delete()
    .eq('household_id', args.household_id)
    .eq('year', args.year)
    .eq('source_name', args.source_name)
    .eq('month', args.month)
    .eq('is_actual', args.is_actual);
  if (error) throw error;
}

/**
 * Rename a source across the year (touches both projection and actual rows
 * for that source_name). Used by the page when the user inline-edits a row
 * label. We do this server-side to keep the natural-key invariant.
 */
export async function renameIncomeSource(args: {
  household_id: string;
  year: number;
  from: string;
  to: string;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_income_plan')
    .update({ source_name: args.to })
    .eq('household_id', args.household_id)
    .eq('year', args.year)
    .eq('source_name', args.from);
  if (error) throw error;
}

/** Delete every row for a source in a year — projection AND actuals. */
export async function deleteIncomeSource(args: {
  household_id: string;
  year: number;
  source_name: string;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_income_plan')
    .delete()
    .eq('household_id', args.household_id)
    .eq('year', args.year)
    .eq('source_name', args.source_name);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Savings plan — same shape as income, account_name instead of source_name
// ----------------------------------------------------------------------------

export interface SavingsPlanRow {
  id: string;
  year: number;
  account_name: string;
  month: number;
  amount: number | null;
  is_actual: boolean;
  notes: string | null;
}

export async function fetchSavingsPlan(args: {
  household_id: string;
  year: number;
}): Promise<SavingsPlanRow[]> {
  const { household_id, year } = args;
  const { data, error } = await supabase
    .from('tf_savings_plan')
    .select('id, year, account_name, month, amount, is_actual, notes')
    .eq('household_id', household_id)
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    year: r.year,
    account_name: r.account_name,
    month: r.month,
    amount: r.amount == null ? null : Number(r.amount),
    is_actual: r.is_actual,
    notes: r.notes ?? null,
  }));
}

export async function upsertSavingsRow(args: {
  household_id: string;
  year: number;
  account_name: string;
  month: number;
  is_actual: boolean;
  amount: number | null;
  notes?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_savings_plan')
    .upsert(
      {
        household_id: args.household_id,
        year: args.year,
        account_name: args.account_name,
        month: args.month,
        is_actual: args.is_actual,
        amount: args.amount,
        notes: args.notes ?? null,
      },
      { onConflict: 'household_id,year,account_name,month,is_actual' },
    );
  if (error) throw error;
}

export async function deleteSavingsRow(args: {
  household_id: string;
  year: number;
  account_name: string;
  month: number;
  is_actual: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_savings_plan')
    .delete()
    .eq('household_id', args.household_id)
    .eq('year', args.year)
    .eq('account_name', args.account_name)
    .eq('month', args.month)
    .eq('is_actual', args.is_actual);
  if (error) throw error;
}

export async function renameSavingsAccount(args: {
  household_id: string;
  year: number;
  from: string;
  to: string;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_savings_plan')
    .update({ account_name: args.to })
    .eq('household_id', args.household_id)
    .eq('year', args.year)
    .eq('account_name', args.from);
  if (error) throw error;
}

export async function deleteSavingsAccount(args: {
  household_id: string;
  year: number;
  account_name: string;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_savings_plan')
    .delete()
    .eq('household_id', args.household_id)
    .eq('year', args.year)
    .eq('account_name', args.account_name);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Tax assumptions
// ----------------------------------------------------------------------------

export interface TaxAssumptionRow {
  id: string;
  year: number;
  key: string;
  value: number | null;
}

/** Detail rows (rates + prior-year reference amounts). */
export const PINNED_TAX_DETAIL_KEYS = [
  'fed_rate',
  'state_rate',
  'ss_rate',
  'medicare_rate',
  'prev_total_income',
  'prev_taxable_fed',
  'prev_tax_paid_fed',
  'prev_taxable_state',
  'prev_tax_paid_state',
] as const;

/**
 * Effective rates applied to projected vs actual income on the Summary /
 * waterfall. When unset, the page falls back to the sum of the four gross
 * rates above (fed + state + SS + medicare).
 */
export const PINNED_TAX_SIMPLE_KEYS = ['projection_tax_rate', 'actual_tax_rate'] as const;

/** All pinned keys (detail first in UI, then simple). */
export const PINNED_TAX_KEYS = [
  ...PINNED_TAX_DETAIL_KEYS,
  ...PINNED_TAX_SIMPLE_KEYS,
] as const;
export type PinnedTaxKey = (typeof PINNED_TAX_KEYS)[number];

/** Human labels for the pinned tax keys. */
export const TAX_KEY_LABELS: Record<PinnedTaxKey, string> = {
  fed_rate: 'Fed on Gross %',
  state_rate: 'State on Gross %',
  ss_rate: 'SS on Gross %',
  medicare_rate: 'Medicare on Gross %',
  prev_total_income: 'Prev Year Total Income',
  prev_taxable_fed: 'Prev Year Taxable (Fed)',
  prev_tax_paid_fed: 'Prev Year Tax Paid (Fed)',
  prev_taxable_state: 'Prev Year Taxable (State)',
  prev_tax_paid_state: 'Prev Year Tax Paid (State)',
  projection_tax_rate: 'Projection tax % (on projected income)',
  actual_tax_rate: 'Actual tax % (on actual income)',
};

/** Whether a pinned key is conventionally a percentage (display 0..1 as %). */
export function isRateKey(key: string): boolean {
  return key.endsWith('_rate');
}

export async function fetchTaxAssumptions(args: {
  household_id: string;
  year: number;
}): Promise<TaxAssumptionRow[]> {
  const { household_id, year } = args;
  const { data, error } = await supabase
    .from('tf_tax_assumptions')
    .select('id, year, key, value')
    .eq('household_id', household_id)
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    year: r.year,
    key: r.key,
    value: r.value == null ? null : Number(r.value),
  }));
}

export async function upsertTaxAssumption(args: {
  household_id: string;
  year: number;
  key: string;
  value: number | null;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_tax_assumptions')
    .upsert(
      {
        household_id: args.household_id,
        year: args.year,
        key: args.key,
        value: args.value,
      },
      { onConflict: 'household_id,year,key' },
    );
  if (error) throw error;
}

export async function deleteTaxAssumption(args: {
  household_id: string;
  year: number;
  key: string;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_tax_assumptions')
    .delete()
    .eq('household_id', args.household_id)
    .eq('year', args.year)
    .eq('key', args.key);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Expenses manual add — optional layer on budget total, household_settings
// ----------------------------------------------------------------------------
//
// Stored as expenses_projection.{year} for historical naming; on the Assumptions
// page this value is added to the sum of Budget Editor spend amounts for the year.

interface ExpensesProjectionMap {
  [year: string]: number;
}

interface SettingsBlob {
  goals?: string[];
  expenses_projection?: ExpensesProjectionMap;
  expenses_actual?: ExpensesProjectionMap;
  // Anything else stored in the blob we leave alone on write.
  [k: string]: unknown;
}

/** Read the projection number for one year. Returns null if not set. */
export async function fetchExpensesProjection(args: {
  household_id: string;
  year: number;
}): Promise<number | null> {
  const { household_id, year } = args;
  const { data, error } = await supabase
    .from('tf_household_settings')
    .select('data')
    .eq('household_id', household_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const blob = (data.data ?? {}) as SettingsBlob;
  const map = blob.expenses_projection ?? {};
  const v = map[String(year)];
  return typeof v === 'number' ? v : null;
}

/** Set the projection for one year, preserving every other settings field. */
export async function setExpensesProjection(args: {
  household_id: string;
  year: number;
  amount: number | null; // null clears the entry
}): Promise<void> {
  const { household_id, year, amount } = args;
  // Read-modify-write. The settings blob is small (~tens of bytes) and there's
  // exactly one writer per session so a true write-conflict isn't a real risk.
  const { data: existing, error: readErr } = await supabase
    .from('tf_household_settings')
    .select('data')
    .eq('household_id', household_id)
    .maybeSingle();
  if (readErr) throw readErr;

  const blob: SettingsBlob = (existing?.data ?? {}) as SettingsBlob;
  const map: ExpensesProjectionMap = { ...(blob.expenses_projection ?? {}) };
  if (amount == null) {
    delete map[String(year)];
  } else {
    map[String(year)] = amount;
  }
  const next: SettingsBlob = { ...blob, expenses_projection: map };

  const { error } = await supabase
    .from('tf_household_settings')
    .upsert(
      {
        household_id,
        data: next as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id' },
    );
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Expenses actual — manual total per year (same storage pattern as projection)
// ----------------------------------------------------------------------------

/** Read the manually entered actual-expenses total for one year. */
export async function fetchExpensesActual(args: {
  household_id: string;
  year: number;
}): Promise<number | null> {
  const { household_id, year } = args;
  const { data, error } = await supabase
    .from('tf_household_settings')
    .select('data')
    .eq('household_id', household_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const blob = (data.data ?? {}) as SettingsBlob;
  const map = blob.expenses_actual ?? {};
  const v = map[String(year)];
  return typeof v === 'number' ? v : null;
}

/** Set actual expenses total for one year, preserving other settings fields. */
export async function setExpensesActual(args: {
  household_id: string;
  year: number;
  amount: number | null;
}): Promise<void> {
  const { household_id, year, amount } = args;
  const { data: existing, error: readErr } = await supabase
    .from('tf_household_settings')
    .select('data')
    .eq('household_id', household_id)
    .maybeSingle();
  if (readErr) throw readErr;

  const blob: SettingsBlob = (existing?.data ?? {}) as SettingsBlob;
  const map: ExpensesProjectionMap = { ...(blob.expenses_actual ?? {}) };
  if (amount == null) {
    delete map[String(year)];
  } else {
    map[String(year)] = amount;
  }
  const next: SettingsBlob = { ...blob, expenses_actual: map };

  const { error } = await supabase
    .from('tf_household_settings')
    .upsert(
      {
        household_id,
        data: next as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id' },
    );
  if (error) throw error;
}
