import type { Period } from '@/lib/period';
import {
  effectiveValuesAt,
  periodToBsMonth,
  type BsItem,
  type BsValue,
} from './effective';

export function equityGroupLabel(equity_group: string | null): string {
  const t = equity_group?.trim();
  return t ? t : 'Unassigned';
}

export type BalanceSheetLine = {
  id: string;
  name: string;
  groupLabel: string;
  sort_order: number;
  /** Null when no value entered on or before the as-of month. */
  value: number | null;
};

export type EquityByGroupLine = {
  groupLabel: string;
  assets: number;
  liabilities: number;
  /** assets − liabilities for this group */
  net: number;
};

function compareLines(a: BalanceSheetLine, b: BalanceSheetLine): number {
  const g = a.groupLabel.localeCompare(b.groupLabel, undefined, { sensitivity: 'base' });
  if (g !== 0) {
    if (a.groupLabel === 'Unassigned') return 1;
    if (b.groupLabel === 'Unassigned') return -1;
    return g;
  }
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Read-only balance sheet layout for reports: every active asset/liability line,
 * effective values at `asOf`, and equity (net) rolled up by `equity_group`.
 */
export function buildBalanceSheetReport(args: {
  items: BsItem[];
  values: BsValue[];
  asOf: Period;
}): {
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equityByGroup: EquityByGroupLine[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
} {
  const targetIso = periodToBsMonth(args.asOf);
  const effective = effectiveValuesAt(args.values, targetIso);

  const active = args.items.filter((i) => i.is_active);
  const assets: BalanceSheetLine[] = [];
  const liabilities: BalanceSheetLine[] = [];

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const it of active) {
    const v = effective.get(it.id) ?? null;
    const line: BalanceSheetLine = {
      id: it.id,
      name: it.name,
      groupLabel: equityGroupLabel(it.equity_group),
      sort_order: it.sort_order,
      value: v,
    };
    if (it.type === 'asset') {
      assets.push(line);
      if (v != null) totalAssets += v;
    } else {
      liabilities.push(line);
      if (v != null) totalLiabilities += v;
    }
  }

  assets.sort(compareLines);
  liabilities.sort(compareLines);

  const groupMap = new Map<string, { assets: number; liabilities: number }>();
  for (const it of active) {
    const g = equityGroupLabel(it.equity_group);
    if (!groupMap.has(g)) groupMap.set(g, { assets: 0, liabilities: 0 });
  }

  for (const it of active) {
    const v = effective.get(it.id);
    if (v == null) continue;
    const g = equityGroupLabel(it.equity_group);
    const row = groupMap.get(g);
    if (!row) continue;
    if (it.type === 'asset') row.assets += v;
    else row.liabilities += v;
  }

  const equityByGroup: EquityByGroupLine[] = Array.from(groupMap.entries()).map(
    ([groupLabel, { assets: a, liabilities: l }]) => ({
      groupLabel,
      assets: a,
      liabilities: l,
      net: a - l,
    }),
  );

  equityByGroup.sort((a, b) => {
    if (a.groupLabel === 'Unassigned') return 1;
    if (b.groupLabel === 'Unassigned') return -1;
    return a.groupLabel.localeCompare(b.groupLabel, undefined, { sensitivity: 'base' });
  });

  return {
    assets,
    liabilities,
    equityByGroup,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}
