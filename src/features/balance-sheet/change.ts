import type { Period } from '@/lib/period';
import { shiftPeriod } from '@/lib/period';
import {
  effectiveValuesAt,
  periodToBsMonth,
  type BsItem,
  type BsValue,
} from './effective';
import { equityGroupLabel } from './report';

export type BsChangeHorizon = '1mo' | 'ytd' | '1yr';

export function baselinePeriodForHorizon(asOf: Period, horizon: BsChangeHorizon): Period {
  switch (horizon) {
    case '1mo':
      return shiftPeriod(asOf, -1);
    case 'ytd':
      return { year: asOf.year, month: 1 };
    case '1yr':
      return shiftPeriod(asOf, -12);
  }
}

export type AccountChangeRow = {
  id: string;
  name: string;
  groupLabel: string;
  type: 'asset' | 'liability';
  sort_order: number;
  current: number | null;
  baseline: number | null;
  delta: number | null;
  pct: number | null;
};

export type EquityGroupChangeRow = {
  groupLabel: string;
  currentNet: number;
  baselineNet: number;
  delta: number;
  pct: number | null;
};

function compareAccountRows(a: AccountChangeRow, b: AccountChangeRow): number {
  const g = a.groupLabel.localeCompare(b.groupLabel, undefined, { sensitivity: 'base' });
  if (g !== 0) {
    if (a.groupLabel === 'Unassigned') return 1;
    if (b.groupLabel === 'Unassigned') return -1;
    return g;
  }
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function deltaAndPct(
  current: number | null,
  baseline: number | null,
): { delta: number | null; pct: number | null } {
  let delta: number | null = null;
  if (current != null && baseline != null) delta = current - baseline;
  else if (current != null && baseline == null) delta = current;
  else if (current == null && baseline != null) delta = -baseline;
  else delta = null;

  let pct: number | null = null;
  if (delta != null && baseline != null && baseline !== 0) {
    pct = (delta / Math.abs(baseline)) * 100;
  }
  return { delta, pct };
}

export function buildAccountChangeRows(args: {
  items: BsItem[];
  values: BsValue[];
  asOf: Period;
  horizon: BsChangeHorizon;
}): AccountChangeRow[] {
  const base = baselinePeriodForHorizon(args.asOf, args.horizon);
  const curIso = periodToBsMonth(args.asOf);
  const baseIso = periodToBsMonth(base);
  const curEff = effectiveValuesAt(args.values, curIso);
  const baseEff = effectiveValuesAt(args.values, baseIso);

  const rows: AccountChangeRow[] = [];
  for (const it of args.items) {
    if (!it.is_active) continue;
    if (it.type === 'off_balance_sheet') continue;
    const current = curEff.get(it.id) ?? null;
    const baseline = baseEff.get(it.id) ?? null;
    const { delta, pct } = deltaAndPct(current, baseline);
    rows.push({
      id: it.id,
      name: it.name,
      groupLabel: equityGroupLabel(it.equity_group),
      type: it.type,
      sort_order: it.sort_order,
      current,
      baseline,
      delta,
      pct,
    });
  }

  rows.sort(compareAccountRows);
  return rows;
}

export function buildEquityGroupChangeRows(
  accountRows: AccountChangeRow[],
): EquityGroupChangeRow[] {
  const byGroup = new Map<
    string,
    { curA: number; curL: number; baseA: number; baseL: number }
  >();

  for (const r of accountRows) {
    if (!byGroup.has(r.groupLabel)) {
      byGroup.set(r.groupLabel, { curA: 0, curL: 0, baseA: 0, baseL: 0 });
    }
    const g = byGroup.get(r.groupLabel)!;
    const isAsset = r.type === 'asset';
    if (r.current != null) {
      if (isAsset) g.curA += r.current;
      else g.curL += r.current;
    }
    if (r.baseline != null) {
      if (isAsset) g.baseA += r.baseline;
      else g.baseL += r.baseline;
    }
  }

  const out: EquityGroupChangeRow[] = [];
  for (const [groupLabel, { curA, curL, baseA, baseL }] of byGroup) {
    const currentNet = curA - curL;
    const baselineNet = baseA - baseL;
    const delta = currentNet - baselineNet;
    let pct: number | null = null;
    if (baselineNet !== 0) pct = (delta / Math.abs(baselineNet)) * 100;
    out.push({ groupLabel, currentNet, baselineNet, delta, pct });
  }

  out.sort((a, b) => {
    if (a.groupLabel === 'Unassigned') return 1;
    if (b.groupLabel === 'Unassigned') return -1;
    return a.groupLabel.localeCompare(b.groupLabel, undefined, { sensitivity: 'base' });
  });
  return out;
}
