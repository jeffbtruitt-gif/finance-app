import type { RetireInputRow } from '@/api/retire';
import {
  RETIRE_LEGACY_STARTING_BALANCE_KEY,
  RETIRE_START_BS_ITEM_IDS_KEY,
  RETIRE_START_EXTRA_KEY,
} from '@/api/retire';
import type { BsItem } from '@/features/balance-sheet/effective';

export function parseRetireStartBsItemIds(rows: RetireInputRow[]): string[] {
  const r = rows.find((x) => x.key === RETIRE_START_BS_ITEM_IDS_KEY);
  if (!r) return [];
  try {
    const j = JSON.parse(r.rawValue.trim() || '[]') as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

/** True when the household has opted into BS + extra composition (even if ids are []). */
export function hasRetireStartComposition(rows: { key: string }[]): boolean {
  return rows.some(
    (x) => x.key === RETIRE_START_BS_ITEM_IDS_KEY || x.key === RETIRE_START_EXTRA_KEY,
  );
}

/**
 * Dollars used as the retirement projection starting balance:
 * - If composition keys exist: sum of effective values for selected **active asset**
 *   line items at `effective` map, plus `retire_start_extra`.
 * - Otherwise: legacy `starting_balance` row if present, else 0.
 */
export function resolveRetireStartingBalance(
  rows: RetireInputRow[],
  effective: Map<string, number>,
  items: BsItem[],
): number {
  if (!hasRetireStartComposition(rows)) {
    const leg = rows.find((r) => r.key === RETIRE_LEGACY_STARTING_BALANCE_KEY);
    if (leg && Number.isFinite(leg.value)) return leg.value;
    return 0;
  }
  const ids = parseRetireStartBsItemIds(rows);
  const extraRow = rows.find((r) => r.key === RETIRE_START_EXTRA_KEY);
  const extra = extraRow && Number.isFinite(extraRow.value) ? extraRow.value : 0;
  const byId = new Map(items.map((i) => [i.id, i]));
  let fromBs = 0;
  for (const id of ids) {
    const it = byId.get(id);
    if (!it?.is_active || it.type !== 'asset') continue;
    const v = effective.get(id);
    if (v != null) fromBs += v;
  }
  return fromBs + extra;
}

export function sumEffectiveForBsItemIds(
  ids: string[],
  effective: Map<string, number>,
  items: BsItem[],
): number {
  const byId = new Map(items.map((i) => [i.id, i]));
  let s = 0;
  for (const id of ids) {
    const it = byId.get(id);
    if (!it?.is_active || it.type !== 'asset') continue;
    const v = effective.get(id);
    if (v != null) s += v;
  }
  return s;
}
