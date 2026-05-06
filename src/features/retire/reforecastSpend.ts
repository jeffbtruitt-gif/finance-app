import type { RetireInputRow } from '@/api/retire';
import {
  RETIRE_LEGACY_SPEND_KEY,
  RETIRE_SPEND_EXCLUDED_CATEGORY_IDS_KEY,
  RETIRE_SPEND_EXTRA_KEY,
  RETIRE_SPEND_MANUAL_DEFAULT,
} from '@/api/retire';
import type { ReportCategory } from '@/api/reports';
import type { RevisedBudgetRow } from '@/api/reforecast';

/** Sum revised amounts per category across all rows in the snapshot (full-year total per cat). */
export function aggregateReforecastAnnualByCategory(
  rows: RevisedBudgetRow[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.category_id, (m.get(r.category_id) ?? 0) + r.amount);
  }
  return m;
}

export function parseRetireSpendExcludedIds(rows: RetireInputRow[]): Set<string> {
  const r = rows.find((x) => x.key === RETIRE_SPEND_EXCLUDED_CATEGORY_IDS_KEY);
  if (!r) return new Set();
  try {
    const j = JSON.parse(r.rawValue.trim() || '[]') as unknown;
    if (!Array.isArray(j)) return new Set();
    return new Set(j.filter((x): x is string => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

export function readLegacyRetireSpendAnnual(rows: RetireInputRow[]): number {
  const r = rows.find((x) => x.key === RETIRE_LEGACY_SPEND_KEY);
  if (r && Number.isFinite(r.value)) return r.value;
  return RETIRE_SPEND_MANUAL_DEFAULT;
}

/** Extra annual dollars on top of reforecast included-category total (can be negative). */
export function readRetireSpendExtraAnnual(rows: RetireInputRow[]): number {
  const r = rows.find((x) => x.key === RETIRE_SPEND_EXTRA_KEY);
  if (!r || !Number.isFinite(r.value)) return 0;
  return r.value;
}

/**
 * Annual dollars used as `retire_spend` in the projection:
 * - If `reforecastLatestRows` is non-empty: sum per spend category from the
 *   latest snapshot, skipping categories in the excluded set, plus
 *   `retire_spend_extra` when set.
 * - Else: legacy `retire_spend` row or `RETIRE_SPEND_MANUAL_DEFAULT`.
 */
export function resolveRetireAnnualSpend(
  retireRows: RetireInputRow[],
  reforecastLatestRows: RevisedBudgetRow[],
  spendCategories: ReportCategory[],
): number {
  if (reforecastLatestRows.length === 0) {
    return readLegacyRetireSpendAnnual(retireRows);
  }
  const excluded = parseRetireSpendExcludedIds(retireRows);
  const byCat = aggregateReforecastAnnualByCategory(reforecastLatestRows);
  let total = 0;
  for (const c of spendCategories) {
    if (excluded.has(c.id)) continue;
    total += byCat.get(c.id) ?? 0;
  }
  return total + readRetireSpendExtraAnnual(retireRows);
}

/** Full reforecast annual total across spend categories (ignores exclusions). */
export function reforecastSpendGrandTotal(
  spendCategories: ReportCategory[],
  annualByCategory: Map<string, number>,
): number {
  let t = 0;
  for (const c of spendCategories) {
    t += annualByCategory.get(c.id) ?? 0;
  }
  return t;
}
