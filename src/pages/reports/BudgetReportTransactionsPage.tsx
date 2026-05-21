import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchSchemeCategories,
  fetchReportShellTransactions,
} from '@/api/reports';
import type { ReportShellTransaction } from '@/api/reports';
import { ALL_GROUPS } from '@/features/categories/constants';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { fmtUsd, moneyClass } from '@/lib/money';
import { formatPeriod, periodEndIso, periodStartIso, yearStartIso } from '@/lib/period';
import { formatDate } from '@/lib/date';
import { StatusPanel } from '@/components/StatusPanel';
import { Card, CategoryChip } from '@/components/ds';
import { accountStripeHex } from '@/pages/transactions/txAccountColor';
import { TransactionPropertiesDrawer } from '@/pages/transactions/TransactionPropertiesDrawer';
import { ColumnFilterPopover } from '@/pages/transactions/ColumnFilterPopover';

type RangeMode = 'all' | 'ytd' | 'month';

function transactionMatchesGroupKey(t: ReportShellTransaction, drillKey: string): boolean {
  const g = t.category_group;
  if (drillKey === '__uncategorized__') return !t.category_id;
  if (!g) return false;
  if (drillKey === 'Yearly') return g === 'Yearly';
  if (drillKey === 'Rent & House Maintenance') {
    return g === 'Rent & House Maintenance' || g === 'Rent & Utilities';
  }
  return g === drillKey;
}

export function BudgetReportTransactionsPage() {
  const household = useHousehold();
  const { period } = useAppPeriod();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [groupKey, setGroupKey] = useState('');
  const [rangeMode, setRangeMode] = useState<RangeMode>('all');
  const [detailTxnId, setDetailTxnId] = useState<string | null>(null);

  const schemeQ = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });

  const categoriesQ = useQuery({
    queryKey: ['scheme-categories', schemeQ.data],
    enabled: !!schemeQ.data,
    queryFn: () => fetchSchemeCategories(schemeQ.data!),
  });

  const rangeArgs = useMemo(() => {
    if (rangeMode === 'all') return {};
    if (rangeMode === 'ytd') {
      return { from: yearStartIso(period.year), to: periodEndIso(period) };
    }
    return { from: periodStartIso(period), to: periodEndIso(period) };
  }, [rangeMode, period]);

  const txQ = useQuery({
    queryKey: [
      'reports-shell-tx',
      'budget-page',
      household?.id,
      schemeQ.data,
      rangeMode,
      ...(rangeMode === 'all' ? [] : [period.year, period.month]),
    ],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchReportShellTransactions({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        ...rangeArgs,
      }),
  });

  const groupOptions = useMemo(() => {
    const cats = categoriesQ.data ?? [];
    const seen = new Set<string>();
    const ordered: { key: string; label: string }[] = [];

    const push = (key: string, label: string) => {
      if (seen.has(key)) return;
      seen.add(key);
      ordered.push({ key, label });
    };

    for (const name of ALL_GROUPS) {
      if (cats.some((c) => c.group_name === name)) push(name, name);
    }
    for (const c of cats) {
      const g = c.group_name;
      if (g && !seen.has(g)) push(g, g);
    }
    push('__uncategorized__', 'Uncategorized');
    return ordered;
  }, [categoriesQ.data]);

  const filteredSorted = useMemo(() => {
    const rows = txQ.data ?? [];
    let list = rows;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const desc = (t.description ?? '').toLowerCase();
        const acct = (t.account_name ?? '').toLowerCase();
        const cat = (t.category_name ?? '').toLowerCase();
        return desc.includes(q) || acct.includes(q) || cat.includes(q);
      });
    }

    if (categoryId) {
      list = list.filter((t) => t.category_id === categoryId);
    }

    if (groupKey) {
      list = list.filter((t) => transactionMatchesGroupKey(t, groupKey));
    }

    return [...list].sort((a, b) => b.amount - a.amount);
  }, [txQ.data, search, categoryId, groupKey]);

  const subtotal = useMemo(
    () => filteredSorted.reduce((acc, t) => acc + t.amount, 0),
    [filteredSorted],
  );

  const stats = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const t of filteredSorted) {
      if (t.amount < 0) inSum += -t.amount;
      else outSum += t.amount;
    }
    return { inSum, outSum, net: outSum - inSum };
  }, [filteredSorted]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (groupKey ? 1 : 0) +
    (rangeMode !== 'all' ? 1 : 0);

  const clearAll = () => {
    setSearch('');
    setCategoryId('');
    setGroupKey('');
    setRangeMode('all');
  };

  const periodLabel = formatPeriod(period);
  const rangeSummary =
    rangeMode === 'all'
      ? 'All time'
      : rangeMode === 'ytd'
        ? `YTD through ${periodLabel}`
        : formatPeriod(period);

  return (
    <div className="relative mx-auto max-w-[1600px]">
      {/* Page header */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-600">
            Click the funnel icon in any column header to filter. Sorted by largest amount first.
            {activeFilterCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-bold text-navy-800">
                Filtered
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Slim toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative w-[340px] max-w-full">
          <svg viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="5" /><path d="m11 11 3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search descriptions, accounts, categories…"
            className="w-full rounded-md border border-navy-200 bg-white py-1.5 pl-8 pr-2 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
        </div>

        <span className="text-caption num-tab text-gray-600">
          {rangeSummary} · {filteredSorted.length.toLocaleString()} of {(txQ.data?.length ?? 0).toLocaleString()} · net <b className={moneyClass(subtotal)}>{fmtUsd(subtotal, { decimals: 2 })}</b>
        </span>

        <div className="ml-auto flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md border border-navy-200 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
            >
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {txQ.isLoading && <StatusPanel kind="loading" message="Loading transactions…" />}
      {txQ.error && (
        <StatusPanel
          kind="error"
          message="Couldn't load transactions."
          detail={(txQ.error as Error).message}
        />
      )}

      {txQ.data && (
        <Card padded={false} className="min-w-0 overflow-hidden">
          <div className="max-h-[820px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-navy-100 bg-gray-50">
                <tr>
                  <th className="whitespace-nowrap px-2 py-2 text-left text-label uppercase text-gray-600">
                    <ColumnFilterPopover label="Date" active={rangeMode !== 'all'}>
                      <div className="w-[180px] space-y-0.5">
                        {(['all', 'ytd', 'month'] as const).map((m) => (
                          <label key={m} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-navy-50">
                            <input
                              type="radio"
                              name="range-mode"
                              checked={rangeMode === m}
                              onChange={() => setRangeMode(m)}
                              className="h-3.5 w-3.5 border-gray-300 accent-navy-700"
                            />
                            <span className="text-navy-800">
                              {m === 'all' ? 'All time' : m === 'ytd' ? `YTD through ${periodLabel}` : periodLabel}
                            </span>
                          </label>
                        ))}
                      </div>
                    </ColumnFilterPopover>
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-left text-label uppercase text-gray-600">
                    <ColumnFilterPopover label="Description" active={!!search.trim()}>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="contains text…"
                        className="w-full rounded-md border border-navy-200 px-2 py-1 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-200"
                      />
                    </ColumnFilterPopover>
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-left text-label uppercase text-gray-600" style={{ width: 148, maxWidth: 148 }}>
                    Account
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-left text-label uppercase text-gray-600">
                    <ColumnFilterPopover label="Category" active={!!categoryId} count={categoryId ? 1 : undefined}>
                      <div className="max-h-[260px] w-[260px] space-y-0.5 overflow-y-auto">
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-navy-50">
                          <input
                            type="radio"
                            name="cat-filter"
                            checked={!categoryId}
                            onChange={() => setCategoryId('')}
                            className="h-3.5 w-3.5 border-gray-300 accent-navy-700"
                          />
                          <span className="text-navy-800">All categories</span>
                        </label>
                        {(categoriesQ.data ?? []).map((c) => (
                          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-navy-50">
                            <input
                              type="radio"
                              name="cat-filter"
                              checked={categoryId === c.id}
                              onChange={() => setCategoryId(c.id)}
                              className="h-3.5 w-3.5 border-gray-300 accent-navy-700"
                            />
                            <CategoryChip name={c.name} />
                          </label>
                        ))}
                      </div>
                    </ColumnFilterPopover>
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-left text-label uppercase text-gray-600">
                    <ColumnFilterPopover label="Group" active={!!groupKey} count={groupKey ? 1 : undefined}>
                      <div className="max-h-[260px] w-[220px] space-y-0.5 overflow-y-auto">
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-navy-50">
                          <input
                            type="radio"
                            name="group-filter"
                            checked={!groupKey}
                            onChange={() => setGroupKey('')}
                            className="h-3.5 w-3.5 border-gray-300 accent-navy-700"
                          />
                          <span className="text-navy-800">All groups</span>
                        </label>
                        {groupOptions.map(({ key, label }) => (
                          <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-navy-50">
                            <input
                              type="radio"
                              name="group-filter"
                              checked={groupKey === key}
                              onChange={() => setGroupKey(key)}
                              className="h-3.5 w-3.5 border-gray-300 accent-navy-700"
                            />
                            <span className="flex-1 truncate text-navy-800">{label}</span>
                          </label>
                        ))}
                      </div>
                    </ColumnFilterPopover>
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-right text-label uppercase text-gray-600">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-10 text-center text-gray-500">
                      No transactions match these filters.
                      {activeFilterCount > 0 && (
                        <button type="button" className="ml-2 font-semibold text-navy-700 underline" onClick={clearAll}>Clear all</button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredSorted.map((t) => (
                    <tr
                      key={t.id}
                      className="cursor-pointer border-b border-navy-100 transition-colors last:border-0 hover:bg-navy-50/40"
                      onClick={() => setDetailTxnId(t.id)}
                    >
                      <td className="px-2 py-1.5 align-middle">
                        <span className="num-tab text-[11px] leading-tight text-gray-700">
                          {formatDate(t.date)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <span className="truncate font-semibold text-navy-900">{t.description}</span>
                      </td>
                      <td className="px-2 py-1.5 align-middle" style={{ width: 148, maxWidth: 148 }}>
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-6 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: accountStripeHex(t.account_id) }}
                          />
                          <span className="truncate text-gray-700">{t.account_name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        {t.category_id && t.category_name ? (
                          <CategoryChip name={t.category_name} className="!text-[11px]" />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-middle text-gray-600">
                        {t.category_group ?? '—'}
                      </td>
                      <td className={`px-2 py-1.5 align-middle text-right text-xs font-semibold tabular-nums num-tab ${moneyClass(t.amount)}`}>
                        {fmtUsd(t.amount, { decimals: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                <tr className="border-t border-navy-100 text-caption">
                  <td className="px-2 py-1.5 text-label uppercase text-gray-500">Totals</td>
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5 text-gray-700 num-tab">
                    in <b className="text-pos">{fmtUsd(-stats.inSum, { decimals: 2 })}</b> · out <b>{fmtUsd(stats.outSum, { decimals: 2 })}</b>
                  </td>
                  <td className={`num-tab px-2 py-1.5 text-right font-bold ${moneyClass(stats.net)}`}>{fmtUsd(stats.net, { decimals: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-navy-100 bg-gray-50 px-3 py-2 text-caption text-gray-600">
            <span className="num-tab">
              {rangeSummary} · {filteredSorted.length.toLocaleString()} of {(txQ.data?.length ?? 0).toLocaleString()} transactions
            </span>
          </div>
        </Card>
      )}

      <TransactionPropertiesDrawer
        open={detailTxnId !== null}
        onClose={() => setDetailTxnId(null)}
        transactionId={detailTxnId}
        schemeId={schemeQ.data ?? null}
      />
    </div>
  );
}
