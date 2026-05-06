/**
 * Perpetuate-forward effective-value logic for the balance sheet.
 *
 * Master-plan rule (Phase 5):
 *   "Input a value once, it carries until you update it."
 *
 * Concretely: the effective value of an item AT month M is the most recent
 *   tf_balance_sheet_values.value where as_of_month <= M.
 *
 * If the user enters a March value while there are existing May and August
 * values, the March entry only changes the effective values for March and
 * April (because May's row is still the most-recent-<=-target for May+). This
 * is exactly what the spreadsheet workflow does and what the master plan's
 * Phase 5 acceptance criteria call out (carry-forward only walks forward
 * until the next existing value).
 *
 * Implementation notes:
 *   - We do all of this client-side over the small per-household value set
 *     because (a) the table is tiny over a lifetime, (b) the dashboard wants
 *     a 24-month series in one go anyway, and (c) it keeps the database
 *     surface a simple table — no parameterised view / function.
 */

import { periodKey, type Period } from '@/lib/period';

export interface BsValue {
  id: string;
  item_id: string;
  as_of_month: string; // ISO 'YYYY-MM-01'
  value: number;
  notes: string | null;
}

/** Convert a Period to the canonical first-of-month ISO string. */
export function periodToBsMonth(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-01`;
}

/** Convert ISO 'YYYY-MM-01' to a Period. */
export function bsMonthToPeriod(iso: string): Period {
  const [y, m] = iso.split('-');
  return { year: Number(y), month: Number(m) };
}

/** True iff a <= b for ISO YYYY-MM-DD strings. Lexicographic == chronological for this format. */
function isoLte(a: string, b: string): boolean {
  return a <= b;
}

/**
 * Effective value for ONE item at a target month. Returns null if the item
 * has no values on or before the target — meaning "we don't know the value
 * yet, treat it as not contributing."
 */
export function effectiveValueAt(
  values: BsValue[],
  itemId: string,
  targetMonthIso: string,
): number | null {
  let best: BsValue | null = null;
  for (const v of values) {
    if (v.item_id !== itemId) continue;
    if (!isoLte(v.as_of_month, targetMonthIso)) continue;
    if (!best || best.as_of_month < v.as_of_month) best = v;
  }
  return best ? best.value : null;
}

/**
 * Effective values for a SET of items at one month. Keyed by item_id.
 * Items with no value yet don't appear in the map.
 */
export function effectiveValuesAt(
  values: BsValue[],
  targetMonthIso: string,
): Map<string, number> {
  // One pass: for each item, track best as_of_month <= target.
  const best = new Map<string, BsValue>();
  for (const v of values) {
    if (!isoLte(v.as_of_month, targetMonthIso)) continue;
    const cur = best.get(v.item_id);
    if (!cur || cur.as_of_month < v.as_of_month) best.set(v.item_id, v);
  }
  const out = new Map<string, number>();
  for (const [k, v] of best) out.set(k, v.value);
  return out;
}

export interface BsItem {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  sort_order: number;
  equity_group: string | null;
  is_active: boolean;
  /** Optional page (e.g. institution login) used to look up this balance — one per item. */
  value_source_url: string | null;
}

export interface NetWorthAtMonth {
  period: Period;
  iso: string;
  /** Sum of all asset items' effective values at this month. */
  assets: number;
  /** Sum of all liability items' effective values. */
  liabilities: number;
  /** assets - liabilities */
  net: number;
}

/**
 * Compute net worth for each of N consecutive months ending at `endMonth`.
 * Useful for the dashboard's 24-month net-worth chart.
 *
 * Months with no underlying data yet appear as a row with assets=0,
 * liabilities=0, net=0. The caller can choose to filter those out for the
 * chart, or render them as a flat baseline.
 */
export function netWorthSeries(args: {
  items: BsItem[];
  values: BsValue[];
  endMonth: Period;
  count: number;
}): NetWorthAtMonth[] {
  const { items, values, endMonth, count } = args;
  const out: NetWorthAtMonth[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = endMonth.year * 12 + (endMonth.month - 1) - i;
    const p: Period = { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    const iso = periodToBsMonth(p);
    const eff = effectiveValuesAt(values, iso);
    let assets = 0;
    let liabilities = 0;
    for (const it of items) {
      if (!it.is_active) continue;
      const v = eff.get(it.id);
      if (v == null) continue;
      if (it.type === 'asset') assets += v;
      else liabilities += v;
    }
    out.push({
      period: p,
      iso,
      assets,
      liabilities,
      net: assets - liabilities,
    });
  }
  return out;
}

/**
 * Pick out the actual value rows entered for one item, sorted ascending by
 * month. Used by the editor's value list UI.
 */
export function valuesForItem(values: BsValue[], itemId: string): BsValue[] {
  return values
    .filter((v) => v.item_id === itemId)
    .sort((a, b) => a.as_of_month.localeCompare(b.as_of_month));
}

/** Map (item_id, periodKey) → entered value (NOT effective). */
export function valuesByItemAndPeriod(values: BsValue[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) {
    const p = bsMonthToPeriod(v.as_of_month);
    m.set(`${v.item_id}|${periodKey(p)}`, v.value);
  }
  return m;
}
