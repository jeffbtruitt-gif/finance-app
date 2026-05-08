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

export async function fetchPerfRates(accountIds: string[]): Promise<PerfRate[]> {
  if (accountIds.length === 0) return [];
  const { data, error } = await supabase
    .from('tf_performance_rates')
    .select('*')
    .in('account_id', accountIds);
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
