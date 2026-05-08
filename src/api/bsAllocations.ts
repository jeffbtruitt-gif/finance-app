/**
 * BS Allocations API — asset class percentage splits per BS item.
 */

import { supabase } from './supabase';

export const ALLOCATION_CATEGORIES = [
  'us_stocks',
  'intl_stocks',
  'fixed_income',
  'real_estate',
  'cash',
] as const;

export type AllocationCategory = (typeof ALLOCATION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<AllocationCategory, string> = {
  us_stocks: 'US Stocks',
  intl_stocks: "Int'l Stocks",
  fixed_income: 'Fixed Income',
  real_estate: 'Real Estate',
  cash: 'Cash',
};

export const CATEGORY_COLORS: Record<AllocationCategory, string> = {
  us_stocks: '#2563eb',
  intl_stocks: '#7c3aed',
  fixed_income: '#059669',
  real_estate: '#d97706',
  cash: '#64748b',
};

export interface BsAllocation {
  id: string;
  item_id: string;
  household_id: string;
  category: AllocationCategory;
  percentage: number;
}

export async function fetchAllocations(household_id: string): Promise<BsAllocation[]> {
  const { data, error } = await supabase
    .from('tf_bs_allocations')
    .select('*')
    .eq('household_id', household_id);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    percentage: Number(r.percentage),
  })) as BsAllocation[];
}

export async function upsertAllocation(args: {
  item_id: string;
  household_id: string;
  category: AllocationCategory;
  percentage: number;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_bs_allocations')
    .upsert(
      {
        item_id: args.item_id,
        household_id: args.household_id,
        category: args.category,
        percentage: args.percentage,
      },
      { onConflict: 'item_id,category' },
    );
  if (error) throw error;
}

export async function deleteAllocationsForItem(item_id: string): Promise<void> {
  const { error } = await supabase
    .from('tf_bs_allocations')
    .delete()
    .eq('item_id', item_id);
  if (error) throw error;
}
