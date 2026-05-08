/**
 * Performance page — monthly return rates per portfolio account.
 *
 * Two tabs:
 *   1. Accounts — pick which BS accounts to track returns for.
 *   2. Rates — budget-style grid to enter monthly return % per account.
 *      Selected period month is the first column, then previous months going left-to-right.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { fetchBalanceSheetItems } from '@/api/balanceSheet';
import {
  fetchPerfAccounts,
  addPerfAccount,
  removePerfAccount,
  fetchPerfRates,
  upsertPerfRate,
  type PerfAccount,
  type PerfRate,
} from '@/api/performance';
import { type BsItem } from '@/features/balance-sheet/effective';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { MONTH_NAMES_SHORT, shiftPeriod, periodKey, type Period } from '@/lib/period';
import { formatPeriod } from '@/lib/period';
import { StatusPanel } from '@/components/StatusPanel';
import { Button, Card } from '@/components/ds';

type Tab = 'accounts' | 'rates';
const NUM_MONTHS = 12;

export function PerformancePage() {
  const household = useHousehold();
  const qc = useQueryClient();
  const { period } = useAppPeriod();
  const [activeTab, setActiveTab] = useState<Tab>('accounts');

  const itemsQ = useQuery({
    queryKey: ['bs-items', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetItems(household!.id),
  });
  const perfAcctsQ = useQuery({
    queryKey: ['perf-accounts', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchPerfAccounts(household!.id),
  });
  const perfAccts = perfAcctsQ.data ?? [];
  const acctIds = useMemo(() => perfAccts.map((a) => a.id), [perfAccts]);

  const ratesQ = useQuery({
    queryKey: ['perf-rates', acctIds],
    enabled: acctIds.length > 0,
    queryFn: () => fetchPerfRates(acctIds),
  });

  const items = itemsQ.data ?? [];
  const rates = ratesQ.data ?? [];

  const loading = itemsQ.isLoading || perfAcctsQ.isLoading;
  const err = itemsQ.error ?? perfAcctsQ.error;

  const invalidateAccts = () => qc.invalidateQueries({ queryKey: ['perf-accounts', household?.id] });
  const invalidateRates = () => qc.invalidateQueries({ queryKey: ['perf-rates'] });

  if (err) {
    return <StatusPanel kind="error" message="Couldn't load performance data" detail={err instanceof Error ? err.message : undefined} />;
  }
  if (loading) {
    return <StatusPanel kind="loading" message="Loading performance…" />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'accounts', label: 'Accounts' },
    { id: 'rates', label: 'Rates' },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Track monthly return rates starting from{' '}
        <span className="font-semibold text-navy-900">{formatPeriod(period)}</span>{' '}
        going back {NUM_MONTHS} months.
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

      {activeTab === 'accounts' && (
        <AccountsTab
          items={items.filter((i) => i.is_active)}
          perfAccts={perfAccts}
          onAdd={async (item_id) => {
            if (!household) return;
            await addPerfAccount(household.id, item_id);
            invalidateAccts();
          }}
          onRemove={async (perfAcctId) => {
            await removePerfAccount(perfAcctId);
            invalidateAccts();
            invalidateRates();
          }}
        />
      )}

      {activeTab === 'rates' && (
        <RatesTab
          items={items}
          perfAccts={perfAccts}
          rates={rates}
          period={period}
          onSaveRate={async (accountId, month, rate) => {
            await upsertPerfRate(accountId, month, rate);
            invalidateRates();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts tab
// ---------------------------------------------------------------------------

function AccountsTab({
  items,
  perfAccts,
  onAdd,
  onRemove,
}: {
  items: BsItem[];
  perfAccts: PerfAccount[];
  onAdd: (item_id: string) => Promise<void>;
  onRemove: (perfAcctId: string) => Promise<void>;
}) {
  const trackedItemIds = new Set(perfAccts.map((a) => a.item_id));
  const trackedItems = perfAccts
    .map((a) => ({ perfAcct: a, item: items.find((i) => i.id === a.item_id) }))
    .filter((x) => x.item != null) as { perfAcct: PerfAccount; item: BsItem }[];
  const untrackedItems = items.filter((i) => !trackedItemIds.has(i.id));

  return (
    <div className="space-y-6">
      {trackedItems.length > 0 ? (
        <Card padded={false}>
          <div className="border-b border-navy-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-navy-800">Tracked Accounts</h3>
          </div>
          <div className="divide-y divide-navy-100">
            {trackedItems.map(({ perfAcct, item }) => (
              <div key={perfAcct.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium text-navy-900">{item.name}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {item.type} · {item.equity_group || 'no group'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Remove "${item.name}" from performance tracking? This will delete all entered rates for this account.`))
                      onRemove(perfAcct.id);
                  }}
                  className="text-xs text-neg hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="py-4 text-center text-sm text-gray-400">
            No accounts being tracked yet. Add an account below to get started.
          </p>
        </Card>
      )}

      {untrackedItems.length > 0 && (
        <Card padded={false}>
          <div className="border-b border-navy-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-navy-800">Add Account to Track</h3>
          </div>
          <div className="divide-y divide-navy-100">
            {untrackedItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <span className="text-sm font-medium text-navy-900">{it.name}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {it.type} · {it.equity_group || 'no group'}
                  </span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => onAdd(it.id)}>
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

// ---------------------------------------------------------------------------
// Rates tab — budget-style monthly grid
// ---------------------------------------------------------------------------

function RatesTab({
  items,
  perfAccts,
  rates,
  period,
  onSaveRate,
}: {
  items: BsItem[];
  perfAccts: PerfAccount[];
  rates: PerfRate[];
  period: Period;
  onSaveRate: (accountId: string, month: string, rate: number) => Promise<void>;
}) {
  const months = useMemo(() => {
    const out: Period[] = [];
    let p = { ...period };
    for (let i = 0; i < NUM_MONTHS; i++) {
      out.push(p);
      p = shiftPeriod(p, -1);
    }
    return out;
  }, [period]);

  const rateLookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rates) m.set(`${r.account_id}|${r.month}`, r.rate);
    return m;
  }, [rates]);

  const rows = useMemo(
    () =>
      perfAccts
        .map((a) => ({ perfAcct: a, item: items.find((i) => i.id === a.item_id) }))
        .filter((x) => x.item != null) as { perfAcct: PerfAccount; item: BsItem }[],
    [perfAccts, items],
  );

  const colAcct = 'min-w-[220px] w-[220px]';
  const colMonth = 'min-w-[100px] w-[100px]';

  if (rows.length === 0) {
    return (
      <Card>
        <p className="py-4 text-center text-sm text-gray-400">
          Add accounts on the Accounts tab first, then come here to enter monthly rates.
        </p>
      </Card>
    );
  }

  return (
    <Card padded={false} className="overflow-hidden rounded-xl border-gray-200 shadow-sm">
      <div className="overflow-x-auto">
        <div
          className="inline-block min-w-full"
          style={{ minWidth: 220 + NUM_MONTHS * 100 }}
        >
          {/* Header */}
          <div className="sticky top-0 z-[5] flex border-b-2 border-navy-200 bg-navy-50">
            <div
              className={`sticky left-0 z-[6] ${colAcct} shrink-0 border-r-2 border-navy-200 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-navy-700`}
            >
              Account
            </div>
            {months.map((p) => (
              <div
                key={periodKey(p)}
                className={`${colMonth} shrink-0 border-r border-navy-100 px-3 py-3 text-right text-xs font-bold uppercase tracking-wide text-navy-700`}
              >
                {MONTH_NAMES_SHORT[p.month - 1]} {String(p.year).slice(2)}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map(({ perfAcct, item }, ri) => {
            const stripe = ri % 2 === 1;
            return (
              <div
                key={perfAcct.id}
                className={`group flex ${stripe ? 'bg-gray-50' : 'bg-white'}`}
              >
                <div
                  className={`sticky left-0 z-[3] ${colAcct} shrink-0 border-b border-gray-100 border-r-2 border-gray-200 px-4 text-[13.5px] font-medium text-navy-800 ${
                    stripe ? 'bg-gray-50' : 'bg-white'
                  } flex items-center group-hover:bg-navy-50/40`}
                >
                  {item.name}
                </div>
                {months.map((p, mi) => {
                  const monthIso = `${p.year}-${String(p.month).padStart(2, '0')}-01`;
                  const val = rateLookup.get(`${perfAcct.id}|${monthIso}`);
                  return (
                    <RateCell
                      key={periodKey(p)}
                      acctId={perfAcct.id}
                      monthIdx={mi}
                      monthIso={monthIso}
                      period={p}
                      accountName={item.name}
                      value={val}
                      colMonth={colMonth}
                      onSave={(raw) => {
                        const n = Number(raw.replace(/[%\s]/g, ''));
                        if (!Number.isFinite(n)) return;
                        onSaveRate(perfAcct.id, monthIso, n);
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Rate cell — click-to-edit, matching BudgetMatrixCell pattern
// ---------------------------------------------------------------------------

function RateCell({
  acctId,
  monthIdx,
  monthIso: _monthIso,
  period,
  accountName,
  value,
  colMonth,
  onSave,
}: {
  acctId: string;
  monthIdx: number;
  monthIso: string;
  period: Period;
  accountName: string;
  value: number | undefined;
  colMonth: string;
  onSave: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value == null ? '' : String(value));
  }, [value, editing]);

  const baseline = value == null ? '' : String(value);

  const commitBlur = () => {
    if (draft !== baseline) onSave(draft);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className={`${colMonth} shrink-0 border-b border-r border-gray-100 text-sm tabular-nums`}>
        <button
          type="button"
          data-rate-cell={`${acctId}:${monthIdx}`}
          onClick={() => {
            setDraft(value == null ? '' : String(value));
            setEditing(true);
          }}
          className={`flex h-full min-h-[36px] w-full items-center justify-end px-3 text-right font-medium hover:bg-navy-50/80 focus:outline-none focus:ring-2 focus:ring-navy-400 focus:ring-inset ${
            value == null
              ? 'text-gray-300'
              : value > 0
                ? 'text-green-600'
                : value < 0
                  ? 'text-neg'
                  : 'text-navy-800'
          }`}
        >
          {value == null ? '—' : `${value}%`}
        </button>
      </div>
    );
  }

  return (
    <div className={`${colMonth} shrink-0 border-b border-r border-gray-100 text-sm`}>
      <input
        data-rate-cell={`${acctId}:${monthIdx}`}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (skipBlurRef.current) {
            skipBlurRef.current = false;
            return;
          }
          commitBlur();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (draft !== baseline) onSave(draft);
            setEditing(false);
            const next = monthIdx + 1;
            setTimeout(() => {
              document
                .querySelector<HTMLElement>(`[data-rate-cell="${acctId}:${next}"]`)
                ?.click();
            }, 0);
          } else if (e.key === 'Escape') {
            setDraft(baseline);
            setEditing(false);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            skipBlurRef.current = true;
            if (draft !== baseline) onSave(draft);
            setEditing(false);
            const next = monthIdx + (e.shiftKey ? -1 : 1);
            setTimeout(() => {
              document
                .querySelector<HTMLElement>(`[data-rate-cell="${acctId}:${next}"]`)
                ?.focus();
            }, 0);
          }
        }}
        className="h-full min-h-[36px] w-full border-0 bg-white px-3 py-0 text-right font-medium tabular-nums text-navy-800 shadow-[inset_0_0_0_2px_#3b559a] focus:outline-none focus:ring-0"
        aria-label={`${accountName} · ${MONTH_NAMES_SHORT[period.month - 1]} ${period.year}`}
      />
    </div>
  );
}
