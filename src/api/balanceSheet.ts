/**
 * Balance Sheet API — Phase 5.
 *
 * Tables:
 *   - tf_balance_sheet_items   (CRUD: line items, asset/liability, equity_group)
 *   - tf_balance_sheet_values  (one row per item per as_of_month — entered values)
 *
 * Effective-value (perpetuate-forward) computation lives in
 * src/features/balance-sheet/effective.ts and runs over the raw rows
 * returned by `fetchBalanceSheetValues` — see that module for why we don't
 * use a SQL view.
 */

import { supabase } from './supabase';
import type { BsItem, BsValue } from '@/features/balance-sheet/effective';

// ----------------------------------------------------------------------------
// Items
// ----------------------------------------------------------------------------

export async function fetchBalanceSheetItems(
  household_id: string,
): Promise<BsItem[]> {
  const { data, error } = await supabase
    .from('tf_balance_sheet_items')
    .select('id, name, type, sort_order, equity_group, is_active, value_source_url')
    .eq('household_id', household_id)
    .order('type', { ascending: true })   // assets first, then liabilities
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as 'asset' | 'liability',
    sort_order: r.sort_order,
    equity_group: r.equity_group ?? null,
    is_active: r.is_active,
    value_source_url: r.value_source_url ?? null,
  }));
}

export async function createBalanceSheetItem(args: {
  household_id: string;
  name: string;
  type: 'asset' | 'liability';
  equity_group?: string | null;
  sort_order?: number;
}): Promise<BsItem> {
  const { data, error } = await supabase
    .from('tf_balance_sheet_items')
    .insert({
      household_id: args.household_id,
      name: args.name,
      type: args.type,
      equity_group: args.equity_group ?? null,
      sort_order: args.sort_order ?? 0,
      is_active: true,
    })
    .select('id, name, type, sort_order, equity_group, is_active, value_source_url')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    type: data.type as 'asset' | 'liability',
    sort_order: data.sort_order,
    equity_group: data.equity_group ?? null,
    is_active: data.is_active,
    value_source_url: data.value_source_url ?? null,
  };
}

export async function updateBalanceSheetItem(args: {
  id: string;
  patch: Partial<{
    name: string;
    type: 'asset' | 'liability';
    equity_group: string | null;
    sort_order: number;
    is_active: boolean;
    value_source_url: string | null;
  }>;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_balance_sheet_items')
    .update(args.patch)
    .eq('id', args.id);
  if (error) throw error;
}

/**
 * Hard-deletes the item (and cascades the values via the FK). The UI uses
 * "deactivate" (is_active=false) for the soft case; this is the explicit
 * delete-with-values path.
 */
export async function deleteBalanceSheetItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('tf_balance_sheet_items')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Values
// ----------------------------------------------------------------------------

/**
 * Returns ALL values across ALL items for the household. The set is small
 * (a few hundred rows over a household lifetime) and we want them all in
 * memory to compute effective values + the 24-month net-worth chart in one
 * pass. Don't add date-range parameters here without a real reason.
 */
export async function fetchBalanceSheetValues(
  household_id: string,
): Promise<BsValue[]> {
  // Two-step: get item ids belonging to this household, then load values.
  // (RLS would let us do a join, but PostgREST embeds get awkward and we want
  // a flat shape anyway.)
  const { data: items, error: itemsErr } = await supabase
    .from('tf_balance_sheet_items')
    .select('id')
    .eq('household_id', household_id);
  if (itemsErr) throw itemsErr;
  const ids = (items ?? []).map((i) => i.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('tf_balance_sheet_values')
    .select('id, item_id, as_of_month, value, notes')
    .in('item_id', ids)
    .order('as_of_month', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    item_id: r.item_id,
    as_of_month: r.as_of_month,
    value: Number(r.value),
    notes: r.notes ?? null,
  }));
}

/**
 * Set (upsert) a value for one item at one month. Same as_of_month overwrites
 * in place (the unique constraint takes care of it). Use null to clear, via
 * `deleteBalanceSheetValue`.
 */
export async function setBalanceSheetValue(args: {
  item_id: string;
  as_of_month: string; // ISO YYYY-MM-01
  value: number;
  notes?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_balance_sheet_values')
    .upsert(
      {
        item_id: args.item_id,
        as_of_month: args.as_of_month,
        value: args.value,
        notes: args.notes ?? null,
      },
      { onConflict: 'item_id,as_of_month' },
    );
  if (error) throw error;
}

export async function deleteBalanceSheetValue(args: {
  item_id: string;
  as_of_month: string;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_balance_sheet_values')
    .delete()
    .eq('item_id', args.item_id)
    .eq('as_of_month', args.as_of_month);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Household settings (free-text dashboard goals + future preferences)
// ----------------------------------------------------------------------------

export interface HouseholdSettings {
  goals: string[];
}

const DEFAULT_SETTINGS: HouseholdSettings = { goals: [] };

export async function fetchHouseholdSettings(
  household_id: string,
): Promise<HouseholdSettings> {
  const { data, error } = await supabase
    .from('tf_household_settings')
    .select('data')
    .eq('household_id', household_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULT_SETTINGS };
  // Defensive: data.data may be missing fields if older callers wrote a
  // partial blob. Merge against defaults so the consumer can rely on shape.
  const blob = (data.data ?? {}) as Partial<HouseholdSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...blob,
    // Be specifically careful about the array fields — a nullable JSON could
    // come back as null even when a key exists.
    goals: Array.isArray(blob.goals) ? blob.goals : [],
  };
}

export async function saveHouseholdSettings(args: {
  household_id: string;
  settings: HouseholdSettings;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_household_settings')
    .upsert(
      {
        household_id: args.household_id,
        data: args.settings as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id' },
    );
  if (error) throw error;
}
