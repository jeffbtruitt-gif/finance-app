/**
 * Retire API — Phase 7.
 *
 * Wraps tf_retire_inputs (key/value text pairs) for the Retirement page.
 *
 * Storage model:
 *   - One row per (household_id, key). Value is text and parsed by the page
 *     based on the pinned key's type. Storing text lets the same table hold
 *     rates ("0.078"), ages ("60"), and dollars ("180000") without a JSONB
 *     wrapper or three typed columns.
 *   - The page renders a pinned set of keys as a typed form. Anything else
 *     stored in the table appears in a "custom keys" area, same UX as the
 *     Tax block on the Assumptions page (Phase 6).
 *
 * Why pinned-keys-plus-custom: same reason as Phase 6's tax assumptions.
 * The spreadsheet's Retire tab has a fixed set of inputs (Jeff/Brit yearly
 * contrib, return rate, starting balance, two SS benefits, two retire ages,
 * retire spend, retire tax rate). Locking the schema would mean a migration
 * every time we want a new knob; leaving it free-form would lose the typed
 * validation the page wants. Pinning the known set in code while keeping the
 * table open gets us both.
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

export async function fetchRetireInputs(
  household_id: string,
): Promise<RetireInputRow[]> {
  const { data, error } = await supabase
    .from('tf_retire_inputs')
    .select('id, key, value')
    .eq('household_id', household_id);
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
}): Promise<void> {
  if (args.value == null || !Number.isFinite(args.value)) {
    await deleteRetireInput({ household_id: args.household_id, key: args.key });
    return;
  }
  const { error } = await supabase
    .from('tf_retire_inputs')
    .upsert(
      {
        household_id: args.household_id,
        key: args.key,
        value: String(args.value),
      },
      { onConflict: 'household_id,key' },
    );
  if (error) throw error;
}

/** Store a non-numeric retire input (e.g. JSON array of balance-sheet item ids). */
export async function upsertRetireInputText(args: {
  household_id: string;
  key: string;
  text: string;
}): Promise<void> {
  const { error } = await supabase.from('tf_retire_inputs').upsert(
    {
      household_id: args.household_id,
      key: args.key,
      value: args.text,
    },
    { onConflict: 'household_id,key' },
  );
  if (error) throw error;
}

export async function deleteRetireInput(args: {
  household_id: string;
  key: string;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_retire_inputs')
    .delete()
    .eq('household_id', args.household_id)
    .eq('key', args.key);
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
