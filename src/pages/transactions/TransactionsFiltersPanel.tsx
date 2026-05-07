import { Card } from '@/components/ds';
import type { CategoryOption } from '@/api/transactions';
import type { AccountOption } from '@/api/transactions';
import type { DateQuick } from '@/lib/txDatePresets';
import { accountStripeHex } from './txAccountColor';

function Seg({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded px-2 py-1 text-xs font-semibold transition-colors ' +
        (active ? 'bg-white text-navy-800 shadow-sm' : 'text-gray-600 hover:text-navy-800')
      }
    >
      {children}
    </button>
  );
}

export function TransactionsFiltersPanel(props: {
  layout: 'rail' | 'top';
  search: string;
  setSearch: (v: string) => void;
  dateQuick: DateQuick | 'custom';
  setDateQuick: (v: DateQuick | 'custom') => void;
  onPickQuick: (q: DateQuick) => void;
  startDate: string;
  endDate: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  accounts: AccountOption[];
  accountIds: string[];
  toggleAccount: (id: string) => void;
  categories: CategoryOption[];
  categoryNames: string[];
  toggleCategory: (name: string) => void;
  activeFilterCount: number;
  onClearAll: () => void;
}) {
  const {
    layout,
    search,
    setSearch,
    dateQuick,
    onPickQuick,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    accounts,
    accountIds,
    toggleAccount,
    categories,
    categoryNames,
    toggleCategory,
    activeFilterCount,
    onClearAll,
  } = props;

  const q = search.trim().toLowerCase();

  const accountVisible = (a: AccountOption) =>
    !q || a.name.toLowerCase().includes(q) || accountIds.includes(a.id);

  const categoryVisible = (c: CategoryOption) =>
    !q || c.name.toLowerCase().includes(q) || categoryNames.includes(c.name);

  const uncatVisible =
    !q ||
    'uncategorized'.includes(q) ||
    'uncategor'.includes(q) ||
    categoryNames.includes('__uncategorized__');

  const body = (
    <>
      <div className="flex items-center justify-between border-b border-navy-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-navy-900">Filters</span>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-bold text-navy-800 num-tab">
              {activeFilterCount}
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            className="text-xs font-semibold text-navy-700 underline"
            onClick={onClearAll}
          >
            Clear all
          </button>
        )}
      </div>

      <div>
        <div className="text-label mb-1 uppercase text-gray-500">Search</div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="description, account, or category…"
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
        />
      </div>

      <div>
        <div className="text-label mb-1 uppercase text-gray-500">Date range</div>
        <div className="mb-2 inline-flex rounded-md border border-navy-100 bg-gray-50 p-0.5">
          {(['7d', '30d', '90d', 'ytd', 'all'] as DateQuick[]).map((k) => (
            <Seg key={k} active={dateQuick === k} onClick={() => onPickQuick(k)}>
              {k === '7d'
                ? '7d'
                : k === '30d'
                  ? '30d'
                  : k === '90d'
                    ? '90d'
                    : k === 'ytd'
                      ? 'YTD'
                      : 'All'}
            </Seg>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-caption text-gray-600">
            From
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                props.setDateQuick('custom');
              }}
              className="mt-0.5 w-full rounded-md border border-navy-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-caption text-gray-600">
            To
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                props.setDateQuick('custom');
              }}
              className="mt-0.5 w-full rounded-md border border-navy-200 px-2 py-1 text-sm"
            />
          </label>
        </div>
      </div>

      <div>
        <div className="text-label mb-1 uppercase text-gray-500">Accounts</div>
        <div className="flex flex-wrap gap-1.5">
          {accounts.filter(accountVisible).map((a) => {
            const on = accountIds.includes(a.id);
            const stripe = accountStripeHex(a.id);
            return (
              <span key={a.id} className="group relative inline-flex max-w-full items-center">
                <button
                  type="button"
                  onClick={() => toggleAccount(a.id)}
                  className={
                    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ' +
                    (on
                      ? 'border-navy-800 bg-navy-800 text-white'
                      : 'border-navy-200 bg-white text-navy-700 hover:bg-navy-50')
                  }
                >
                  <span className="h-3 w-1 shrink-0 rounded-full" style={{ backgroundColor: stripe }} />
                  <span className="truncate">{a.name}</span>
                </button>
                {a.link && (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${a.name}`}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute -right-1 -top-1 hidden rounded-full border border-navy-200 bg-white p-0.5 shadow-sm transition-colors hover:bg-navy-50 group-hover:flex"
                  >
                    <svg className="h-3 w-3 text-navy-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" />
                      <path d="M9 2h5v5" />
                      <path d="M14 2 7 9" />
                    </svg>
                  </a>
                )}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-label mb-1 uppercase text-gray-500">Categories</div>
        <div className="flex flex-wrap gap-1.5">
          {uncatVisible && (
            <button
              type="button"
              onClick={() => toggleCategory('__uncategorized__')}
              className={
                'rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ' +
                (categoryNames.includes('__uncategorized__')
                  ? 'border-gold-500 bg-gold-100 text-navy-900 shadow-sm'
                  : 'border-navy-200 bg-white text-navy-700 hover:bg-navy-50')
              }
            >
              uncategorized
            </button>
          )}
          {categories.filter(categoryVisible).map((c) => {
            const on = categoryNames.includes(c.name);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.name)}
                className={
                  'max-w-[160px] truncate rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ' +
                  (on
                    ? 'border-navy-800 bg-navy-800 text-white'
                    : 'border-navy-200 bg-white text-navy-700 hover:bg-navy-50')
                }
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  if (layout === 'rail') {
    return (
      <Card className="sticky top-2 h-fit w-[252px] shrink-0 space-y-3 p-3 md:w-[260px] md:p-4">
        {body}
      </Card>
    );
  }

  return (
    <Card className="mb-4 space-y-3 p-4">
      {body}
    </Card>
  );
}
