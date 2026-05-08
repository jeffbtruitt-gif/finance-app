/**
 * Performance API — track monthly return rates per portfolio account.
 */

import { supabase } from './supabase';

export interface PerfAccount {
  id: string;
  household_id: string;
  item_id: string;
  created_at: string;
}

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
