/**
 * Performance page — monthly return rates per portfolio account.
 *
 * Four tabs:
 *   1. Accounts — pick which BS accounts to track returns for.
 *   2. Rates — budget-style grid to enter monthly return % per account.
 *   3. Regressions — configure and run Fama-French 3-factor regressions.
 *   4. Results — view saved regression output.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { fetchBalanceSheetItems } from '@/api/balanceSheet';
import {
  fetchPerfAccounts,
  addPerfAccount,
  removePerfAccount,
  fetchPerfRates,
  upsertPerfRate,
  saveRegressionResults,
  fetchRegressionResults,
  deleteRegressionRun,
  type PerfAccount,
  type PerfRate,
  type RegressionRow,
  type RegressionInsert,
} from '@/api/performance';
import { type BsItem } from '@/features/balance-sheet/effective';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { MONTH_NAMES_SHORT, shiftPeriod, periodKey, periodStartIso, formatPeriod, type Period } from '@/lib/period';
import { runSingleFactor, runMultiFactor, type RegressionInput } from '@/lib/ols';
import { StatusPanel } from '@/components/StatusPanel';
import { Button, Card } from '@/components/ds';
import { RegressionDetailTab, type MonthlyRate } from './RegressionDetailTab';

type Tab = 'accounts' | 'rates' | 'regressions' | 'results' | 'detail';
const NUM_MONTHS = 12;
const REGRESSION_PERIODS = [6, 12, 18, 24] as const;
type RegressionPeriod = (typeof REGRESSION_PERIODS)[number];

export function PerformancePage() {
  const household = useHousehold();
  const qc = useQueryClient();
  const { period } = useAppPeriod();
  const [activeTab, setActiveTab] = useState<Tab>('accounts');
  const [detailRows, setDetailRows] = useState<RegressionRow[] | null>(null);

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

  const monthFrom = periodStartIso(shiftPeriod(period, -(NUM_MONTHS - 1)));
  const monthTo = periodStartIso(period);

  const ratesQ = useQuery({
    queryKey: ['perf-rates', acctIds, monthFrom, monthTo],
    enabled: acctIds.length > 0,
    queryFn: () => fetchPerfRates(acctIds, monthFrom, monthTo),
  });

  const items = itemsQ.data ?? [];
  const rates = ratesQ.data ?? [];

  const loading = itemsQ.isLoading || perfAcctsQ.isLoading;
  const err = itemsQ.error ?? perfAcctsQ.error;

  const invalidateAccts = () => qc.invalidateQueries({ queryKey: ['perf-accounts', household?.id] });
  const invalidateRates = () => qc.invalidateQueries({ queryKey: ['perf-rates'] });
  const invalidateRegressions = () => qc.invalidateQueries({ queryKey: ['perf-regressions'] });

  const regressionsQ = useQuery({
    queryKey: ['perf-regressions', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchRegressionResults(household!.id),
  });

  // Detail tab: derive monthly rates for the selected regression
  const detailRef = detailRows?.[0] ?? null;
  const detailFactorAccts = useMemo(
    () => perfAccts.filter((a) => a.factor_key != null),
    [perfAccts],
  );
  const detailRateIds = useMemo(() => {
    if (!detailRef) return [];
    const ids = [detailRef.account_id, ...detailFactorAccts.map((a) => a.id)];
    return ids;
  }, [detailRef, detailFactorAccts]);

  const detailMonthFrom = useMemo(() => {
    if (!detailRef) return undefined;
    const d = new Date(detailRef.period_end);
    d.setMonth(d.getMonth() - detailRef.period_months + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, [detailRef]);
  const detailMonthTo = detailRef?.period_end;

  const detailRatesQ = useQuery({
    queryKey: ['perf-rates-detail', detailRateIds, detailMonthFrom, detailMonthTo],
    enabled: detailRateIds.length > 0 && !!detailMonthFrom,
    queryFn: () => fetchPerfRates(detailRateIds, detailMonthFrom, detailMonthTo),
  });

  const detailMonthlyRates: MonthlyRate[] = useMemo(() => {
    if (!detailRef || !detailRatesQ.data) return [];
    const rateMap = new Map<string, number>();
    for (const r of detailRatesQ.data) rateMap.set(`${r.account_id}|${r.month}`, r.rate);

    const factorKeyToId = new Map<string, string>();
    for (const a of detailFactorAccts) if (a.factor_key) factorKeyToId.set(a.factor_key, a.id);
    const mktRfId = factorKeyToId.get('mkt_rf');
    const rfId = factorKeyToId.get('rf');

    const months: string[] = [];
    const d = new Date(detailRef.period_end);
    d.setMonth(d.getMonth() - detailRef.period_months + 1);
    for (let i = 0; i < detailRef.period_months; i++) {
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
      d.setMonth(d.getMonth() + 1);
    }

    return months.map((m) => ({
      month: m.slice(0, 7),
      portfolio: rateMap.get(`${detailRef.account_id}|${m}`) ?? 0,
      mktRf: mktRfId ? (rateMap.get(`${mktRfId}|${m}`) ?? 0) : 0,
      rf: rfId ? (rateMap.get(`${rfId}|${m}`) ?? 0) : 0,
    }));
  }, [detailRef, detailRatesQ.data, detailFactorAccts]);

  const detailAccountName = useMemo(() => {
    if (!detailRef) return '';
    const a = perfAccts.find((pa) => pa.id === detailRef.account_id);
    if (!a) return 'Unknown';
    if (a.item_id) {
      const item = items.find((i) => i.id === a.item_id);
      return item?.name ?? 'Unknown';
    }
    return a.label ?? a.factor_key ?? 'Unknown';
  }, [detailRef, perfAccts, items]);

  if (err) {
    return <StatusPanel kind="error" message="Couldn't load performance data" detail={err instanceof Error ? err.message : undefined} />;
  }
  if (loading) {
    return <StatusPanel kind="loading" message="Loading performance…" />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'accounts', label: 'Accounts' },
    { id: 'rates', label: 'Rates' },
    { id: 'regressions', label: 'Regressions' },
    { id: 'results', label: 'Results' },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Track monthly return rates starting from{' '}
        <span className="font-semibold text-navy-900">{formatPeriod(period)}</span>{' '}
        going back {NUM_MONTHS} months.
      </p>

      <div className="flex gap-1 border-b border-navy-100">
        {tabs.map((t) => {
          const isActive = activeTab === t.id || (t.id === 'results' && activeTab === 'detail');
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-b-2 border-navy-600 text-navy-800'
                  : 'text-gray-500 hover:text-navy-700'
              }`}
            >
              {t.label}
            </button>
          );
        })}
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

      {activeTab === 'regressions' && household && (
        <RegressionsTab
          householdId={household.id}
          items={items}
          perfAccts={perfAccts}
          period={period}
          onRunComplete={() => {
            invalidateRegressions();
            setActiveTab('results');
          }}
          onGoToRates={() => setActiveTab('rates')}
        />
      )}

      {activeTab === 'results' && household && (
        <ResultsTab
          householdId={household.id}
          items={items}
          perfAccts={perfAccts}
          regressions={regressionsQ.data ?? []}
          loading={regressionsQ.isLoading}
          onDelete={async (runDate) => {
            await deleteRegressionRun(household.id, runDate);
            invalidateRegressions();
          }}
          onSelectRegression={(rows) => {
            setDetailRows(rows);
            setActiveTab('detail');
          }}
        />
      )}

      {activeTab === 'detail' && (
        <RegressionDetailTab
          single={detailRows?.find((r) => r.regression_type === 'single')}
          multi={detailRows?.find((r) => r.regression_type === 'multi')}
          accountName={detailAccountName}
          monthlyRates={detailMonthlyRates}
          onBack={() => setActiveTab('results')}
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
  const portfolioAccts = perfAccts.filter((a) => a.item_id != null);
  const factorAccts = perfAccts.filter((a) => a.factor_key != null);
  const trackedItemIds = new Set(portfolioAccts.map((a) => a.item_id));
  const trackedItems = portfolioAccts
    .map((a) => ({ perfAcct: a, item: items.find((i) => i.id === a.item_id) }))
    .filter((x) => x.item != null) as { perfAcct: PerfAccount; item: BsItem }[];
  const untrackedItems = items.filter((i) => !trackedItemIds.has(i.id));

  return (
    <div className="space-y-6">
      {/* Factor accounts (imported from Fama-French) */}
      {factorAccts.length > 0 && (
        <Card padded={false}>
          <div className="border-b border-navy-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-navy-800">Fama-French Factors</h3>
          </div>
          <div className="divide-y divide-navy-100">
            {factorAccts.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium text-navy-900">{a.label}</span>
                  <span className="ml-2 text-xs text-gray-400">imported factor</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Portfolio accounts (linked to BS items) */}
      {trackedItems.length > 0 ? (
        <Card padded={false}>
          <div className="border-b border-navy-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-navy-800">Tracked Portfolio Accounts</h3>
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
            No portfolio accounts being tracked yet. Add an account below to get started.
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

  const rows = useMemo(() => {
    const out: { perfAcct: PerfAccount; name: string; isFactor: boolean }[] = [];
    for (const a of perfAccts) {
      if (a.factor_key) {
        out.push({ perfAcct: a, name: a.label ?? a.factor_key, isFactor: true });
      } else {
        const item = items.find((i) => i.id === a.item_id);
        if (item) out.push({ perfAcct: a, name: item.name, isFactor: false });
      }
    }
    return out;
  }, [perfAccts, items]);

  // Determine if any Fama-French factor is missing a rate for the selected month
  const selectedMonthIso = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
  const factorRows = rows.filter((r) => r.isFactor);
  const hasMissingFactorRates = factorRows.length > 0 && factorRows.some((r) => {
    return rateLookup.get(`${r.perfAcct.id}|${selectedMonthIso}`) == null;
  });
  const colAcct = 'min-w-[280px] w-[280px]';
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
    <div className="space-y-3">
      {hasMissingFactorRates && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>
            Fama-French factor rates are missing for{' '}
            <span className="font-semibold">{MONTH_NAMES_SHORT[period.month - 1]} {period.year}</span>.
          </span>
          <Link
            to="/import"
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200 transition-colors"
          >
            Import Data
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      )}

      <Card padded={false} className="overflow-hidden rounded-xl border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <div
            className="inline-block min-w-full"
            style={{ minWidth: 280 + NUM_MONTHS * 100 }}
          >
            {/* Header */}
            <div className="sticky top-0 z-[5] flex border-b-2 border-navy-200 bg-navy-50">
              <div
                className={`sticky left-0 z-[6] ${colAcct} shrink-0 border-r-2 border-navy-200 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-navy-700 bg-navy-50`}
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
            {rows.map(({ perfAcct, name, isFactor }, ri) => {
              const stripe = ri % 2 === 1;
              return (
                <div
                  key={perfAcct.id}
                  className={`group flex ${stripe ? 'bg-gray-50' : 'bg-white'}`}
                >
                  <div
                    className={`sticky left-0 z-[3] ${colAcct} shrink-0 border-b border-gray-100 border-r-2 border-gray-200 px-4 text-[13.5px] font-medium text-navy-800 ${
                      stripe ? 'bg-gray-50' : 'bg-white'
                    } flex items-center whitespace-nowrap group-hover:bg-navy-50/40`}
                  >
                    {name}
                    {isFactor && (
                      <span className="ml-1.5 rounded bg-navy-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-navy-500">
                        Factor
                      </span>
                    )}
                  </div>
                  {months.map((p, mi) => {
                    const monthIso = `${p.year}-${String(p.month).padStart(2, '0')}-01`;
                    const val = rateLookup.get(`${perfAcct.id}|${monthIso}`);
                    return (
                      <RateCell
                        key={periodKey(p)}
                        acctId={perfAcct.id}
                        rowIdx={ri}
                        rowCount={rows.length}
                        monthIdx={mi}
                        monthIso={monthIso}
                        period={p}
                        accountName={name}
                        value={val}
                        colMonth={colMonth}
                        isFactor={isFactor}
                        onSave={(raw) => {
                          const cleaned = raw.replace(/%/g, '').trim();
                          if (cleaned === '') return;
                          const n = Number(cleaned);
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regressions tab — configure and run FF regressions
// ---------------------------------------------------------------------------

function RegressionsTab({
  householdId,
  items,
  perfAccts,
  period,
  onRunComplete,
  onGoToRates,
}: {
  householdId: string;
  items: BsItem[];
  perfAccts: PerfAccount[];
  period: Period;
  onRunComplete: () => void;
  onGoToRates: () => void;
}) {
  const [selectedPeriods, setSelectedPeriods] = useState<Set<RegressionPeriod>>(new Set([12]));
  const [selectedAcctIds, setSelectedAcctIds] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const portfolioAccts = useMemo(
    () => perfAccts.filter((a) => a.item_id != null),
    [perfAccts],
  );
  const factorAccts = useMemo(
    () => perfAccts.filter((a) => a.factor_key != null),
    [perfAccts],
  );

  const maxPeriod = Math.max(...(selectedPeriods.size > 0 ? [...selectedPeriods] : [0]));

  // Fetch rates spanning the longest selected regression window
  const rateMonthFrom = maxPeriod > 0
    ? periodStartIso(shiftPeriod(period, -(maxPeriod - 1)))
    : undefined;
  const rateMonthTo = periodStartIso(period);

  const allNeededIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of selectedAcctIds) ids.add(id);
    for (const a of factorAccts) ids.add(a.id);
    return [...ids];
  }, [selectedAcctIds, factorAccts]);

  const ratesQ = useQuery({
    queryKey: ['perf-rates-regression', allNeededIds, rateMonthFrom, rateMonthTo],
    enabled: allNeededIds.length > 0 && !!rateMonthFrom,
    queryFn: () => fetchPerfRates(allNeededIds, rateMonthFrom, rateMonthTo),
  });

  const rateLookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of ratesQ.data ?? []) m.set(`${r.account_id}|${r.month}`, r.rate);
    return m;
  }, [ratesQ.data]);

  // Data completeness check
  const completeness = useMemo(() => {
    if (selectedPeriods.size === 0 || selectedAcctIds.size === 0) return null;

    const issues: { accountName: string; periodMonths: number; missingMonths: string[] }[] = [];

    const factorKeyToId = new Map<string, string>();
    for (const a of factorAccts) if (a.factor_key) factorKeyToId.set(a.factor_key, a.id);

    for (const pm of selectedPeriods) {
      const months: string[] = [];
      let p = { ...period };
      for (let i = 0; i < pm; i++) {
        months.push(periodStartIso(p));
        p = shiftPeriod(p, -1);
      }

      // Check portfolio accounts
      for (const acctId of selectedAcctIds) {
        const acct = perfAccts.find((a) => a.id === acctId);
        const item = acct?.item_id ? items.find((i) => i.id === acct.item_id) : null;
        const name = item?.name ?? acct?.label ?? 'Unknown';
        const missing = months.filter((m) => rateLookup.get(`${acctId}|${m}`) == null);
        if (missing.length > 0) {
          issues.push({ accountName: name, periodMonths: pm, missingMonths: missing });
        }
      }

      // Check factor accounts
      for (const [factorKey, factorId] of factorKeyToId) {
        const factorLabel = factorAccts.find((a) => a.id === factorId)?.label ?? factorKey;
        const missing = months.filter((m) => rateLookup.get(`${factorId}|${m}`) == null);
        if (missing.length > 0) {
          issues.push({ accountName: factorLabel, periodMonths: pm, missingMonths: missing });
        }
      }
    }

    return issues;
  }, [selectedPeriods, selectedAcctIds, period, perfAccts, items, factorAccts, rateLookup]);

  const allComplete = completeness !== null && completeness.length === 0;
  const hasFactors = factorAccts.length >= 4;

  const togglePeriod = (p: RegressionPeriod) => {
    setSelectedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  const toggleAcct = (id: string) => {
    setSelectedAcctIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllAccts = () => {
    setSelectedAcctIds(new Set(portfolioAccts.map((a) => a.id)));
  };

  function buildFactorIdMap() {
    const factorKeyToId = new Map<string, string>();
    for (const a of factorAccts) if (a.factor_key) factorKeyToId.set(a.factor_key, a.id);
    return {
      mktRfId: factorKeyToId.get('mkt_rf')!,
      smbId: factorKeyToId.get('smb')!,
      hmlId: factorKeyToId.get('hml')!,
      rfId: factorKeyToId.get('rf')!,
    };
  }

  function buildMonthsForPeriod(pm: number): string[] {
    const months: string[] = [];
    let p = { ...period };
    for (let i = 0; i < pm; i++) {
      months.push(periodStartIso(p));
      p = shiftPeriod(p, -1);
    }
    return months.reverse();
  }

  function buildRegressionInput(acctId: string, months: string[], fIds: ReturnType<typeof buildFactorIdMap>): RegressionInput {
    return {
      portfolioReturns: months.map((m) => rateLookup.get(`${acctId}|${m}`) ?? 0),
      mktRf: months.map((m) => rateLookup.get(`${fIds.mktRfId}|${m}`) ?? 0),
      smb: months.map((m) => rateLookup.get(`${fIds.smbId}|${m}`) ?? 0),
      hml: months.map((m) => rateLookup.get(`${fIds.hmlId}|${m}`) ?? 0),
      rf: months.map((m) => rateLookup.get(`${fIds.rfId}|${m}`) ?? 0),
    };
  }

  function handleExportCsv() {
    if (selectedPeriods.size === 0 || selectedAcctIds.size === 0 || !hasFactors) return;

    const fIds = buildFactorIdMap();
    const csvParts: string[] = [];

    for (const pm of [...selectedPeriods].sort((a, b) => a - b)) {
      const months = buildMonthsForPeriod(pm);

      for (const acctId of selectedAcctIds) {
        const acct = perfAccts.find((a) => a.id === acctId);
        const item = acct?.item_id ? items.find((i) => i.id === acct.item_id) : null;
        const acctName = item?.name ?? acct?.label ?? 'Unknown';
        const input = buildRegressionInput(acctId, months, fIds);

        csvParts.push(`${acctName} — ${pm}-Month Regression Data`);
        csvParts.push('Month,Portfolio Return (%),Mkt-RF (%),SMB (%),HML (%),RF (%),Excess Return (%)');

        for (let i = 0; i < months.length; i++) {
          const excessReturn = input.portfolioReturns[i] - input.rf[i];
          csvParts.push(
            [months[i], input.portfolioReturns[i], input.mktRf[i], input.smb[i], input.hml[i], input.rf[i], excessReturn.toFixed(4)].join(','),
          );
        }

        csvParts.push('');
        csvParts.push('Excel Regression Setup:');
        csvParts.push('"Single Factor (CAPM): Y = Excess Return, X1 = Mkt-RF"');
        csvParts.push('"Multi Factor (FF3): Y = Excess Return, X1 = Mkt-RF, X2 = SMB, X3 = HML"');
        csvParts.push('"Alpha is monthly — multiply by 12 to annualize, SE by sqrt(12)"');
        csvParts.push('');
      }
    }

    const blob = new Blob([csvParts.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `regression-data-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRun() {
    if (!allComplete || running) return;
    setRunning(true);
    setError(null);

    try {
      const fIds = buildFactorIdMap();

      const today = new Date();
      const runDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const results: RegressionInsert[] = [];

      for (const pm of selectedPeriods) {
        const months = buildMonthsForPeriod(pm);

        for (const acctId of selectedAcctIds) {
          const input = buildRegressionInput(acctId, months, fIds);

          const single = runSingleFactor(input);
          const multi = runMultiFactor(input);
          const periodEnd = months[months.length - 1];

          const base = { household_id: householdId, account_id: acctId, run_date: runDate, period_months: pm, period_end: periodEnd };

          results.push({
            ...base,
            regression_type: 'single',
            alpha: single.alpha,
            alpha_se: single.alphaSe,
            alpha_pvalue: single.alphaPvalue,
            beta_mkt: single.betaMkt,
            beta_mkt_se: single.betaMktSe,
            beta_mkt_pvalue: single.betaMktPvalue,
            beta_smb: null,
            beta_smb_se: null,
            beta_smb_pvalue: null,
            beta_hml: null,
            beta_hml_se: null,
            beta_hml_pvalue: null,
            r_squared: single.rSquared,
            adj_r_squared: single.adjRSquared,
            n_observations: single.nObservations,
          });

          results.push({
            ...base,
            regression_type: 'multi',
            alpha: multi.alpha,
            alpha_se: multi.alphaSe,
            alpha_pvalue: multi.alphaPvalue,
            beta_mkt: multi.betaMkt,
            beta_mkt_se: multi.betaMktSe,
            beta_mkt_pvalue: multi.betaMktPvalue,
            beta_smb: multi.betaSmb,
            beta_smb_se: multi.betaSmbSe,
            beta_smb_pvalue: multi.betaSmbPvalue,
            beta_hml: multi.betaHml,
            beta_hml_se: multi.betaHmlSe,
            beta_hml_pvalue: multi.betaHmlPvalue,
            r_squared: multi.rSquared,
            adj_r_squared: multi.adjRSquared,
            n_observations: multi.nObservations,
          });
        }
      }

      await saveRegressionResults(results);
      onRunComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regression failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {!hasFactors && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>
            Fama-French factor data has not been imported yet. Go to{' '}
            <Link to="/import" className="font-semibold underline">Import Data</Link> to upload the factor CSV first.
          </span>
        </div>
      )}

      {/* Section A: Time Period Selection */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-navy-800">1. Select Regression Time Periods</h3>
        <p className="mb-3 text-xs text-gray-500">
          Choose one or more lookback windows. Regressions will run for each selected period.
        </p>
        <div className="flex flex-wrap gap-2">
          {REGRESSION_PERIODS.map((p) => {
            const active = selectedPeriods.has(p);
            return (
              <button
                key={p}
                onClick={() => togglePeriod(p)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-navy-500 bg-navy-600 text-white'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-navy-300 hover:text-navy-700'
                }`}
              >
                Last {p} months
              </button>
            );
          })}
        </div>
      </Card>

      {/* Section B: Account Selection */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-800">2. Select Portfolio Accounts</h3>
          {portfolioAccts.length > 0 && (
            <button onClick={selectAllAccts} className="text-xs font-medium text-navy-600 hover:underline">
              Select all
            </button>
          )}
        </div>
        {portfolioAccts.length === 0 ? (
          <p className="py-3 text-center text-sm text-gray-400">
            No portfolio accounts being tracked. Add accounts on the Accounts tab first.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {portfolioAccts.map((a) => {
              const item = items.find((i) => i.id === a.item_id);
              const checked = selectedAcctIds.has(a.id);
              return (
                <label key={a.id} className="flex cursor-pointer items-center gap-3 px-1 py-2.5 hover:bg-gray-50 rounded">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAcct(a.id)}
                    className="h-4 w-4 rounded border-gray-300 text-navy-600 focus:ring-navy-500"
                  />
                  <span className="text-sm font-medium text-navy-800">{item?.name ?? 'Unknown'}</span>
                  {item && (
                    <span className="text-xs text-gray-400">
                      {item.type} · {item.equity_group || 'no group'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </Card>

      {/* Section C: Data Completeness */}
      {selectedPeriods.size > 0 && selectedAcctIds.size > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-navy-800">3. Data Completeness</h3>
          {ratesQ.isLoading ? (
            <p className="text-sm text-gray-400">Checking rates…</p>
          ) : !hasFactors ? (
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span>Import Fama-French factor data before running regressions.</span>
            </div>
          ) : allComplete ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span>All required rates are present. Ready to run regressions.</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <span>Some monthly rates are missing. Add them on the Rates tab before running.</span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs text-amber-800">
                {completeness!.map((issue, i) => (
                  <div key={i} className="py-1">
                    <span className="font-semibold">{issue.accountName}</span>
                    <span className="text-amber-600"> ({issue.periodMonths}mo)</span>
                    {' — '}
                    {issue.missingMonths.length} missing month{issue.missingMonths.length > 1 ? 's' : ''}
                  </div>
                ))}
              </div>
              <button
                onClick={onGoToRates}
                className="mt-1 text-xs font-semibold text-navy-600 hover:underline"
              >
                Go to Rates tab →
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Run button */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center gap-4">
        <Button
          variant="primary"
          disabled={!allComplete || !hasFactors || running || selectedPeriods.size === 0 || selectedAcctIds.size === 0}
          onClick={handleRun}
        >
          {running ? 'Running…' : 'Run Regressions'}
        </Button>
        <Button
          variant="secondary"
          disabled={!hasFactors || selectedPeriods.size === 0 || selectedAcctIds.size === 0}
          onClick={handleExportCsv}
        >
          <span className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </span>
        </Button>
        <span className="text-xs text-gray-400">
          {selectedPeriods.size > 0 && selectedAcctIds.size > 0
            ? `${selectedAcctIds.size} account${selectedAcctIds.size > 1 ? 's' : ''} × ${selectedPeriods.size} period${selectedPeriods.size > 1 ? 's' : ''} × 2 types = ${selectedAcctIds.size * selectedPeriods.size * 2} regressions`
            : 'Select periods and accounts above'}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results tab — saved regression output
// ---------------------------------------------------------------------------

interface ResultsSummaryRow {
  key: string;
  accountName: string;
  accountId: string;
  periodMonths: number;
  periodEnd: string;
  runDate: string;
  single?: RegressionRow;
  multi?: RegressionRow;
}

function ResultsTab({
  items,
  perfAccts,
  regressions,
  loading,
  onDelete,
  onSelectRegression,
}: {
  householdId: string;
  items: BsItem[];
  perfAccts: PerfAccount[];
  regressions: RegressionRow[];
  loading: boolean;
  onDelete: (runDate: string) => Promise<void>;
  onSelectRegression: (rows: RegressionRow[]) => void;
}) {
  const acctNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of perfAccts) {
      if (a.item_id) {
        const item = items.find((i) => i.id === a.item_id);
        m.set(a.id, item?.name ?? 'Unknown');
      } else {
        m.set(a.id, a.label ?? a.factor_key ?? 'Unknown');
      }
    }
    return m;
  }, [perfAccts, items]);

  const summaryRows = useMemo(() => {
    const grouped = new Map<string, { single?: RegressionRow; multi?: RegressionRow }>();
    for (const r of regressions) {
      const key = `${r.account_id}|${r.period_months}|${r.run_date}`;
      const entry = grouped.get(key) ?? {};
      if (r.regression_type === 'single') entry.single = r;
      else entry.multi = r;
      grouped.set(key, entry);
    }

    const out: ResultsSummaryRow[] = [];
    for (const [key, pair] of grouped) {
      const ref = pair.multi ?? pair.single!;
      out.push({
        key,
        accountName: acctNameMap.get(ref.account_id) ?? 'Unknown',
        accountId: ref.account_id,
        periodMonths: ref.period_months,
        periodEnd: ref.period_end,
        runDate: ref.run_date,
        single: pair.single,
        multi: pair.multi,
      });
    }
    return out.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || a.accountName.localeCompare(b.accountName) || a.periodMonths - b.periodMonths);
  }, [regressions, acctNameMap]);

  if (loading) {
    return <StatusPanel kind="loading" message="Loading regression results…" />;
  }

  if (regressions.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-gray-400">
          No regression results yet. Go to the Regressions tab to configure and run an analysis.
        </p>
      </Card>
    );
  }

  const runDates = [...new Set(regressions.map((r) => r.run_date))].sort((a, b) => b.localeCompare(a));

  const computeStartDate = (periodEnd: string, months: number) => {
    const d = new Date(periodEnd);
    d.setMonth(d.getMonth() - months + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const formatMonth = (iso: string) => {
    const [y, m] = iso.split('-');
    return `${MONTH_NAMES_SHORT[Number(m) - 1]} ${y}`;
  };

  return (
    <div className="space-y-3">
      {runDates.length > 1 && (
        <div className="flex items-center justify-end gap-2">
          {runDates.map((rd) => (
            <button
              key={rd}
              onClick={() => {
                if (confirm(`Delete all regressions from ${rd}?`))
                  onDelete(rd);
              }}
              className="rounded border border-gray-200 px-2 py-1 text-[11px] text-neg hover:bg-red-50 hover:border-red-200 transition-colors"
            >
              Delete run {rd}
            </button>
          ))}
        </div>
      )}

      <Card padded={false} className="overflow-hidden rounded-xl border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b-2 border-navy-200 bg-navy-50">
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-navy-700">Portfolio</th>
                <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-navy-700">Time Period</th>
                <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-navy-700">Start – End</th>
                <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-navy-700"># Months</th>
                <th colSpan={3} className="border-l border-navy-200 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-navy-700">
                  Single Regression
                </th>
                <th colSpan={3} className="border-l border-navy-200 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-navy-700">
                  Multi-Regression
                </th>
              </tr>
              <tr className="border-b border-navy-100 bg-navy-50/50">
                <th className="px-4 py-1.5" />
                <th className="px-3 py-1.5" />
                <th className="px-3 py-1.5" />
                <th className="px-3 py-1.5" />
                <th className="border-l border-navy-200 px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-navy-600">Alpha</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-navy-600">Beta</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-navy-600">R²</th>
                <th className="border-l border-navy-200 px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-navy-600">Alpha</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-navy-600">Beta</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-navy-600">R²</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row, ri) => {
                const startMonth = computeStartDate(row.periodEnd, row.periodMonths);
                const endMonth = row.periodEnd.slice(0, 7);
                const stripe = ri % 2 === 1;
                const allRows = [row.single, row.multi].filter(Boolean) as RegressionRow[];

                return (
                  <tr
                    key={row.key}
                    onClick={() => onSelectRegression(allRows)}
                    className={`cursor-pointer border-b border-gray-100 transition-colors hover:bg-navy-50/60 ${stripe ? 'bg-gray-50' : 'bg-white'}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-navy-800 whitespace-nowrap">{row.accountName}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{row.runDate}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                      {formatMonth(startMonth)} – {formatMonth(endMonth)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{row.periodMonths}</td>
                    {/* Single Regression */}
                    <td className={`border-l border-gray-200 px-3 py-2.5 text-right tabular-nums font-medium ${
                      row.single ? (row.single.alpha > 0 ? 'text-green-600' : row.single.alpha < 0 ? 'text-neg' : 'text-navy-800') : 'text-gray-300'
                    }`}>
                      {row.single ? `${row.single.alpha >= 0 ? '+' : ''}${row.single.alpha.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-navy-800">
                      {row.single ? row.single.beta_mkt.toFixed(3) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-navy-800">
                      {row.single ? `${(row.single.r_squared * 100).toFixed(1)}%` : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Multi-Regression */}
                    <td className={`border-l border-gray-200 px-3 py-2.5 text-right tabular-nums font-medium ${
                      row.multi ? (row.multi.alpha > 0 ? 'text-green-600' : row.multi.alpha < 0 ? 'text-neg' : 'text-navy-800') : 'text-gray-300'
                    }`}>
                      {row.multi ? `${row.multi.alpha >= 0 ? '+' : ''}${row.multi.alpha.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-navy-800">
                      {row.multi ? row.multi.beta_mkt.toFixed(3) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-navy-800">
                      {row.multi ? `${(row.multi.r_squared * 100).toFixed(1)}%` : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Rate cell — click-to-edit, matching BudgetMatrixCell pattern
// ---------------------------------------------------------------------------

function RateCell({
  acctId: _acctId,
  rowIdx,
  rowCount,
  monthIdx,
  monthIso: _monthIso,
  period,
  accountName,
  value,
  colMonth,
  isFactor,
  onSave,
}: {
  acctId: string;
  rowIdx: number;
  rowCount: number;
  monthIdx: number;
  monthIso: string;
  period: Period;
  accountName: string;
  value: number | undefined;
  colMonth: string;
  isFactor: boolean;
  onSave: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const skipBlurRef = useRef(false);

  const displayValue = optimistic ?? value;

  useEffect(() => {
    if (!editing) setDraft(displayValue == null ? '' : String(displayValue));
  }, [displayValue, editing]);

  // Clear optimistic value once the server-side value catches up
  useEffect(() => {
    if (optimistic != null && value === optimistic) setOptimistic(null);
  }, [value, optimistic]);

  const baseline = value == null ? '' : String(value);
  const readOnly = isFactor && value == null;

  const normalizeDraft = (d: string) => d.replace(/%/g, '').trim();

  const commit = (d: string) => {
    const cleaned = normalizeDraft(d);
    if (cleaned !== baseline) {
      const n = Number(cleaned);
      if (Number.isFinite(n)) setOptimistic(n);
      onSave(d);
    }
  };

  const commitBlur = () => {
    commit(draft);
    setEditing(false);
  };

  const cellId = `${rowIdx}:${monthIdx}`;

  // Factor cells without imported data are read-only
  if (readOnly) {
    return (
      <div className={`${colMonth} shrink-0 border-b border-r border-gray-100 text-sm tabular-nums`}>
        <div
          data-rate-cell={cellId}
          className="flex h-full min-h-[36px] w-full items-center justify-end px-2 text-right text-[11px] italic text-gray-400 select-none"
          title="Import Fama-French data to populate this cell"
        >
          not imported
        </div>
      </div>
    );
  }

  // Factor cells with imported data: display-only (not editable)
  if (isFactor && value != null) {
    return (
      <div className={`${colMonth} shrink-0 border-b border-r border-gray-100 text-sm tabular-nums`}>
        <div
          data-rate-cell={cellId}
          className={`flex h-full min-h-[36px] w-full items-center justify-end px-3 text-right font-medium select-none ${
            value > 0
              ? 'text-green-600'
              : value < 0
                ? 'text-neg'
                : 'text-navy-800'
          }`}
          title="Imported from Fama-French data"
        >
          {value}%
        </div>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className={`${colMonth} shrink-0 border-b border-r border-gray-100 text-sm tabular-nums`}>
        <button
          type="button"
          data-rate-cell={cellId}
          onClick={() => {
            setDraft(displayValue == null ? '' : String(displayValue));
            setEditing(true);
          }}
          className={`flex h-full min-h-[36px] w-full items-center justify-end px-3 text-right font-medium hover:bg-navy-50/80 focus:outline-none focus:ring-2 focus:ring-navy-400 focus:ring-inset ${
            displayValue == null
              ? 'text-gray-300'
              : displayValue > 0
                ? 'text-green-600'
                : displayValue < 0
                  ? 'text-neg'
                  : 'text-navy-800'
          }`}
        >
          {displayValue == null ? '—' : `${displayValue}%`}
        </button>
      </div>
    );
  }

  return (
    <div className={`${colMonth} shrink-0 border-b border-r border-gray-100 text-sm`}>
      <input
        data-rate-cell={cellId}
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
            skipBlurRef.current = true;
            commit(draft);
            setEditing(false);
            const nextRow = rowIdx + 1 < rowCount ? rowIdx + 1 : 0;
            const target = `${nextRow}:${monthIdx}`;
            setTimeout(() => {
              document
                .querySelector<HTMLElement>(`[data-rate-cell="${target}"]`)
                ?.click();
            }, 0);
          } else if (e.key === 'Escape') {
            setDraft(baseline);
            setEditing(false);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            skipBlurRef.current = true;
            commit(draft);
            setEditing(false);
            const nextMonth = monthIdx + (e.shiftKey ? -1 : 1);
            const target = `${rowIdx}:${nextMonth}`;
            setTimeout(() => {
              document
                .querySelector<HTMLElement>(`[data-rate-cell="${target}"]`)
                ?.click();
            }, 0);
          }
        }}
        className="h-full min-h-[36px] w-full border-0 bg-white px-3 py-0 text-right font-medium tabular-nums text-navy-800 shadow-[inset_0_0_0_2px_#3b559a] focus:outline-none focus:ring-0"
        aria-label={`${accountName} · ${MONTH_NAMES_SHORT[period.month - 1]} ${period.year}`}
      />
    </div>
  );
}
