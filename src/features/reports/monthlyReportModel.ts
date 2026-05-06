/**
 * Unified Monthly Report — shapes API data into dashboard / table / treemap / detail.
 */

import type { ReportCategory, ActualLookup, BudgetLookup } from '@/api/reports';
import type { Period } from '@/lib/period';
import { comparePeriod, currentPeriod, formatPeriod, fullYear, periodKey, shiftPeriod, ytdPeriods } from '@/lib/period';
import { buildSpendReport, canonicalSpendGroup } from '@/features/reports/grouping';
import type { GroupedSection } from '@/features/reports/grouping';
import { categoryColorHex } from '@/components/ds/CategoryChip';

export type DrillArgs =
  | { type: 'category'; id: string; name: string }
  | { type: 'group'; name: string };

export interface ReportMonthItem {
  id: string;
  name: string;
  actual: number;
  budget: number;
  color: string;
}

export interface ReportMonthGroup {
  /** Uppercase display label (e.g. RENT & UTILITIES). */
  name: string;
  /** Canonical group for filters / drill (e.g. Food & Car, Yearly). */
  drillKey: string;
  items: ReportMonthItem[];
}

export interface TrendMonthPoint {
  month: string;
  /** YYYY-MM */
  key: string;
  actual: number;
  budget: number;
}

function itemColor(c: ReportCategory): string {
  const o = c.color_override?.trim();
  if (o && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(o)) return o;
  return categoryColorHex(c.name);
}

/** Monthly spend subtotal (excludes Yearly group — different cadence). */
export function monthlySpendTotals(args: {
  categories: ReportCategory[];
  period: Period;
  actuals: ActualLookup;
  budgets: BudgetLookup;
}): { actual: number; budget: number } {
  const rep = buildSpendReport({
    categories: args.categories,
    periods: [args.period],
    actuals: args.actuals,
    budgets: args.budgets,
  });
  let a = 0;
  let b = 0;
  for (const s of rep.sections) {
    if (s.group === 'Yearly') continue;
    a += s.actualTotal;
    b += s.budgetTotal;
  }
  return { actual: a, budget: b };
}

export function buildYearlyReportRows(args: {
  categories: ReportCategory[];
  period: Period;
  actuals: ActualLookup;
  budgets: BudgetLookup;
}): ReportMonthItem[] {
  const { categories, period, actuals, budgets } = args;
  const ytd = ytdPeriods(period);
  const yearMonths = fullYear(period.year);
  const out: ReportMonthItem[] = [];
  const yearlyCats = categories.filter((c) => canonicalSpendGroup(c.group_name) === 'Yearly');
  for (const c of yearlyCats) {
    let ytdActual = 0;
    for (const p of ytd) {
      ytdActual += actuals.get(`${c.id}|${periodKey(p)}`) ?? 0;
    }
    let annualBudget = 0;
    for (const p of yearMonths) {
      annualBudget += budgets.get(`${c.id}|${periodKey(p)}`) ?? 0;
    }
    out.push({
      id: c.id,
      name: c.name,
      actual: ytdActual,
      budget: annualBudget,
      color: itemColor(c),
    });
  }
  return out;
}

export function buildMonthlyReportGroups(args: {
  categories: ReportCategory[];
  period: Period;
  actuals: ActualLookup;
  budgets: BudgetLookup;
}): ReportMonthGroup[] {
  const rep = buildSpendReport({
    categories: args.categories,
    periods: [args.period],
    actuals: args.actuals,
    budgets: args.budgets,
  });
  const groups: ReportMonthGroup[] = [];
  for (const s of rep.sections) {
    if (s.group === 'Yearly') continue;
    groups.push({
      name: spendGroupLabel(s.group),
      drillKey: s.group === 'Uncategorized' ? 'Uncategorized' : s.group,
      items: s.rows.map((r) => ({
        id: r.category.id,
        name: r.category.name,
        actual: r.actual,
        budget: r.budget,
        color: itemColor(r.category),
      })),
    });
  }
  return groups;
}

function spendGroupLabel(g: GroupedSection['group']): string {
  if (g === 'Uncategorized') return 'UNCATEGORIZED';
  if (g === 'Rent & House Maintenance') return 'RENT & UTILITIES';
  return g.toUpperCase();
}

export function buildTrendTotals(args: {
  categories: ReportCategory[];
  anchor: Period;
  actuals: ActualLookup;
  budgets: BudgetLookup;
}): TrendMonthPoint[] {
  const { categories, anchor, actuals, budgets } = args;
  const out: TrendMonthPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const p = shiftPeriod(anchor, -i);
    const t = monthlySpendTotals({ categories, period: p, actuals, budgets });
    out.push({
      month: formatPeriod(p, 'short'),
      key: periodKey(p),
      actual: t.actual,
      budget: t.budget,
    });
  }
  return out;
}

export interface MoverRow {
  id: string;
  name: string;
  delta: number;
  color: string;
}

export function topMovers(args: {
  groups: ReportMonthGroup[];
  limit: number;
}): { up: MoverRow[]; down: MoverRow[] } {
  const flat: Array<{ id: string; name: string; delta: number; color: string }> = [];
  for (const g of args.groups) {
    for (const it of g.items) {
      if (it.budget <= 0) continue;
      flat.push({
        id: it.id,
        name: it.name,
        delta: it.actual - it.budget,
        color: it.color,
      });
    }
  }
  const over = [...flat].filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, args.limit);
  const under = [...flat]
    .filter((x) => x.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, args.limit);
  return { up: over, down: under };
}

export function budgetHealthCounts(groups: ReportMonthGroup[]): {
  under: number;
  on: number;
  over: number;
} {
  let under = 0;
  let on = 0;
  let over = 0;
  for (const g of groups) {
    for (const it of g.items) {
      if (it.budget <= 0 && it.actual <= 0) continue;
      if (it.budget <= 0) {
        if (it.actual > 0) over++;
        continue;
      }
      const d = it.actual - it.budget;
      if (d < 0) under++;
      else if (d > 0) over++;
      else on++;
    }
  }
  return { under, on, over };
}

export function isFuturePeriod(p: Period): boolean {
  return comparePeriod(p, currentPeriod()) > 0;
}
