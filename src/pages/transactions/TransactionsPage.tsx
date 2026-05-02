import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  fetchTransactions,
  type TransactionFilters,
} from '@/api/transactions';
import type { TransactionRow } from '@/types';
import { formatDate } from '@/lib/date';
import { formatMoney, moneyClass } from '@/lib/money';

const PAGE_SIZE = 100;

export function TransactionsPage() {
  // Filter state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);

  // Reset to page 0 when filters change
  const filters: TransactionFilters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    accountIds: accountIds.length > 0 ? accountIds : undefined,
    categoryIds: categoryNames.length > 0 ? categoryNames : undefined,
    search: search || undefined,
  };

  const sort = sorting[0]
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

  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  });

  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const txnQ = useQuery({
    queryKey: ['transactions', filters, sort, page],
    queryFn: () =>
      fetchTransactions({ filters, sort, page, pageSize: PAGE_SIZE }),
  });

  const columns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => formatDate(row.original.date),
        size: 100,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <span className="font-medium text-slate-800">{row.original.description}</span>
        ),
      },
      {
        accessorKey: 'account_name',
        header: 'Account',
        cell: ({ row }) => (
          <span className="text-slate-600">{row.original.account_name}</span>
        ),
        size: 140,
      },
      {
        accessorKey: 'category_name',
        header: 'Category',
        cell: ({ row }) =>
          row.original.category_name ? (
            <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {row.original.category_name}
            </span>
          ) : (
            <span className="text-xs italic text-slate-400">uncategorized</span>
          ),
        size: 160,
      },
      {
        accessorKey: 'amount',
        header: () => <div className="text-right">Amount</div>,
        cell: ({ row }) => (
          <div className={`text-right tabular-nums ${moneyClass(row.original.amount)}`}>
            {formatMoney(row.original.amount)}
          </div>
        ),
        size: 120,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: txnQ.data?.rows ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalCount = txnQ.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setAccountIds([]);
    setCategoryNames([]);
    setSearch('');
    setPage(0);
  };

  const hasFilters =
    startDate || endDate || accountIds.length || categoryNames.length || search;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-slate-500">
            {totalCount.toLocaleString()} transaction{totalCount === 1 ? '' : 's'}
            {hasFilters ? ' (filtered)' : ''}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="description contains…"
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(0);
              }}
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(0);
              }}
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Account chips */}
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-slate-700">Accounts</div>
          <div className="flex flex-wrap gap-1.5">
            {(accountsQ.data ?? []).map((a) => {
              const active = accountIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleAccount(a.id)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category chips */}
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-slate-700">Categories</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => toggleCategory('__uncategorized__')}
              className={`rounded-full border px-2.5 py-0.5 text-xs italic ${
                categoryNames.includes('__uncategorized__')
                  ? 'border-amber-700 bg-amber-700 text-white'
                  : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              uncategorized
            </button>
            {(categoriesQ.data ?? []).map((c) => {
              const active = categoryNames.includes(c.name);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.name)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {hasFilters && (
          <div className="mt-3">
            <button
              onClick={clearFilters}
              className="text-xs text-slate-500 underline hover:text-slate-700"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.column.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer select-none px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sortDir === 'asc' && <span className="ml-1">↑</span>}
                      {sortDir === 'desc' && <span className="ml-1">↓</span>}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {txnQ.isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : txnQ.error ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-rose-600">
                  Error: {(txnQ.error as Error).message}
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  No transactions match these filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <div>
          Page {page + 1} of {totalPages}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
