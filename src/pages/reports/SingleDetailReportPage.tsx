import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchSchemeCategories,
  fetchCategoryTransactions,
} from '@/api/reports';
import { fmtUsd } from '@/lib/money';
import {
  formatPeriod,
  periodStartIso,
  periodEndIso,
  yearStartIso,
} from '@/lib/period';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { formatDate } from '@/lib/date';
import { StatusPanel } from '@/components/StatusPanel';
import { Card, CategoryChip, RT } from '@/components/ds';
import { TransactionPropertiesDrawer } from '@/pages/transactions/TransactionPropertiesDrawer';

type RangeMode = 'month' | 'ytd' | 'all';

export function SingleDetailReportPage() {
  const household = useHousehold();
  const { period } = useAppPeriod();
  const [mode, setMode] = useState<RangeMode>('month');
  const [categoryId, setCategoryId] = useState<string>('');
  const [descriptionSearch, setDescriptionSearch] = useState('');
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

  const range = useMemo(() => {
    if (mode === 'all') return { from: undefined, to: undefined };
    if (mode === 'ytd') {
      return { from: yearStartIso(period.year), to: periodEndIso(period) };
    }
    return { from: periodStartIso(period), to: periodEndIso(period) };
  }, [mode, period]);

  const txQ = useQuery({
    queryKey: [
      'category-transactions',
      household?.id,
      schemeQ.data,
      categoryId,
      range.from,
      range.to,
    ],
    enabled: !!household?.id && !!schemeQ.data && !!categoryId,
    queryFn: () =>
      fetchCategoryTransactions({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        category_id: categoryId === '__all__' ? undefined : categoryId,
        from: range.from,
        to: range.to,
      }),
  });

  const filteredTransactions = useMemo(() => {
    const rows = txQ.data;
    if (!rows?.length) return [];
    const q = descriptionSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) => t.description.toLowerCase().includes(q));
  }, [txQ.data, descriptionSearch]);

  const subtotal = useMemo(
    () => filteredTransactions.reduce((acc, t) => acc + t.amount, 0),
    [filteredTransactions],
  );

  const totalInRange = txQ.data?.length ?? 0;
  const searchActive = descriptionSearch.trim().length > 0;

  const isAllCategories = categoryId === '__all__';
  const selectedCategory = isAllCategories
    ? null
    : (categoriesQ.data?.find((c) => c.id === categoryId) ?? null);

  const selectCls =
    'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';
  const fieldLabelCls =
    'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500';

  return (
    <div>
      <p className="mb-4 text-sm text-gray-600">
        Drill into one category and see every transaction. Month and YTD use the period in the
        header above.
      </p>

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className={fieldLabelCls}>Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={selectCls}
            >
              <option value="">— Select category —</option>
              <option value="__all__">All</option>
              {categoriesQ.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.group_name ? `${c.group_name} · ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={fieldLabelCls}>Range</label>
            <div className="inline-flex overflow-hidden rounded-md border border-navy-200 text-sm">
              {(['month', 'ytd', 'all'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    mode === m
                      ? 'bg-navy-800 text-white'
                      : 'bg-white text-navy-700 hover:bg-navy-50'
                  }`}
                >
                  {m === 'month' ? 'Month' : m === 'ytd' ? 'YTD' : 'All time'}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-[12rem] flex-1 basis-full sm:basis-auto sm:max-w-md">
            <label className={fieldLabelCls} htmlFor="single-detail-desc-search">
              Search description
            </label>
            <input
              id="single-detail-desc-search"
              type="search"
              value={descriptionSearch}
              onChange={(e) => setDescriptionSearch(e.target.value)}
              placeholder="Filter by description…"
              disabled={!categoryId}
              autoComplete="off"
              className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>
      </Card>

      {!categoryId && (
        <StatusPanel kind="empty" message="Pick a category to see its transactions." />
      )}

      {categoryId && txQ.isLoading && <StatusPanel kind="loading" message="Loading…" />}

      {categoryId && txQ.error && (
        <StatusPanel
          kind="error"
          message="Couldn't load transactions."
          detail={(txQ.error as Error).message}
        />
      )}

      {categoryId && txQ.data && (
        <Card padded={false}>
          <div className="flex items-baseline justify-between border-b border-navy-100 bg-navy-50/60 px-4 py-3">
            <div className="flex items-baseline gap-3">
              {isAllCategories
                ? <CategoryChip name="All Categories" />
                : selectedCategory && <CategoryChip name={selectedCategory.name} />}
              <span className="text-caption text-gray-500">
                {mode === 'all'
                  ? 'All time'
                  : mode === 'ytd'
                    ? `Jan – ${formatPeriod(period)}`
                    : formatPeriod(period)}
                {' · '}
                {searchActive
                  ? `${filteredTransactions.length} of ${totalInRange} transactions`
                  : `${totalInRange} transactions`}
              </span>
            </div>
            <div className="text-base font-bold tabular-nums text-navy-900">
              {fmtUsd(subtotal)}
            </div>
          </div>

          {totalInRange === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              No transactions in this range.
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              No transactions match this description search.
            </div>
          ) : (
            <table className={RT.table}>
              <thead className={RT.head}>
                <tr>
                  <th className={`${RT.th} ${RT.thLeft}`}>Date</th>
                  <th className={`${RT.th} ${RT.thLeft}`}>Description</th>
                  <th className={`${RT.th} ${RT.thLeft}`}>Account</th>
                  <th className={`${RT.th} ${RT.thRight}`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t) => (
                  <tr
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailTxnId(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailTxnId(t.id);
                      }
                    }}
                    className={`${RT.detailRow} cursor-pointer hover:bg-navy-50/50`}
                  >
                    <td className={`${RT.cellLeft} tabular-nums text-gray-700`}>
                      {formatDate(t.date)}
                    </td>
                    <td className={`${RT.cellLeft} font-medium text-navy-900`}>
                      {t.description}
                    </td>
                    <td className={`${RT.cellLeft} text-gray-500`}>
                      {t.account_name}
                    </td>
                    <td className={RT.cellRight}>
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
