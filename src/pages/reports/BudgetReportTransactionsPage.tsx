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
import { Card, CategoryChip, RT } from '@/components/ds';
import { accountStripeHex } from '@/pages/transactions/txAccountColor';
import { TransactionPropertiesDrawer } from '@/pages/transactions/TransactionPropertiesDrawer';

type RangeMode = 'all' | 'ytd' | 'month';

/** Aligns with monthly report group drill matching (Rent aliases). */
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

  const selectCls =
    'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';
  const fieldLabelCls =
    'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500';

  const periodLabel = formatPeriod(period);

  const rangeSummary =
    rangeMode === 'all'
      ? 'All time'
      : rangeMode === 'ytd'
        ? `YTD through ${periodLabel}`
        : formatPeriod(period);

  return (
    <div>
      <p className="mb-4 text-sm text-gray-600">
        Search and filter transactions. <strong>All</strong> loads your most recent transactions (up to
        8,000). <strong>YTD</strong> is January through the month in the header. <strong>Month</strong>{' '}
        is that month only. Sorted by largest amount first.
      </p>

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className={fieldLabelCls}>Range</label>
            <div className="inline-flex overflow-hidden rounded-md border border-navy-200 text-sm">
              {(['all', 'ytd', 'month'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRangeMode(m)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    rangeMode === m
                      ? 'bg-navy-800 text-white'
                      : 'bg-white text-navy-700 hover:bg-navy-50'
                  }`}
                >
                  {m === 'all' ? 'All' : m === 'ytd' ? 'YTD' : 'Month'}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-[12rem] flex-1 basis-[14rem]">
            <label className={fieldLabelCls} htmlFor="br-tx-search">
              Search
            </label>
            <input
              id="br-tx-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Description, account, or category…"
              autoComplete="off"
              className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
            />
          </div>

          <div>
            <label className={fieldLabelCls}>Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={selectCls}
            >
              <option value="">All categories</option>
              {(categoriesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.group_name ? `${c.group_name} · ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={fieldLabelCls}>Group</label>
            <select
              value={groupKey}
              onChange={(e) => setGroupKey(e.target.value)}
              className={selectCls}
            >
              <option value="">All groups</option>
              {groupOptions.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {txQ.isLoading && <StatusPanel kind="loading" message="Loading transactions…" />}
      {txQ.error && (
        <StatusPanel
          kind="error"
          message="Couldn't load transactions."
          detail={(txQ.error as Error).message}
        />
      )}

      {txQ.data && (
        <Card padded={false}>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-navy-100 bg-navy-50/60 px-4 py-3">
            <span className="text-caption text-gray-500">
              {rangeSummary} · {filteredSorted.length} of {txQ.data.length} transactions
            </span>
            <div className={`text-base font-bold tabular-nums ${moneyClass(subtotal)}`}>
              {fmtUsd(subtotal, { decimals: 2 })}
            </div>
          </div>

          {filteredSorted.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              No transactions match these filters.
            </div>
          ) : (
            <table className={RT.table}>
              <thead className={RT.head}>
                <tr>
                  <th className={`${RT.th} ${RT.thLeft}`}>Date</th>
                  <th className={`${RT.th} ${RT.thLeft}`}>Description</th>
                  <th className={`${RT.th} ${RT.thLeft} w-[148px] max-w-[148px]`}>Account</th>
                  <th className={`${RT.th} ${RT.thLeft}`}>Category</th>
                  <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
                  <th className={`${RT.th} ${RT.thRight}`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((t) => (
                  <tr
                    key={t.id}
                    className={`${RT.detailRow} cursor-pointer hover:bg-navy-50/50`}
                    onClick={() => setDetailTxnId(t.id)}
                  >
                    <td className={`${RT.cellLeft} tabular-nums text-gray-600`}>
                      {formatDate(t.date)}
                    </td>
                    <td className={`${RT.cellLeft} font-medium text-navy-900`}>{t.description}</td>
                    <td className={`${RT.cellLeft} w-[148px] max-w-[148px]`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-6 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: accountStripeHex(t.account_id) }}
                        />
                        <span className="truncate text-gray-700">{t.account_name}</span>
                      </div>
                    </td>
                    <td className={RT.cellLeft}>
                      {t.category_id && t.category_name ? (
                        <CategoryChip name={t.category_name} className="!text-[11px]" />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={`${RT.cellLeft} text-gray-600`}>
                      {t.category_group ?? '—'}
                    </td>
                    <td className={`${RT.cellRight} font-semibold tabular-nums ${moneyClass(t.amount)}`}>
                      {fmtUsd(t.amount, { decimals: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
