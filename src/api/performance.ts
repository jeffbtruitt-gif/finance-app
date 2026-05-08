/**
 * Performance API — track monthly return rates per portfolio account.
 */

import { supabase } from './supabase';

export interface PerfAccount {
  id: string;
  household_id: string;
  item_id: string | null;
  factor_key: string | null;
  label: string | null;
  created_at: string;
}

export const FF_FACTORS = [
  { key: 'mkt_rf', short: 'Mkt-RF', label: 'Market Premium' },
  { key: 'smb', short: 'SMB', label: 'Size Premium' },
  { key: 'hml', short: 'HML', label: 'Value Premium' },
  { key: 'rf', short: 'RF', label: 'Risk-Free Rate' },
] as const;

export type FfFactorKey = (typeof FF_FACTORS)[number]['key'];

export interface PerfRate {
  id: string;
  account_id: string;
  month: string; // YYYY-MM-01
  rate: number;
}

export async function fetchPerfAccounts(household_id: string): Promise<PerfAccount[]> {
  const { data, error } = await supabase
    .from('tf_performance_accounts')
    .select('*')
    .eq('household_id', household_id);
  if (error) throw error;
  return data ?? [];
}

export async function addPerfAccount(household_id: string, item_id: string): Promise<void> {
  const { error } = await supabase
    .from('tf_performance_accounts')
    .insert({ household_id, item_id });
  if (error) throw error;
}

export async function removePerfAccount(id: string): Promise<void> {
  const { error } = await supabase
    .from('tf_performance_accounts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function fetchPerfRates(
  accountIds: string[],
  monthFrom?: string,
  monthTo?: string,
): Promise<PerfRate[]> {
  if (accountIds.length === 0) return [];
  let q = supabase
    .from('tf_performance_rates')
    .select('*')
    .in('account_id', accountIds);
  if (monthFrom) q = q.gte('month', monthFrom);
  if (monthTo) q = q.lte('month', monthTo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, rate: Number(r.rate) }));
}

export async function upsertPerfRate(account_id: string, month: string, rate: number): Promise<void> {
  const { error } = await supabase
    .from('tf_performance_rates')
    .upsert(
      { account_id, month, rate },
      { onConflict: 'account_id,month' },
    );
  if (error) throw error;
}

/**
 * Ensure a factor account exists for the given household + factor_key.
 * Returns the account id (existing or newly created).
 */
export async function ensureFactorAccount(
  household_id: string,
  factor_key: string,
  label: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('tf_performance_accounts')
    .select('id')
    .eq('household_id', household_id)
    .eq('factor_key', factor_key)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('tf_performance_accounts')
    .insert({ household_id, factor_key, label })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

/**
 * Fetch factor rates for a single month across all factor accounts in a household.
 * Returns joined rows with factor_key and label from the account.
 */
export async function fetchFactorRatesForMonth(
  household_id: string,
  month: string,
): Promise<{ factor_key: string; label: string | null; rate: number }[]> {
  const { data, error } = await supabase
    .from('tf_performance_rates')
    .select('rate, account:tf_performance_accounts!inner(factor_key, label)')
    .eq('account.household_id', household_id)
    .not('account.factor_key', 'is', null)
    .eq('month', month);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    factor_key: r.account.factor_key as string,
    label: r.account.label as string | null,
    rate: Number(r.rate),
  }));
}

/**
 * Bulk upsert rates for a single account. Used by the F-F import.
 */
export async function bulkUpsertRates(
  rows: { account_id: string; month: string; rate: number }[],
): Promise<void> {
  if (rows.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('tf_performance_rates')
      .upsert(chunk, { onConflict: 'account_id,month' });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Regression results
// ---------------------------------------------------------------------------

export interface RegressionRow {
  id: string;
  household_id: string;
  account_id: string;
  run_date: string;
  regression_type: 'single' | 'multi';
  period_months: number;
  period_end: string;
  alpha: number;
  alpha_se: number;
  alpha_pvalue: number;
  beta_mkt: number;
  beta_mkt_se: number;
  beta_mkt_pvalue: number;
  beta_smb: number | null;
  beta_smb_se: number | null;
  beta_smb_pvalue: number | null;
  beta_hml: number | null;
  beta_hml_se: number | null;
  beta_hml_pvalue: number | null;
  r_squared: number;
  adj_r_squared: number;
  n_observations: number;
  created_at: string;
}

export type RegressionInsert = Omit<RegressionRow, 'id' | 'created_at'>;

export async function saveRegressionResults(rows: RegressionInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('tf_performance_regressions')
    .upsert(rows as any[], {
      onConflict: 'household_id,run_date,regression_type,period_months,account_id',
    });
  if (error) throw error;
}

export async function fetchRegressionResults(household_id: string): Promise<RegressionRow[]> {
  const { data, error } = await supabase
    .from('tf_performance_regressions')
    .select('*')
    .eq('household_id', household_id)
    .order('run_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    alpha: Number(r.alpha),
    alpha_se: Number(r.alpha_se),
    alpha_pvalue: Number(r.alpha_pvalue),
    beta_mkt: Number(r.beta_mkt),
    beta_mkt_se: Number(r.beta_mkt_se),
    beta_mkt_pvalue: Number(r.beta_mkt_pvalue),
    beta_smb: r.beta_smb != null ? Number(r.beta_smb) : null,
    beta_smb_se: r.beta_smb_se != null ? Number(r.beta_smb_se) : null,
    beta_smb_pvalue: r.beta_smb_pvalue != null ? Number(r.beta_smb_pvalue) : null,
    beta_hml: r.beta_hml != null ? Number(r.beta_hml) : null,
    beta_hml_se: r.beta_hml_se != null ? Number(r.beta_hml_se) : null,
    beta_hml_pvalue: r.beta_hml_pvalue != null ? Number(r.beta_hml_pvalue) : null,
    r_squared: Number(r.r_squared),
    adj_r_squared: Number(r.adj_r_squared),
    n_observations: Number(r.n_observations),
  }));
}

export async function deleteRegressionRun(
  household_id: string,
  run_date: string,
): Promise<void> {
  const { error } = await supabase
    .from('tf_performance_regressions')
    .delete()
    .eq('household_id', household_id)
    .eq('run_date', run_date);
  if (error) throw error;
}
