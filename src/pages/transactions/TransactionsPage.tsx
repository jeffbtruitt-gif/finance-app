import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  fetchAccounts,
  fetchCategories,
  fetchTransactionCountSummary,
  fetchTransactions,
  type TransactionFilters,
} from '@/api/transactions';
import { applyBulkAction } from '@/api/phase2';
import { fetchTrips } from '@/api/trips';
import { useHousehold } from '@/api/household';
import {
  tripMatchForDate,
  type TripForMatching,
  type TripMatch,
} from '@/features/trips/matcher';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import type { TransactionRow } from '@/types';
import { formatDate } from '@/lib/date';
import { formatMoney } from '@/lib/money';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { PRIVACY_USD_PLACEHOLDER } from '@/lib/privacyMoney';
import { rangeForQuick, type DateQuick } from '@/lib/txDatePresets';
import { Badge, Button, Card } from '@/components/ds';
import { TransactionsFiltersPanel } from './TransactionsFiltersPanel';
import { TransactionActionBar } from './TransactionActionBar';
import { CategorizeModal } from './CategorizeModal';
import { MakeRuleModal } from './MakeRuleModal';
import { TransactionCategoryCell } from './TransactionCategoryCell';
import { TransactionTripPlaneIcon } from './TransactionTripPlaneIcon';
import { TransactionPropertiesDrawer } from './TransactionPropertiesDrawer';
import { accountStripeHex } from './txAccountColor';

const PAGE_SIZE = 25;

/** Final layout: left filter rail, inline selection banner, compact table, rule chips on. */
const ACTION_BAR: 'floating' | 'inline' = 'inline';
const SHOW_RULE_CHIPS = true;
const ROW_MIN_H = 'min-h-[38px]';

export function TransactionsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const household = useHousehold();
  const { hideIncomeAssets } = usePrivacyMode();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateQuick, setDateQuick] = useState<DateQuick | 'custom'>('all');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>(['__uncategorized__']);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [categorizeIds, setCategorizeIds] = useState<string[]>([]);
  const [makeRuleOpen, setMakeRuleOpen] = useState(false);
  const [detailTxnId, setDetailTxnId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const schemeQuery = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });
  const schemeId = schemeQuery.data;

  const categoriesQ = useQuery({
    queryKey: ['categories', schemeId],
    enabled: !!schemeId,
    queryFn: () => fetchCategories(schemeId!),
  });

  const namedCategoryChips = useMemo(
    () => categoryNames.filter((n) => n !== '__uncategorized__'),
    [categoryNames],
  );

  const schemeCategoryIds = useMemo(() => {
    const list = categoriesQ.data;
    if (!list || namedCategoryChips.length === 0) return [];
    const ids: string[] = [];
    for (const name of namedCategoryChips) {
      const c = list.find((x) => x.name === name);
      if (c) ids.push(c.id);
    }
    return ids;
  }, [namedCategoryChips, categoriesQ.data]);

  /** Wait until named chips map to UUIDs so pagination uses the category-filter RPC. */
  const categoryFilterReady =
    namedCategoryChips.length === 0 ||
    schemeCategoryIds.length === namedCategoryChips.length;

  const filters: TransactionFilters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    accountIds: accountIds.length > 0 ? accountIds : undefined,
    categoryIds: categoryNames.length > 0 ? categoryNames : undefined,
    schemeCategoryIds: schemeCategoryIds.length > 0 ? schemeCategoryIds : undefined,
    includeUncategorized: categoryNames.includes('__uncategorized__'),
    search: search || undefined,
  };

  /** Same scope as list totals (date, accounts, search) — not narrowed by category chip filter. */
  const filtersForCounts = useMemo(
    (): TransactionFilters => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      search: search || undefined,
    }),
    [startDate, endDate, accountIds, search],
  );

  const sortFixed = sorting[0]
    ? {
        column: sorting[0].id as
          | 'date'
          | 'amount'
          | 'description'
          | 'category_name'
          | 'account_name',
        direction: (sorting[0].desc ? 'desc' : 'asc') as 'asc' | 'desc',
      }
    : undefined;

  const accountsQ = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const tripsQ = useQuery({
    queryKey: ['trips', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchTrips(household!.id),
  });
  const tripsForMatch = useMemo((): TripForMatching[] => {
    const list = tripsQ.data ?? [];
    return list.map((t) => ({
      id: t.id,
      name: t.name,
      start_date: t.start_date,
      end_date: t.end_date,
    }));
  }, [tripsQ.data]);

  const txnQ = useQuery({
    queryKey: ['transactions', filters, sortFixed, page, schemeId],
    enabled: !!schemeId && categoryFilterReady,
    queryFn: () =>
      fetchTransactions({
        filters,
        sort: sortFixed,
        page,
        pageSize: PAGE_SIZE,
        schemeId: schemeId ?? null,
      }),
  });

  const txnSummaryQ = useQuery({
    queryKey: ['transactions', '__summary', filtersForCounts, schemeId],
    enabled: !!schemeId,
    queryFn: () =>
      fetchTransactionCountSummary({ filters: filtersForCounts, schemeId: schemeId! }),
  });

  const rows = txnQ.data?.rows ?? [];
  const tripMatchByTxnId = useMemo(() => {
    const m = new Map<string, TripMatch | null>();
    for (const r of rows) {
      m.set(r.id, tripMatchForDate(r.date, tripsForMatch));
    }
    return m;
  }, [rows, tripsForMatch]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  /** Drop selection for rows that disappeared (e.g. refetch after categorize / rule backfill). */
  useEffect(() => {
    const valid = new Set(rows.map((r) => r.id));
    setRowSelection((prev) => {
      const next: Record<string, boolean> = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (next[k] && !valid.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const onPickQuick = useCallback(
    (q: DateQuick) => {
      setDateQuick(q);
      const r = rangeForQuick(q);
      if (!r) {
        setStartDate('');
        setEndDate('');
      } else {
        setStartDate(r.start);
        setEndDate(r.end);
      }
      setPage(0);
    },
    [setPage],
  );

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n++;
    if (accountIds.length > 0) n++;
    if (dateQuick !== 'all') n++;
    const defaultCat =
      categoryNames.length === 1 && categoryNames[0] === '__uncategorized__';
    if (!defaultCat) n++;
    return n;
  }, [search, accountIds, dateQuick, categoryNames]);

  const clearAll = useCallback(() => {
    setSearch('');
    setAccountIds([]);
    setCategoryNames(['__uncategorized__']);
    setStartDate('');
    setEndDate('');
    setDateQuick('all');
    setPage(0);
  }, []);

  const toggleAccount = (id: string) => {
    setAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setPage(0);
  };

  const toggleCategory = (name: string) => {
    setCategoryNames((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
    setPage(0);
  };

  const schemeIdForMut = schemeId;
  const applyMut = useMutation({
    mutationFn: async (args: { ids: string[]; action: Parameters<typeof applyBulkAction>[2] }) => {
      if (!schemeIdForMut) throw new Error('No scheme');
      await applyBulkAction(schemeIdForMut, args.ids, args.action);
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['transaction_categories'] });
      if (variables.action.type === 'delete') setRowSelection({});
      if (variables.action.type === 'set_category') {
        showToast('Category updated');
        setCategorizeOpen(false);
      }
    },
  });

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );

  const categoryList = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);

  const pickRowCategory = useCallback(
    async (transactionId: string, categoryId: string) => {
      await applyMut.mutateAsync({
        ids: [transactionId],
        action: { type: 'set_category', category_id: categoryId },
      });
    },
    [applyMut],
  );

  const columns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        id: 'select',
        size: 36,
        header: ({ table }) => (
          <div data-no-row-select className="flex justify-center">
            <input
              type="checkbox"
              checked={table.getIsAllRowsSelected()}
              ref={(el) => {
                if (el) el.indeterminate = table.getIsSomeRowsSelected();
              }}
              onChange={table.getToggleAllRowsSelectedHandler()}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-navy-700 focus:ring-navy-300"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div data-no-row-select className="flex justify-center">
            <input
              type="checkbox"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-navy-700 focus:ring-navy-300"
            />
          </div>
        ),
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => {
          const trip = tripMatchByTxnId.get(row.original.id) ?? null;
          return (
            <span className="flex items-center gap-1.5">
              {row.original.flag_for_review ? (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500"
                  title="Flagged for review"
                />
              ) : null}
              {trip ? <TransactionTripPlaneIcon title={trip.trip_name} /> : null}
              <span className="num-tab text-[11px] leading-tight text-gray-700">
                {formatDate(row.original.date)}
              </span>
            </span>
          );
        },
        size: 92,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 380,
        minSize: 160,
        cell: ({ row }) => {
          const r = row.original;
          const showRule =
            SHOW_RULE_CHIPS &&
            !!(r.categorization_rule_id || r.categorization_source === 'rule');
          return (
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold text-navy-900">
                {r.description}
              </span>
              {showRule && (
                <Badge tone="info" className="shrink-0 align-middle text-[10px]">
                  rule
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'account_name',
        header: 'Account',
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-6 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: accountStripeHex(row.original.account_id) }}
            />
            <span className="truncate text-gray-700">{row.original.account_name}</span>
          </div>
        ),
        size: 148,
      },
      {
        accessorKey: 'category_name',
        header: 'Category',
        cell: ({ row }) => (
          <TransactionCategoryCell
            row={row.original}
            categories={categoryList}
            onPick={pickRowCategory}
          />
        ),
        size: 96,
      },
      {
        accessorKey: 'amount',
        header: () => <div className="text-right">Amount</div>,
        cell: ({ row }) => {
          const a = row.original.amount;
          const cls = a < 0 ? 'text-pos' : 'text-navy-900';
          const shown =
            hideIncomeAssets && a < 0 ? PRIVACY_USD_PLACEHOLDER : formatMoney(a);
          return (
            <div className={`text-right text-xs font-semibold tabular-nums num-tab ${cls}`}>
              {shown}
            </div>
          );
        },
        size: 96,
      },
    ],
    [categoryList, pickRowCategory, tripMatchByTxnId, hideIncomeAssets],
  );

  const openDetail = useCallback((row: TransactionRow) => setDetailTxnId(row.id), []);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => row.id,
    manualSorting: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalCount = txnQ.data?.totalCount ?? 0;
  const summaryTotal = txnSummaryQ.data?.total ?? totalCount;
  const summaryUncat = txnSummaryQ.data?.uncategorized;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const selectedCount = selectedIds.length;
  const selectedLabel = `${selectedCount.toLocaleString()} transaction${selectedCount === 1 ? '' : 's'} selected`;
  const uncatLabel =
    summaryUncat === undefined
      ? '… transactions not categorized'
      : `${summaryUncat.toLocaleString()} transaction${summaryUncat === 1 ? '' : 's'} not categorized`;
  const totalLabel = `${summaryTotal.toLocaleString()} total transaction${summaryTotal === 1 ? '' : 's'}`;

  const footerStats = useMemo(() => {
    const net = rows.reduce((s, r) => s + r.amount, 0);
    const inSum = rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
    const outSum = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    return { net, inSum, outSum, n: rows.length };
  }, [rows]);

  const makeRuleSeed = useMemo(() => {
    for (const id of selectedIds) {
      const row = rowById.get(id);
      if (row) return row;
    }
    return null;
  }, [selectedIds, rowById]);

  useEffect(() => {
    if (makeRuleOpen && !makeRuleSeed) setMakeRuleOpen(false);
  }, [makeRuleOpen, makeRuleSeed]);

  const filterPanel = (
    <TransactionsFiltersPanel
      layout="rail"
      search={search}
      setSearch={(v) => {
        setSearch(v);
        setPage(0);
      }}
      dateQuick={dateQuick}
      setDateQuick={setDateQuick}
      onPickQuick={onPickQuick}
      startDate={startDate}
      endDate={endDate}
      setStartDate={(v) => {
        setStartDate(v);
        setPage(0);
      }}
      setEndDate={(v) => {
        setEndDate(v);
        setPage(0);
      }}
      accounts={accountsQ.data ?? []}
      accountIds={accountIds}
      toggleAccount={toggleAccount}
      categories={categoriesQ.data ?? []}
      categoryNames={categoryNames}
      toggleCategory={toggleCategory}
      activeFilterCount={activeFilterCount}
      onClearAll={clearAll}
    />
  );

  const actionBar =
    selectedIds.length > 0 ? (
      <TransactionActionBar
        variant={ACTION_BAR}
        count={selectedIds.length}
        onCategorize={() => {
          setCategorizeIds(selectedIds);
          setCategorizeOpen(true);
        }}
        onMakeRule={() => {
          const hasOnPage = selectedIds.some((id) => rowById.has(id));
          if (!hasOnPage) {
            showToast('Selection is not on this page anymore. Clear and pick rows here.');
            return;
          }
          setMakeRuleOpen(true);
        }}
        onTrip={() => showToast('Trip picker coming soon')}
        onTag={() => showToast('Tag picker coming soon')}
        onDelete={() => {
          if (
            confirm(
              `Delete ${selectedIds.length} transaction(s)? This cannot be undone.`,
            )
          ) {
            applyMut.mutate({ ids: selectedIds, action: { type: 'delete' } });
          }
        }}
        onClear={() => setRowSelection({})}
      />
    ) : null;

  const tableBlock = (
    <Card padded={false} className="min-w-0 flex-1 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-navy-100 bg-navy-50/60">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.column.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer select-none whitespace-nowrap px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-600 hover:bg-navy-100/60"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sortDir === 'asc' && <span className="ml-1 text-navy-700">↑</span>}
                      {sortDir === 'desc' && <span className="ml-1 text-navy-700">↓</span>}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {txnQ.isLoading ? (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : txnQ.error ? (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-neg">
                  {(txnQ.error as Error).message}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-10 text-center text-gray-500">
                  No transactions match these filters.
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      className="ml-2 font-semibold text-navy-700 underline"
                      onClick={clearAll}
                    >
                      Clear all
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) =>
                renderRow(
                  row.original,
                  table,
                  ROW_MIN_H,
                  tripMatchByTxnId.get(row.original.id) ?? null,
                  openDetail,
                ),
              )
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 bg-gray-50 px-4 py-2.5 text-caption text-gray-600">
        <div className="num-tab">
          {footerStats.n} on this page · net{' '}
          {hideIncomeAssets ? PRIVACY_USD_PLACEHOLDER : formatMoney(footerStats.net)} · in{' '}
          {hideIncomeAssets ? PRIVACY_USD_PLACEHOLDER : formatMoney(-footerStats.inSum)} · out{' '}
          {formatMoney(footerStats.outSum)}
        </div>
        <div className="flex items-center gap-2">
          <span>
            Page <span className="font-semibold text-navy-800">{page + 1}</span> /{' '}
            {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="relative mx-auto max-w-[1600px]">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-pos px-4 py-2.5 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {actionBar}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-600">
            <span className="num-tab">
              {selectedLabel} · {uncatLabel} · {totalLabel}
            </span>
            {activeFilterCount > 0 && (
              <Badge tone="info" className="ml-2">
                Filtered
              </Badge>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => showToast('Export coming soon')}>
            Export
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/import')}>
            + Import
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        {filterPanel}
        <div className="min-w-0 flex-1 space-y-3">{tableBlock}</div>
      </div>

      {schemeId && household && (
        <>
          <CategorizeModal
            open={categorizeOpen}
            onClose={() => setCategorizeOpen(false)}
            seedDescription={
              (categorizeIds[0] ? rowById.get(categorizeIds[0]) : null)?.description ?? ''
            }
            categories={categoriesQ.data ?? []}
            onPick={async (categoryId) => {
              await applyMut.mutateAsync({
                ids: categorizeIds,
                action: { type: 'set_category', category_id: categoryId },
              });
            }}
          />
          <MakeRuleModal
            open={makeRuleOpen}
            onClose={() => setMakeRuleOpen(false)}
            seed={makeRuleSeed}
            householdId={household.id}
            schemeId={schemeId}
            categories={categoriesQ.data ?? []}
            accounts={(accountsQ.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ['transactions'] });
              qc.invalidateQueries({ queryKey: ['transaction_categories'] });
              qc.invalidateQueries({ queryKey: ['rules'] });
              setRowSelection({});
            }}
            toast={showToast}
          />
          <TransactionPropertiesDrawer
            open={detailTxnId !== null}
            onClose={() => setDetailTxnId(null)}
            transactionId={detailTxnId}
            schemeId={schemeId ?? null}
            seedRow={detailTxnId ? rowById.get(detailTxnId) ?? null : null}
            onDeleted={(id) => {
              setRowSelection((prev) => {
                if (!prev[id]) return prev;
                const next = { ...prev };
                delete next[id];
                return next;
              });
            }}
          />
        </>
      )}

    </div>
  );
}

function renderRow(
  r: TransactionRow,
  table: ReturnType<typeof useReactTable<TransactionRow>>,
  rowMinH: string,
  trip: TripMatch | null,
  onOpenDetail: (row: TransactionRow) => void,
) {
  const row = table.getRow(r.id);
  if (!row) return null;
  const selected = row.getIsSelected();
  const rowBg = selected ? 'bg-gold-100/40' : trip ? '' : 'hover:bg-navy-50/40';
  const tripHighlight = !selected && trip ? 'txn-row-trip-highlight' : '';
  return (
    <tr
      key={r.id}
      onClick={(e) => {
        const el = e.target as HTMLElement;
        if (el.closest('[data-no-row-select]')) return;
        onOpenDetail(r);
      }}
      className={`cursor-pointer border-b border-navy-100 border-l-[3px] transition-colors last:border-0 ${rowMinH} ${rowBg} ${tripHighlight} ${
        selected ? 'border-l-gold-500' : 'border-l-transparent'
      }`}
    >
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          className={`px-2 py-2 align-middle ${
            cell.column.id === 'description' ? 'max-w-0 overflow-hidden' : ''
          }`}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}
