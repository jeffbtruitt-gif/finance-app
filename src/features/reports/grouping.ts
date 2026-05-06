/**
 * Report grouping — applies the spreadsheet's group order and totals.
 *
 * Per master plan + Phase 3 decisions:
 *   - 1 MO and YTD reports show SPEND ONLY: Rent & House Maintenance, Food & Car,
 *     Other, Yearly. Income / Savings / Transfer are excluded from the
 *     "spend total" view; they live on a different page (future phase).
 *   - Group order is fixed (matches the spreadsheet's visual layout).
 *   - Each group has a subtotal row; the report has a grand total at the bottom.
 *   - "Uncategorized" gets a synthetic group at the end so it can't hide.
 */

import type { ReportCategory, ActualLookup, BudgetLookup } from '@/api/reports';
import type { Period } from '@/lib/period';
import { periodKey } from '@/lib/period';

export const SPEND_GROUP_ORDER = [
  'Rent & House Maintenance',
  'Food & Car',
  'Other',
  'Yearly',
] as const;

export type SpendGroup = (typeof SPEND_GROUP_ORDER)[number];

export const NON_SPEND_GROUPS = new Set(['Income', 'Savings', 'Transfer']);

/**
 * Spec / UI alias for the first spend section — same bucket as
 * "Rent & House Maintenance" in rollups and reports.
 */
export const RENT_UTILITIES_GROUP_ALIAS = 'Rent & Utilities';

/**
 * Map a category's `group_name` to the canonical spend section used in
 * `SPEND_GROUP_ORDER`, or null if the category is not part of spend reports.
 * Treats `Rent & Utilities` as equivalent to `Rent & House Maintenance`.
 */
/** Categories in the Yearly spend section, sorted for stable charts/reports. */
export function yearlySpendCategoriesOnly(categories: ReportCategory[]): ReportCategory[] {
  return categories
    .filter((c) => canonicalSpendGroup(c.group_name) === 'Yearly')
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function canonicalSpendGroup(
  groupName: string | null | undefined,
): SpendGroup | null {
  if (!groupName) return null;
  if (NON_SPEND_GROUPS.has(groupName)) return null;
  if (groupName === RENT_UTILITIES_GROUP_ALIAS) return 'Rent & House Maintenance';
  if (SPEND_GROUP_ORDER.includes(groupName as SpendGroup)) {
    return groupName as SpendGroup;
  }
  return null;
}

export interface GroupedRow {
  category: ReportCategory;
  /** Sum of actuals across the supplied periods, raw (storage-sign). */
  actual: number;
  /** Sum of budgets across the supplied periods. */
  budget: number;
  /** Optional second actual column — used by YTD report for prior-year comparison. */
  actualB?: number;
}

export interface GroupedSection {
  /** Spend rollup section; `Uncategorized` is appended when those rows exist. */
  group: SpendGroup | 'Uncategorized';
  rows: GroupedRow[];
  actualTotal: number;
  budgetTotal: number;
  actualBTotal?: number;
}

export interface GroupedReport {
  sections: GroupedSection[];
  /** Grand total across all spend sections (excludes Uncategorized for now;
   *  uncategorized is shown separately so user notices it but it doesn't
   *  silently inflate the spend totals). */
  grandActual: number;
  grandBudget: number;
  grandActualB?: number;
  /** Set when the report was asked for two periods (e.g. YTD vs PY). */
  hasComparison: boolean;
}

/**
 * Build a grouped report from raw inputs.
 *
 * @param categories  Full category list for the scheme (we'll filter to spend).
 * @param periods     Periods to sum across (one for 1 MO; many for YTD/avgs).
 * @param actuals     Lookup of (category_id, periodKey) → total.
 * @param budgets     Lookup of (category_id, periodKey) → amount.
 * @param actualsB    Optional second actuals lookup (e.g. prior year YTD).
 * @param periodsB    Optional second period set (matched 1:1 with actualsB).
 */
export function buildSpendReport(args: {
  categories: ReportCategory[];
  periods: Period[];
  actuals: ActualLookup;
  budgets: BudgetLookup;
  actualsB?: ActualLookup;
  periodsB?: Period[];
}): GroupedReport {
  const { categories, periods, actuals, budgets, actualsB, periodsB } = args;
  const hasComparison = !!actualsB && !!periodsB;

  // Filter to spend categories only and bucket by canonical group.
  const spendCats = categories.filter(
    c => canonicalSpendGroup(c.group_name) !== null,
  );

  const byGroup = new Map<SpendGroup, ReportCategory[]>();
  for (const g of SPEND_GROUP_ORDER) byGroup.set(g, []);
  for (const c of spendCats) {
    const g = canonicalSpendGroup(c.group_name)!;
    byGroup.get(g)!.push(c);
  }
  // sort_order is already applied by the API; preserve insertion order.

  const sections: GroupedSection[] = [];
  let grandActual = 0;
  let grandBudget = 0;
  let grandActualB = 0;

  for (const group of SPEND_GROUP_ORDER) {
    const cats = byGroup.get(group) ?? [];
    if (cats.length === 0) continue;

    const rows: GroupedRow[] = [];
    let aTot = 0;
    let bTot = 0;
    let aBTot = 0;

    for (const c of cats) {
      let actual = 0;
      let budget = 0;
      for (const p of periods) {
        const k = `${c.id}|${periodKey(p)}`;
        actual += actuals.get(k) ?? 0;
        budget += budgets.get(k) ?? 0;
      }
      let actualB: number | undefined;
      if (hasComparison) {
        actualB = 0;
        for (const p of periodsB!) {
          const k = `${c.id}|${periodKey(p)}`;
          actualB += actualsB!.get(k) ?? 0;
        }
        aBTot += actualB;
      }
      rows.push({ category: c, actual, budget, actualB });
      aTot += actual;
      bTot += budget;
    }

    sections.push({
      group,
      rows,
      actualTotal: aTot,
      budgetTotal: bTot,
      actualBTotal: hasComparison ? aBTot : undefined,
    });
    grandActual += aTot;
    grandBudget += bTot;
    grandActualB += aBTot;
  }

  return {
    sections,
    grandActual,
    grandBudget,
    grandActualB: hasComparison ? grandActualB : undefined,
    hasComparison,
  };
}
