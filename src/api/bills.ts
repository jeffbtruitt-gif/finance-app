/**
 * Bills API — monthly recurring bills with website URLs.
 */

import { supabase } from './supabase';

export interface Bill {
  id: string;
  household_id: string;
  name: string;
  url: string | null;
  notes: string | null;
  amount: number | null;
  due_day: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export async function fetchBills(household_id: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('tf_bills')
    .select('*')
    .eq('household_id', household_id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Bill[];
}

export async function createBill(args: {
  household_id: string;
  name: string;
  url?: string | null;
  notes?: string | null;
  amount?: number | null;
  due_day?: number | null;
  sort_order?: number;
}): Promise<Bill> {
  const { data, error } = await supabase
    .from('tf_bills')
    .insert({
      household_id: args.household_id,
      name: args.name,
      url: args.url ?? null,
      notes: args.notes ?? null,
      amount: args.amount ?? null,
      due_day: args.due_day ?? null,
      sort_order: args.sort_order ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Bill;
}

export async function updateBill(args: {
  id: string;
  patch: Partial<Pick<Bill, 'name' | 'url' | 'notes' | 'amount' | 'due_day' | 'is_active' | 'sort_order'>>;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_bills')
    .update(args.patch)
    .eq('id', args.id);
  if (error) throw error;
}

export async function deleteBill(id: string): Promise<void> {
  const { error } = await supabase
    .from('tf_bills')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
