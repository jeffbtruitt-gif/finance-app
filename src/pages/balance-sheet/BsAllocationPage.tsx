/**
 * BS Allocation page — asset class split per balance-sheet account.
 *
 * Two tabs:
 *   1. Allocations — per-account percentage inputs for US Stocks, Int'l Stocks,
 *      Fixed Income, Real Estate, Cash. User picks which accounts to allocate.
 *      Shows calculated dollar amounts based on effective balance.
 *   2. Summary — portfolio-wide allocation across all allocated accounts with
 *      a doughnut chart and totals table.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { fetchBalanceSheetItems, fetchBalanceSheetValues } from '@/api/balanceSheet';
import {
  fetchAllocations,
  upsertAllocation,
  deleteAllocationsForItem,
  ALLOCATION_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type AllocationCategory,
  type BsAllocation,
} from '@/api/bsAllocations';
import { effectiveValuesAt, periodToBsMonth, type BsItem } from '@/features/balance-sheet/effective';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { fmtUsd } from '@/lib/money';
import { formatPeriod } from '@/lib/period';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { maskUsd } from '@/lib/privacyMoney';
import { StatusPanel } from '@/components/StatusPanel';
import { Button, Card, RT } from '@/components/ds';

type Tab = 'allocations' | 'summary';

export function BsAllocationPage() {
  const household = useHousehold();
  const qc = useQueryClient();
  const { period } = useAppPeriod();
  const [activeTab, setActiveTab] = useState<Tab>('allocations');

  const itemsQ = useQuery({
    queryKey: ['bs-items', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetItems(household!.id),
  });
  const valuesQ = useQuery({
    queryKey: ['bs-values', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetValues(household!.id),
  });
  const allocQ = useQuery({
    queryKey: ['bs-allocations', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchAllocations(household!.id),
  });

  const items = itemsQ.data ?? [];
  const values = valuesQ.data ?? [];
  const allocs = allocQ.data ?? [];

  const targetIso = useMemo(() => periodToBsMonth(period), [period]);
  const effective = useMemo(() => effectiveValuesAt(values, targetIso), [values, targetIso]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bs-allocations', household?.id] });

  const loading = itemsQ.isLoading || valuesQ.isLoading || allocQ.isLoading;
  const err = itemsQ.error ?? valuesQ.error ?? allocQ.error;

  if (err) {
    return (
      <StatusPanel kind="error" message="Couldn't load allocation data" detail={err instanceof Error ? err.message : undefined} />
    );
  }
  if (loading) {
    return <StatusPanel kind="loading" message="Loading allocations…" />;
  }

  const activeItems = items.filter((i) => i.is_active);
  const allocatedItemIds = new Set(allocs.map((a) => a.item_id));

  const tabs: { id: Tab; label: string }[] = [
    { id: 'allocations', label: 'Allocations' },
    { id: 'summary', label: 'Summary' },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Asset class allocation as of{' '}
        <span className="font-semibold text-navy-900">{formatPeriod(period)}</span>.
        Set percentage splits per account, then view the portfolio summary.
      </p>

      <div className="flex gap-1 border-b border-navy-100">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === t.id
                ? 'border-b-2 border-navy-600 text-navy-800'
                : 'text-gray-500 hover:text-navy-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'allocations' && (
        <AllocationsTab
          items={activeItems}
          allocs={allocs}
          effective={effective}
          allocatedItemIds={allocatedItemIds}
          onUpsert={async (item_id, category, percentage) => {
            if (!household) return;
            await upsertAllocation({ item_id, household_id: household.id, category, percentage });
            invalidate();
          }}
          onRemoveItem={async (item_id) => {
            await deleteAllocationsForItem(item_id);
            invalidate();
          }}
          onAddItem={async (item_id) => {
            if (!household) return;
            for (const cat of ALLOCATION_CATEGORIES) {
              await upsertAllocation({ item_id, household_id: household.id, category: cat, percentage: 0 });
            }
            invalidate();
          }}
        />
      )}

      {activeTab === 'summary' && (
        <SummaryTab
          items={activeItems}
          allocs={allocs}
          effective={effective}
          allocatedItemIds={allocatedItemIds}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allocations tab
// ---------------------------------------------------------------------------

function AllocationsTab({
  items,
  allocs,
  effective,
  allocatedItemIds,
  onUpsert,
  onRemoveItem,
  onAddItem,
}: {
  items: BsItem[];
  allocs: BsAllocation[];
  effective: Map<string, number>;
  allocatedItemIds: Set<string>;
  onUpsert: (item_id: string, category: AllocationCategory, percentage: number) => Promise<void>;
  onRemoveItem: (item_id: string) => Promise<void>;
  onAddItem: (item_id: string) => Promise<void>;
}) {
  const { hideIncomeAssets } = usePrivacyMode();
  const $ = (n: number) => maskUsd(hideIncomeAssets, n, true);

  const allocatedItems = items.filter((i) => allocatedItemIds.has(i.id));
  const unallocatedItems = items.filter((i) => !allocatedItemIds.has(i.id));

  const allocByItemCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocs) m.set(`${a.item_id}|${a.category}`, a.percentage);
    return m;
  }, [allocs]);

  return (
    <div className="space-y-6">
      {allocatedItems.length > 0 ? (
        <div className="space-y-6">
          {allocatedItems.map((it) => {
            const bal = effective.get(it.id) ?? 0;
            let totalPct = 0;
            for (const cat of ALLOCATION_CATEGORIES) {
              totalPct += allocByItemCat.get(`${it.id}|${cat}`) ?? 0;
            }
            const valid = Math.abs(totalPct - 100) < 0.01;

            return (
              <AccountAllocationCard
                key={it.id}
                item={it}
                balance={bal}
                allocByItemCat={allocByItemCat}
                totalPct={totalPct}
                valid={valid}
                $={$}
                onUpsert={onUpsert}
                onRemove={() => onRemoveItem(it.id)}
              />
            );
          })}
        </div>
      ) : (
        <Card>
          <p className="py-4 text-center text-sm text-gray-400">
            No accounts have allocations yet. Add an account below to get started.
          </p>
        </Card>
      )}

      {unallocatedItems.length > 0 && (
        <Card padded={false}>
          <div className="border-b border-navy-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-navy-800">Add Account to Allocation</h3>
          </div>
          <div className="divide-y divide-navy-100">
            {unallocatedItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <span className="text-sm font-medium text-navy-900">{it.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{it.type} · {it.equity_group || 'no group'}</span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => onAddItem(it.id)}>
                  + Add
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AccountAllocationCard({
  item,
  balance,
  allocByItemCat,
  totalPct,
  valid,
  $,
  onUpsert,
  onRemove,
}: {
  item: BsItem;
  balance: number;
  allocByItemCat: Map<string, number>;
  totalPct: number;
  valid: boolean;
  $: (n: number) => string;
  onUpsert: (item_id: string, category: AllocationCategory, percentage: number) => Promise<void>;
  onRemove: () => void;
}) {
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between border-b border-navy-100 px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold text-navy-900">{item.name}</span>
          <span className="text-sm tabular-nums text-gray-500">Balance: {$(balance)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm tabular-nums font-semibold ${valid ? 'text-green-600' : 'text-neg'}`}>
            {Number.isInteger(totalPct) ? totalPct.toFixed(0) : totalPct.toFixed(1)}% allocated
          </span>
          <button
            onClick={() => { if (confirm(`Remove allocation for "${item.name}"?`)) onRemove(); }}
            className="text-xs text-neg hover:underline"
          >
            Remove
          </button>
        </div>
      </div>
      <div className="grid grid-cols-5 divide-x divide-navy-100">
        {ALLOCATION_CATEGORIES.map((cat) => {
          const pct = allocByItemCat.get(`${item.id}|${cat}`) ?? 0;
          const amt = balance * (pct / 100);
          return (
            <div key={cat} className="flex flex-col items-center gap-1.5 px-3 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {CATEGORY_LABELS[cat]}
              </span>
              <PctInput value={pct} onCommit={(v) => onUpsert(item.id, cat, v)} />
              <span className="text-xs tabular-nums text-gray-400">
                {pct > 0 ? $(amt) : '\u00A0'}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PctInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [local, setLocal] = useState(value === 0 ? '' : String(value));

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => { if (value === 0) setLocal(''); }}
        onBlur={() => {
          const n = Number(local.replace(/[%\s]/g, ''));
          if (!Number.isFinite(n) || n < 0 || n > 100) {
            setLocal(value === 0 ? '' : String(value));
            return;
          }
          if (n !== value) onCommit(n);
          setLocal(n === 0 ? '' : String(n));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-14 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-center text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
        placeholder="0"
      />
      <span className="text-xs text-gray-400">%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary tab — portfolio-wide totals + doughnut chart
// ---------------------------------------------------------------------------

function SummaryTab({
  items,
  allocs,
  effective,
  allocatedItemIds,
}: {
  items: BsItem[];
  allocs: BsAllocation[];
  effective: Map<string, number>;
  allocatedItemIds: Set<string>;
}) {
  const { hideIncomeAssets } = usePrivacyMode();
  const $ = (n: number) => maskUsd(hideIncomeAssets, n, true);

  const totals = useMemo(() => {
    const out: Record<AllocationCategory, number> = {
      us_stocks: 0,
      intl_stocks: 0,
      fixed_income: 0,
      real_estate: 0,
      cash: 0,
    };
    for (const a of allocs) {
      const bal = effective.get(a.item_id) ?? 0;
      out[a.category] += bal * (a.percentage / 100);
    }
    return out;
  }, [allocs, effective]);

  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

  const allocatedTotal = useMemo(() => {
    let sum = 0;
    for (const item of items) {
      if (allocatedItemIds.has(item.id)) sum += effective.get(item.id) ?? 0;
    }
    return sum;
  }, [items, allocatedItemIds, effective]);

  const slices = ALLOCATION_CATEGORIES.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    color: CATEGORY_COLORS[cat],
    amount: totals[cat],
    pct: grandTotal > 0 ? (totals[cat] / grandTotal) * 100 : 0,
  })).filter((s) => s.amount > 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <div className="flex items-center justify-center py-4">
          <DoughnutChart slices={slices} size={260} />
        </div>
        {allocatedTotal > 0 && (
          <div className="border-t border-navy-100 px-4 py-3 text-center">
            <div className="text-xs font-medium uppercase text-gray-500">Allocated Total</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-navy-800">
              {hideIncomeAssets ? '•••••' : fmtUsd(allocatedTotal, { decimals: 0 })}
            </div>
          </div>
        )}
      </Card>

      <Card padded={false}>
        <table className={RT.table}>
          <thead className={RT.head}>
            <tr>
              <th className={`${RT.th} ${RT.thLeft}`}>Asset Class</th>
              <th className={`${RT.th} ${RT.thRight}`}>Amount</th>
              <th className={`${RT.th} ${RT.thRight}`}>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {ALLOCATION_CATEGORIES.map((cat) => {
              const pct = grandTotal > 0 ? (totals[cat] / grandTotal) * 100 : 0;
              return (
                <tr key={cat} className="border-t border-navy-100 hover:bg-navy-50/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                      />
                      <span className="font-medium text-navy-900">{CATEGORY_LABELS[cat]}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {$(totals[cat])}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {pct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
            <tr className={RT.subtotalRow}>
              <td className="px-3 py-2 font-semibold">Total</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{$(grandTotal)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">100%</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG Doughnut chart
// ---------------------------------------------------------------------------

function DoughnutChart({
  slices,
  size = 260,
}: {
  slices: { label: string; color: string; amount: number; pct: number }[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.58;
  const [hovered, setHovered] = useState<number | null>(null);

  if (slices.length === 0) {
    return (
      <div style={{ width: size, height: size }} className="flex items-center justify-center text-sm text-gray-400">
        No data
      </div>
    );
  }

  const total = slices.reduce((s, sl) => s + sl.amount, 0);
  let cumAngle = -Math.PI / 2;

  const paths = slices.map((sl, i) => {
    const angle = (sl.amount / total) * Math.PI * 2;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const largeArc = angle > Math.PI ? 1 : 0;
    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy + outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(endAngle);
    const y2o = cy + outerR * Math.sin(endAngle);
    const x1i = cx + innerR * Math.cos(endAngle);
    const y1i = cy + innerR * Math.sin(endAngle);
    const x2i = cx + innerR * Math.cos(startAngle);
    const y2i = cy + innerR * Math.sin(startAngle);

    const d = [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
      `L ${x1i} ${y1i}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
      'Z',
    ].join(' ');

    return (
      <path
        key={i}
        d={d}
        fill={sl.color}
        opacity={hovered === null || hovered === i ? 1 : 0.4}
        onMouseEnter={() => setHovered(i)}
        onMouseLeave={() => setHovered(null)}
        className="cursor-pointer transition-opacity duration-150"
      />
    );
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {paths}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {hovered !== null ? (
          <>
            <span className="text-xs font-medium text-gray-500">{slices[hovered].label}</span>
            <span className="text-lg font-bold tabular-nums text-navy-800">{slices[hovered].pct.toFixed(1)}%</span>
            <span className="text-xs tabular-nums text-gray-400">{fmtUsd(slices[hovered].amount, { decimals: 0 })}</span>
          </>
        ) : (
          <>
            <span className="text-xs font-medium text-gray-500">Total</span>
            <span className="text-lg font-bold tabular-nums text-navy-800">{fmtUsd(total, { decimals: 0 })}</span>
          </>
        )}
      </div>
    </div>
  );
}
