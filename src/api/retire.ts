/**
 * Retire API — Phase 7 + Scenario Layer.
 *
 * Wraps tf_retire_inputs (key/value text pairs) and tf_retire_scenarios for
 * the Retirement page.
 *
 * Scenario model:
 *   - Each household has one or more named scenarios. The default scenario
 *     ("Main Scenario") is created automatically.
 *   - Per-scenario keys (return rate, contributions, spend, etc.) are stored
 *     with scenario_id set. Shared keys (starting balance) have scenario_id
 *     NULL and apply to all scenarios.
 *   - The page loads all scenarios, runs projections for each (for the
 *     comparison view), and lets the user edit one at a time.
 */

import { supabase } from './supabase';

// ----------------------------------------------------------------------------
// Pinned key set
// ----------------------------------------------------------------------------

/** All keys the Retire page renders as a typed input. The order in this
 *  array drives the order they appear in the form. */
export const PINNED_RETIRE_KEYS = [
  // Contributions (annual, dollars)
  'jeff_yearly_contrib',
  'brit_yearly_contrib',
  // Growth assumption (decimal rate)
  'return_rate',
  // Social Security (annual, dollars). 0 = "don't count on it"; matches the
  // spreadsheet's note "dont count on SS".
  'jeff_ss',
  'brit_ss',
  // Retire ages (start drawing spend at this age)
  'jeff_retire_age',
  'brit_retire_age',
  // Birth years — drive age-by-year math. Defaults baked into the page if
  // unset (Jeff 1987, Brit 1988) per the spreadsheet's hard-coded constants.
  'jeff_birth_year',
  'brit_birth_year',
  // Effective tax rate during retirement (decimal). Used to gross up the
  // pre-tax withdrawal needed to net retire_spend.
  'retire_tax_rate',
] as const;

export type PinnedRetireKey = (typeof PINNED_RETIRE_KEYS)[number];

/** Balance sheet line item UUIDs (JSON array) + optional extra dollars — see `resolveRetireStartingBalance`. */
export const RETIRE_START_BS_ITEM_IDS_KEY = 'retire_start_bs_item_ids';
/** Additional dollars added on top of selected balance-sheet items. */
export const RETIRE_START_EXTRA_KEY = 'retire_start_extra';
/** Legacy single starting balance (dollars); used only when no composition keys exist. */
export const RETIRE_LEGACY_STARTING_BALANCE_KEY = 'starting_balance';

/** Category UUIDs excluded from reforecast-derived annual retirement spend (JSON array). */
export const RETIRE_SPEND_EXCLUDED_CATEGORY_IDS_KEY = 'retire_spend_excluded_category_ids';

/** Dollars added on top of reforecast-derived spend (included categories only). */
export const RETIRE_SPEND_EXTRA_KEY = 'retire_spend_extra';

/** Manual annual retirement spend when no reforecast snapshot exists for the year. */
export const RETIRE_LEGACY_SPEND_KEY = 'retire_spend';

/** Display labels for each pinned key — used by the form. */
export const RETIRE_KEY_LABELS: Record<PinnedRetireKey, string> = {
  jeff_yearly_contrib: 'Jeff yearly contribution',
  brit_yearly_contrib: 'Brit yearly contribution',
  return_rate: 'Return rate',
  jeff_ss: 'Jeff SS (annual)',
  brit_ss: 'Brit SS (annual)',
  jeff_retire_age: 'Jeff retire age',
  brit_retire_age: 'Brit retire age',
  jeff_birth_year: 'Jeff birth year',
  brit_birth_year: 'Brit birth year',
  retire_tax_rate: 'Retirement tax rate',
};

/** What "kind" of value a key holds — drives parse + display formatting. */
export type RetireValueKind = 'rate' | 'dollars' | 'age' | 'year';

export const RETIRE_KEY_KINDS: Record<PinnedRetireKey, RetireValueKind> = {
  jeff_yearly_contrib: 'dollars',
  brit_yearly_contrib: 'dollars',
  return_rate: 'rate',
  jeff_ss: 'dollars',
  brit_ss: 'dollars',
  jeff_retire_age: 'age',
  brit_retire_age: 'age',
  jeff_birth_year: 'year',
  brit_birth_year: 'year',
  retire_tax_rate: 'rate',
};

/** Default values used when a pinned key has no row yet. Lets the projection
 *  render usefully on a brand-new household before any inputs are entered. */
export const RETIRE_DEFAULTS: Record<PinnedRetireKey, number> = {
  jeff_yearly_contrib: 30000,
  brit_yearly_contrib: 30000,
  return_rate: 0.078,
  jeff_ss: 0,
  brit_ss: 0,
  jeff_retire_age: 65,
  brit_retire_age: 65,
  jeff_birth_year: 1987,
  brit_birth_year: 1988,
  retire_tax_rate: 0.28,
};

/** Used when no `retire_spend` row exists and no reforecast drives spend. */
export const RETIRE_SPEND_MANUAL_DEFAULT = 100_000;

/** Keys that are shared across all scenarios (starting balance). These are
 *  stored with scenario_id = NULL and returned regardless of which scenario
 *  is active. */
export const SHARED_RETIRE_KEYS = new Set([
  RETIRE_LEGACY_STARTING_BALANCE_KEY,
  RETIRE_START_BS_ITEM_IDS_KEY,
  RETIRE_START_EXTRA_KEY,
]);

// ----------------------------------------------------------------------------
// Scenarios
// ----------------------------------------------------------------------------

export interface RetireScenario {
  id: string;
  household_id: string;
  name: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export async function fetchRetireScenarios(
  household_id: string,
): Promise<RetireScenario[]> {
  const { data, error } = await supabase
    .from('tf_retire_scenarios')
    .select('id, household_id, name, is_default, sort_order, created_at')
    .eq('household_id', household_id)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

/** Ensure a default scenario exists for the household. Returns it. */
export async function ensureDefaultScenario(
  household_id: string,
): Promise<RetireScenario> {
  const existing = await fetchRetireScenarios(household_id);
  const def = existing.find((s) => s.is_default);
  if (def) return def;
  const { data, error } = await supabase
    .from('tf_retire_scenarios')
    .insert({ household_id, name: 'Main Scenario', is_default: true, sort_order: 0 })
    .select()
    .single();
  if (error) throw error;
  return data as RetireScenario;
}

export async function createRetireScenario(args: {
  household_id: string;
  name: string;
  clone_from_scenario_id?: string;
}): Promise<RetireScenario> {
  const scenarios = await fetchRetireScenarios(args.household_id);
  const nextOrder = scenarios.length > 0
    ? Math.max(...scenarios.map((s) => s.sort_order)) + 1
    : 1;

  const { data: newScenario, error } = await supabase
    .from('tf_retire_scenarios')
    .insert({
      household_id: args.household_id,
      name: args.name,
      is_default: false,
      sort_order: nextOrder,
    })
    .select()
    .single();
  if (error) throw error;

  if (args.clone_from_scenario_id) {
    const { data: sourceRows, error: fetchErr } = await supabase
      .from('tf_retire_inputs')
      .select('key, value')
      .eq('scenario_id', args.clone_from_scenario_id);
    if (fetchErr) throw fetchErr;
    if (sourceRows && sourceRows.length > 0) {
      const cloned = sourceRows.map((r) => ({
        household_id: args.household_id,
        key: r.key,
        value: r.value,
        scenario_id: (newScenario as RetireScenario).id,
      }));
      const { error: insertErr } = await supabase
        .from('tf_retire_inputs')
        .insert(cloned);
      if (insertErr) throw insertErr;
    }
  }

  return newScenario as RetireScenario;
}

export async function updateRetireScenario(args: {
  id: string;
  name: string;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_retire_scenarios')
    .update({ name: args.name })
    .eq('id', args.id);
  if (error) throw error;
}

export async function deleteRetireScenario(id: string): Promise<void> {
  const { error } = await supabase
    .from('tf_retire_scenarios')
    .delete()
    .eq('id', id)
    .eq('is_default', false);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------------------

export interface RetireInputRow {
  id: string;
  key: string;
  /** Parsed numeric value. The DB stores this as text, but every key the
   *  Phase 7 page cares about is numeric, so we parse on read. Returns NaN
   *  for non-numeric stored values (caller decides what to do). */
  value: number;
  /** Original text as stored — useful if a future migration adds non-numeric
   *  keys (e.g. notes). */
  rawValue: string;
}

/**
 * Fetch inputs for a specific scenario. Returns the scenario's own inputs
 * merged with shared (scenario_id NULL) inputs. If no scenario_id is given,
 * returns all rows for the household (backward-compatible).
 */
export async function fetchRetireInputs(
  household_id: string,
  scenario_id?: string,
): Promise<RetireInputRow[]> {
  if (!scenario_id) {
    const { data, error } = await supabase
      .from('tf_retire_inputs')
      .select('id, key, value, scenario_id')
      .eq('household_id', household_id);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      key: r.key,
      value: Number(r.value),
      rawValue: r.value,
    }));
  }
  const { data, error } = await supabase
    .from('tf_retire_inputs')
    .select('id, key, value, scenario_id')
    .eq('household_id', household_id)
    .or(`scenario_id.eq.${scenario_id},scenario_id.is.null`);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    value: Number(r.value),
    rawValue: r.value,
  }));
}

export async function upsertRetireInput(args: {
  household_id: string;
  key: string;
  value: number | null;
  scenario_id?: string | null;
}): Promise<void> {
  const scenarioId = SHARED_RETIRE_KEYS.has(args.key) ? null : (args.scenario_id ?? null);
  if (args.value == null || !Number.isFinite(args.value)) {
    await deleteRetireInput({ household_id: args.household_id, key: args.key, scenario_id: scenarioId });
    return;
  }
  if (scenarioId) {
    const { data: existing } = await supabase
      .from('tf_retire_inputs')
      .select('id')
      .eq('scenario_id', scenarioId)
      .eq('key', args.key)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('tf_retire_inputs')
        .update({ value: String(args.value) })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('tf_retire_inputs')
        .insert({
          household_id: args.household_id,
          key: args.key,
          value: String(args.value),
          scenario_id: scenarioId,
        });
      if (error) throw error;
    }
  } else {
    const { data: existing } = await supabase
      .from('tf_retire_inputs')
      .select('id')
      .eq('household_id', args.household_id)
      .eq('key', args.key)
      .is('scenario_id', null)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('tf_retire_inputs')
        .update({ value: String(args.value) })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('tf_retire_inputs')
        .insert({
          household_id: args.household_id,
          key: args.key,
          value: String(args.value),
          scenario_id: null,
        });
      if (error) throw error;
    }
  }
}

/** Store a non-numeric retire input (e.g. JSON array of balance-sheet item ids). */
export async function upsertRetireInputText(args: {
  household_id: string;
  key: string;
  text: string;
  scenario_id?: string | null;
}): Promise<void> {
  const scenarioId = SHARED_RETIRE_KEYS.has(args.key) ? null : (args.scenario_id ?? null);
  if (scenarioId) {
    const { data: existing } = await supabase
      .from('tf_retire_inputs')
      .select('id')
      .eq('scenario_id', scenarioId)
      .eq('key', args.key)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('tf_retire_inputs')
        .update({ value: args.text })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('tf_retire_inputs')
        .insert({
          household_id: args.household_id,
          key: args.key,
          value: args.text,
          scenario_id: scenarioId,
        });
      if (error) throw error;
    }
  } else {
    const { data: existing } = await supabase
      .from('tf_retire_inputs')
      .select('id')
      .eq('household_id', args.household_id)
      .eq('key', args.key)
      .is('scenario_id', null)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('tf_retire_inputs')
        .update({ value: args.text })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('tf_retire_inputs')
        .insert({
          household_id: args.household_id,
          key: args.key,
          value: args.text,
          scenario_id: null,
        });
      if (error) throw error;
    }
  }
}

export async function deleteRetireInput(args: {
  household_id: string;
  key: string;
  scenario_id?: string | null;
}): Promise<void> {
  const scenarioId = SHARED_RETIRE_KEYS.has(args.key) ? null : (args.scenario_id ?? null);
  let query = supabase
    .from('tf_retire_inputs')
    .delete()
    .eq('household_id', args.household_id)
    .eq('key', args.key);
  if (scenarioId) {
    query = query.eq('scenario_id', scenarioId);
  } else {
    query = query.is('scenario_id', null);
  }
  const { error } = await query;
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Convenience: get a fully-resolved input set (defaults filled in)
// ----------------------------------------------------------------------------

/**
 * Build a Record<PinnedRetireKey, number> with stored values where present
 * and RETIRE_DEFAULTS otherwise. The page passes this directly to the
 * projection function so a brand-new household can still see a sample chart.
 */
export function resolvePinnedInputs(
  rows: RetireInputRow[],
): Record<PinnedRetireKey, number> {
  const stored = new Map<string, number>();
  for (const r of rows) {
    if (Number.isFinite(r.value)) stored.set(r.key, r.value);
  }
  const out = { ...RETIRE_DEFAULTS };
  for (const k of PINNED_RETIRE_KEYS) {
    const v = stored.get(k);
    if (v != null) (out as Record<string, number>)[k] = v;
  }
  return out;
}
