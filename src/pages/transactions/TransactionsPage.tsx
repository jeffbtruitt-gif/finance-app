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
import { Badge, Button, Card, CategoryChip } from '@/components/ds';
import { TransactionActionBar } from './TransactionActionBar';
import { CategorizeModal } from './CategorizeModal';
import { MakeRuleModal } from './MakeRuleModal';
import { TransactionCategoryCell } from './TransactionCategoryCell';
import { TransactionTripPlaneIcon } from './TransactionTripPlaneIcon';
import { TransactionPropertiesDrawer } from './TransactionPropertiesDrawer';
import { accountStripeHex } from './txAccountColor';
import { ColumnFilterPopover } from './ColumnFilterPopover';
import { AmountFilterPopover } from './AmountFilterPopover';

const PAGE_SIZE_COMPACT = 50;
const PAGE_SIZE_ROOMY = 25;

type Density = 'compact' | 'comfortable';
type AmountDirection = 'all' | 'in' | 'out';

export function TransactionsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const household = useHousehold();
  const { hideIncomeAssets } = usePrivacyMode();

  // ---- Filter state -------------------------------------------------------
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateQuick, setDateQuick] = useState<DateQuick | 'custom'>('all');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>(['__uncategorized__']);
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [amtMin, setAmtMin] = useState<number | null>(null);
  const [amtMax, setAmtMax] = useState<number | null>(null);
  const [direction, setDirection] = useState<AmountDirection>('all');

  // ---- View state ---------------------------------------------------------
  const [density, setDensity] = useState<Density>('compact');
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  // ---- Modals / detail ----------------------------------------------------
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [categorizeIds, setCategorizeIds] = useState<string[]>([]);
  const [makeRuleOpen, setMakeRuleOpen] = useState(false);
  const [detailTxnId, setDetailTxnId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  // ---- Queries ------------------------------------------------------------
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

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of categoriesQ.data ?? []) {
      if (c.group_name) set.add(c.group_name);
    }
    return Array.from(set).sort();
  }, [categoriesQ.data]);

  // ---- Filter compilation -------------------------------------------------
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

  const pageSize = density === 'compact' ? PAGE_SIZE_COMPACT : PAGE_SIZE_ROOMY;
  const txnQ = useQuery({
    queryKey: ['transactions', filters, sortFixed, page, pageSize, schemeId],
    enabled: !!schemeId && categoryFilterReady,
    queryFn: () =>
      fetchTransactions({
        filters,
        sort: sortFixed,
        page,
        pageSize,
        schemeId: schemeId ?? null,
      }),
  });
  const txnSummaryQ = useQuery({
    queryKey: ['transactions', '__summary', filtersForCounts, schemeId],
    enabled: !!schemeId,
    queryFn: () =>
      fetchTransactionCountSummary({ filters: filtersForCounts, schemeId: schemeId! }),
  });

  const rawRows = txnQ.data?.rows ?? [];
  const rows = useMemo(() => {
    return rawRows.filter((r) => {
      if (groupNames.length > 0 && (!r.category_group || !groupNames.includes(r.category_group))) return false;
      const a = Math.abs(r.amount);
      if (amtMin != null && a < amtMin) return false;
      if (amtMax != null && a > amtMax) return false;
      if (direction === 'in' && r.amount >= 0) return false;
      if (direction === 'out' && r.amount < 0) return false;
      return true;
    });
  }, [rawRows, groupNames, amtMin, amtMax, direction]);

  const tripMatchByTxnId = useMemo(() => {
    const m = new Map<string, TripMatch | null>();
    for (const r of rows) {
      m.set(r.id, tripMatchForDate(r.date, tripsForMatch));
    }
    return m;
  }, [rows, tripsForMatch]);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  useEffect(() => {
    const valid = new Set(rows.map((r) => r.id));
    setRowSelection((prev) => {
      const next: Record<string, boolean> = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (next[k] && !valid.has(k)) { delete next[k]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  // ---- Helpers ------------------------------------------------------------
  const onPickQuick = useCallback((q: DateQuick) => {
    setDateQuick(q);
    const r = rangeForQuick(q);
    if (!r) { setStartDate(''); setEndDate(''); }
    else { setStartDate(r.start); setEndDate(r.end); }
    setPage(0);
  }, []);

  const toggleAccount = (id: string) => {
    setAccountIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    setPage(0);
  };
  const toggleCategory = (name: string) => {
    setCategoryNames((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]);
    setPage(0);
  };
  const toggleGroup = (name: string) => {
    setGroupNames((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]);
    setPage(0);
  };

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (accountIds.length > 0 ? 1 : 0) +
    (dateQuick !== 'all' || startDate || endDate ? 1 : 0) +
    (!(categoryNames.length === 1 && categoryNames[0] === '__uncategorized__') ? 1 : 0) +
    (groupNames.length > 0 ? 1 : 0) +
    (amtMin != null || amtMax != null || direction !== 'all' ? 1 : 0);

  const clearAll = useCallback(() => {
    setSearch('');
    setAccountIds([]);
    setCategoryNames(['__uncategorized__']);
    setGroupNames([]);
    setStartDate(''); setEndDate(''); setDateQuick('all');
    setAmtMin(null); setAmtMax(null); setDirection('all');
    setPage(0);
  }, []);

  // ---- Mutations / table / selection --------------------------------------
  const applyMut = useMutation({
    mutationFn: async (args: { ids: string[]; action: Parameters<typeof applyBulkAction>[2] }) => {
      if (!schemeId) throw new Error('No scheme');
      await applyBulkAction(schemeId, args.ids, args.action);
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['transaction_categories'] });
      if (variables.action.type === 'delete') setRowSelection({});
      if (variables.action.type === 'set_category') { showToast('Category updated'); setCategorizeOpen(false); }
    },
  });
  const selectedIds = useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);
  const categoryList = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const pickRowCategory = useCallback(
    async (transactionId: string, categoryId: string) => {
      await applyMut.mutateAsync({ ids: [transactionId], action: { type: 'set_category', category_id: categoryId } });
    },
    [applyMut],
  );

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

  // ---- Columns ------------------------------------------------------------
  const columns = useMemo<ColumnDef<TransactionRow>[]>(() => [
    {
      id: 'select',
      size: 36,
      header: ({ table }) => (
        <div data-no-row-select className="flex justify-center">
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => { if (el) el.indeterminate = table.getIsSomeRowsSelected(); }}
            onChange={table.getToggleAllRowsSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-navy-700 focus:ring-navy-300"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div data-no-row-select className="flex justify-center">
          <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} onClick={(e) => e.stopPropagation()} className="h-4 w-4 cursor-pointer rounded border-gray-300 text-navy-700 focus:ring-navy-300" />
        </div>
      ),
    },
    {
      accessorKey: 'date',
      header: () => (
        <ColumnFilterPopover label="Date" active={dateQuick !== 'all' || !!startDate || !!endDate}>
          <DateRangeFilterContents
            dateQuick={dateQuick}
            startDate={startDate}
            endDate={endDate}
            onPickQuick={onPickQuick}
            onSetStart={(v) => { setStartDate(v); setDateQuick('custom'); setPage(0); }}
            onSetEnd={(v) => { setEndDate(v); setDateQuick('custom'); setPage(0); }}
          />
        </ColumnFilterPopover>
      ),
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
      size: 96,
    },
    {
      accessorKey: 'description',
      header: () => (
        <ColumnFilterPopover label="Description" active={!!search.trim()}>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="contains text…"
            className="w-full rounded-md border border-navy-200 px-2 py-1 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
        </ColumnFilterPopover>
      ),
      cell: ({ row }) => {
        const r = row.original;
        const showRule = !!(r.categorization_rule_id || r.categorization_source === 'rule');
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
      size: 380,
      minSize: 200,
    },
    {
      accessorKey: 'account_name',
      header: () => (
        <ColumnFilterPopover label="Account" active={accountIds.length > 0} count={accountIds.length}>
          <CheckboxList
            items={(accountsQ.data ?? []).map((a) => ({
              id: a.id,
              label: a.name,
              stripeHex: accountStripeHex(a.id),
              checked: accountIds.includes(a.id),
            }))}
            onToggle={toggleAccount}
          />
        </ColumnFilterPopover>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: accountStripeHex(row.original.account_id) }} />
          <span className="truncate text-gray-700">{row.original.account_name}</span>
        </div>
      ),
      size: 160,
    },
    {
      accessorKey: 'category_name',
      header: () => (
        <ColumnFilterPopover
          label="Category"
          active={!(categoryNames.length === 1 && categoryNames[0] === '__uncategorized__')}
          count={categoryNames.length}
        >
          <CategoryCheckboxList
            categoryNames={categoryNames}
            categories={categoryList}
            onToggle={toggleCategory}
          />
        </ColumnFilterPopover>
      ),
      cell: ({ row }) => (
        <TransactionCategoryCell row={row.original} categories={categoryList} onPick={pickRowCategory} />
      ),
      size: 140,
    },
    {
      accessorKey: 'category_group',
      header: () => (
        <ColumnFilterPopover label="Group" active={groupNames.length > 0} count={groupNames.length}>
          <CheckboxList
            items={groupOptions.map((g) => ({ id: g, label: g, checked: groupNames.includes(g) }))}
            onToggle={toggleGroup}
          />
        </ColumnFilterPopover>
      ),
      cell: ({ row }) => (
        <span className="truncate text-gray-600">{row.original.category_group ?? '—'}</span>
      ),
      size: 130,
    },
    {
      accessorKey: 'amount',
      header: () => (
        <AmountFilterPopover
          align="right"
          active={amtMin != null || amtMax != null || direction !== 'all'}
          minValue={amtMin}
          maxValue={amtMax}
          direction={direction}
          onChange={({ min, max, dir }) => {
            setAmtMin(min);
            setAmtMax(max);
            setDirection(dir);
            setPage(0);
          }}
          rows={rawRows}
        />
      ),
      cell: ({ row }) => {
        const a = row.original.amount;
        const cls = a < 0 ? 'text-pos' : 'text-navy-900';
        const shown = hideIncomeAssets && a < 0 ? PRIVACY_USD_PLACEHOLDER : formatMoney(a);
        return <div className={`text-right text-xs font-semibold tabular-nums num-tab ${cls}`}>{shown}</div>;
      },
      size: 104,
    },
  ], [
    dateQuick, startDate, endDate, search,
    accountIds, accountsQ.data,
    categoryNames, categoryList,
    groupNames, groupOptions,
    amtMin, amtMax, direction, rawRows,
    hideIncomeAssets, onPickQuick, pickRowCategory,
    tripMatchByTxnId,
  ]);

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
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const selectedCount = selectedIds.length;
  const stats = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const r of rows) { if (r.amount < 0) inSum += -r.amount; else outSum += r.amount; }
    return { count: rows.length, inSum, outSum, net: outSum - inSum };
  }, [rows]);

  // ---- Render -------------------------------------------------------------
  const rowPad = density === 'compact' ? 'py-1.5' : 'py-2.5';

  return (
    <div className="relative mx-auto max-w-[1600px]">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-pos px-4 py-2.5 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* Page header */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 text-navy-900">Transactions</h1>
          <p className="text-sm text-gray-600">
            Click the funnel icon in any column header to filter that column.
            {activeFilterCount > 0 && <Badge tone="info" className="ml-2">Filtered</Badge>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => showToast('Export coming soon')}>Export</Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/import')}>+ Import</Button>
        </div>
      </div>

      {/* Slim toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative w-[340px] max-w-full">
          <svg viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="5" /><path d="m11 11 3 3" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search descriptions…"
            className="w-full rounded-md border border-navy-200 bg-white py-1.5 pl-8 pr-2 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
        </div>

        <span className="text-caption num-tab text-gray-600">
          {selectedCount > 0 && <><b className="text-navy-800">{selectedCount}</b> selected · </>}
          {stats.count.toLocaleString()} rows · net <b className="text-navy-800">{formatMoney(stats.net)}</b>
          {summaryUncat !== undefined && <> · <b className="text-warn">{summaryUncat.toLocaleString()}</b> uncategorized</>}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-md border border-navy-100 bg-white p-0.5">
            {(['compact', 'comfortable'] as Density[]).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={'rounded px-2 py-0.5 text-xs font-semibold ' + (density === d ? 'bg-navy-800 text-white' : 'text-navy-700 hover:bg-navy-50')}
              >
                {d === 'compact' ? 'Compact' : 'Roomy'}
              </button>
            ))}
          </div>
          {activeFilterCount > 0 && (
            <Button variant="secondary" size="sm" onClick={clearAll}>
              Clear filters ({activeFilterCount})
            </Button>
          )}
        </div>
      </div>

      {/* Selection bar */}
      {selectedIds.length > 0 && (
        <TransactionActionBar
          variant="inline"
          count={selectedIds.length}
          onCategorize={() => { setCategorizeIds(selectedIds); setCategorizeOpen(true); }}
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
            if (confirm(`Delete ${selectedIds.length} transaction(s)? This cannot be undone.`)) {
              applyMut.mutate({ ids: selectedIds, action: { type: 'delete' } });
            }
          }}
          onClear={() => setRowSelection({})}
        />
      )}

      {/* Grid */}
      <Card padded={false} className="min-w-0 overflow-hidden">
        <div className="max-h-[820px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-navy-100 bg-gray-50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const sortDir = h.column.getIsSorted();
                    const canSort = h.column.getCanSort();
                    return (
                      <th
                        key={h.id}
                        style={{ width: h.column.getSize() }}
                        onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                        className={'whitespace-nowrap px-2 py-2 text-left text-label uppercase text-gray-600 ' + (canSort ? 'cursor-pointer hover:bg-navy-50' : '')}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
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
                <tr><td colSpan={columns.length} className="px-2 py-8 text-center text-gray-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={columns.length} className="px-2 py-10 text-center text-gray-500">
                  No transactions match these filters.
                  {activeFilterCount > 0 && (
                    <button type="button" className="ml-2 font-semibold text-navy-700 underline" onClick={clearAll}>Clear all</button>
                  )}
                </td></tr>
              ) : (
                table.getRowModel().rows.map((r) => {
                  const selected = r.getIsSelected();
                  const trip = tripMatchByTxnId.get(r.original.id) ?? null;
                  const rowBg = selected ? 'bg-gold-100/40' : trip ? '' : 'hover:bg-navy-50/40';
                  return (
                    <tr
                      key={r.id}
                      onClick={(e) => {
                        const el = e.target as HTMLElement;
                        if (el.closest('[data-no-row-select]')) return;
                        setDetailTxnId(r.original.id);
                      }}
                      className={`cursor-pointer border-b border-navy-100 border-l-[3px] transition-colors last:border-0 ${rowBg} ${
                        selected ? 'border-l-gold-500' : 'border-l-transparent'
                      }`}
                    >
                      {r.getVisibleCells().map((c) => (
                        <td key={c.id} className={'px-2 align-middle ' + rowPad}>
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-gray-50">
              <tr className="border-t border-navy-100 text-caption">
                <td className="px-2 py-1.5"></td>
                <td className="px-2 py-1.5 text-label uppercase text-gray-500">Totals</td>
                <td className="px-2 py-1.5"></td>
                <td className="px-2 py-1.5"></td>
                <td className="px-2 py-1.5"></td>
                <td className="px-2 py-1.5"></td>
                <td className="px-2 py-1.5 text-gray-700 num-tab">
                  in <b className="text-pos">{formatMoney(-stats.inSum)}</b> · out <b>{formatMoney(stats.outSum)}</b>
                </td>
                <td className="num-tab px-2 py-1.5 text-right font-bold text-navy-900">{formatMoney(stats.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-navy-100 bg-gray-50 px-3 py-2 text-caption text-gray-600">
          <span className="num-tab">
            Page {page + 1} of {totalPages} · {summaryTotal.toLocaleString()} total transactions
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Prev</Button>
            <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
          </div>
        </div>
      </Card>

      {/* Modals + drawer */}
      {schemeId && household && (
        <>
          <CategorizeModal
            open={categorizeOpen}
            onClose={() => setCategorizeOpen(false)}
            seedDescription={(categorizeIds[0] ? rowById.get(categorizeIds[0]) : null)?.description ?? ''}
            categories={categoriesQ.data ?? []}
            onPick={async (categoryId) => {
              await applyMut.mutateAsync({ ids: categorizeIds, action: { type: 'set_category', category_id: categoryId } });
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
              setRowSelection((prev) => { if (!prev[id]) return prev; const n = { ...prev }; delete n[id]; return n; });
            }}
          />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Local sub-components                                                  */
/* -------------------------------------------------------------------- */

function DateRangeFilterContents(props: {
  dateQuick: DateQuick | 'custom';
  startDate: string;
  endDate: string;
  onPickQuick: (q: DateQuick) => void;
  onSetStart: (v: string) => void;
  onSetEnd: (v: string) => void;
}) {
  return (
    <div className="w-[260px] space-y-2">
      <div className="text-label uppercase text-gray-500">Quick</div>
      <div className="grid grid-cols-5 gap-1">
        {(['7d', '30d', '90d', 'ytd', 'all'] as DateQuick[]).map((k) => (
          <button
            key={k}
            onClick={() => props.onPickQuick(k)}
            className={'rounded-md px-2 py-1 text-xs font-semibold ' + (props.dateQuick === k ? 'bg-navy-800 text-white' : 'bg-gray-50 text-navy-700 hover:bg-navy-50')}
          >
            {k === 'ytd' ? 'YTD' : k === 'all' ? 'All' : k}
          </button>
        ))}
      </div>
      <div className="text-label uppercase text-gray-500">Custom</div>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={props.startDate} onChange={(e) => props.onSetStart(e.target.value)} className="rounded-md border border-navy-200 px-2 py-1 text-sm num-tab" />
        <input type="date" value={props.endDate} onChange={(e) => props.onSetEnd(e.target.value)} className="rounded-md border border-navy-200 px-2 py-1 text-sm num-tab" />
      </div>
    </div>
  );
}

function CheckboxList(props: {
  items: Array<{ id: string; label: string; stripeHex?: string; checked: boolean }>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="max-h-[220px] w-[220px] space-y-0.5 overflow-y-auto">
      {props.items.map((it) => (
        <label key={it.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-navy-50">
          <input type="checkbox" checked={it.checked} onChange={() => props.onToggle(it.id)} className="h-3.5 w-3.5 rounded border-gray-300" />
          {it.stripeHex && <span className="h-3.5 w-1 rounded-full" style={{ backgroundColor: it.stripeHex }} />}
          <span className="flex-1 truncate text-navy-800">{it.label}</span>
        </label>
      ))}
    </div>
  );
}

function CategoryCheckboxList(props: {
  categoryNames: string[];
  categories: Array<{ id: string; name: string; group_name: string | null }>;
  onToggle: (name: string) => void;
}) {
  const isOn = (name: string) => props.categoryNames.includes(name);
  return (
    <div className="max-h-[260px] w-[260px] space-y-0.5 overflow-y-auto">
      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-navy-50">
        <input type="checkbox" checked={isOn('__uncategorized__')} onChange={() => props.onToggle('__uncategorized__')} className="h-3.5 w-3.5 rounded border-gray-300" />
        <CategoryChip name={null} />
      </label>
      {props.categories.map((c) => (
        <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-navy-50">
          <input type="checkbox" checked={isOn(c.name)} onChange={() => props.onToggle(c.name)} className="h-3.5 w-3.5 rounded border-gray-300" />
          <CategoryChip name={c.name} />
        </label>
      ))}
    </div>
  );
}
