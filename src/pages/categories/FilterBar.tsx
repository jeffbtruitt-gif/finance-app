import { Card } from '@/components/ds';
import { ALL_GROUPS } from '@/features/categories/constants';

export type StatusFilter = 'active' | 'all' | 'archived';

function SegPill({
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
        'rounded px-2.5 py-1 text-xs font-semibold transition-colors ' +
        (active
          ? 'bg-white text-navy-800 shadow-sm'
          : 'text-gray-600 hover:text-navy-800')
      }
    >
      {children}
    </button>
  );
}

export function FilterBar(props: {
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  query: string;
  setQuery: (v: string) => void;
  groupFilter: 'all' | string;
  setGroupFilter: (v: 'all' | string) => void;
  density: 'comfortable' | 'compact';
  setDensity: (v: 'comfortable' | 'compact') => void;
  dragMode: boolean;
  setDragMode: (v: boolean) => void;
  selectedCount: number;
  onBulkArchive: () => void;
  onBulkChangeGroup: (g: string) => void;
  onClearSelection: () => void;
}) {
  const {
    statusFilter,
    setStatusFilter,
    query,
    setQuery,
    groupFilter,
    setGroupFilter,
    density,
    setDensity,
    dragMode,
    setDragMode,
    selectedCount,
    onBulkArchive,
    onBulkChangeGroup,
    onClearSelection,
  } = props;

  return (
    <Card padded={false} className="mb-3 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-navy-100 bg-gray-50 p-0.5">
          <SegPill active={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>
            Active
          </SegPill>
          <SegPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
            All
          </SegPill>
          <SegPill
            active={statusFilter === 'archived'}
            onClick={() => setStatusFilter('archived')}
          >
            Archived
          </SegPill>
        </div>

        <div className="relative min-w-[160px] max-w-[240px] flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Search categories"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-navy-200 bg-white py-1.5 pl-8 pr-2 text-sm text-navy-900 placeholder:text-gray-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
          />
        </div>

        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value as 'all' | string)}
          className="rounded-md border border-navy-200 bg-white px-2 py-1.5 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-300"
        >
          <option value="all">All groups</option>
          {ALL_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-navy-100 bg-navy-50 px-2 py-1 text-xs text-navy-800">
              <span className="font-semibold">{selectedCount} selected</span>
              <span aria-hidden>·</span>
              <select
                className="max-w-[140px] rounded border border-navy-200 bg-white px-1 py-0.5 text-xs"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    onBulkChangeGroup(e.target.value);
                    e.target.selectedIndex = 0;
                  }
                }}
              >
                <option value="" disabled>
                  Change group…
                </option>
                <option value="__none__">No group</option>
                {ALL_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="font-semibold text-navy-700 underline"
                onClick={onBulkArchive}
              >
                Archive
              </button>
              <button
                type="button"
                className="text-gray-600 hover:text-navy-800"
                onClick={onClearSelection}
              >
                Clear
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setDragMode(!dragMode)}
            className={
              'rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ' +
              (dragMode
                ? 'border-navy-300 bg-navy-100 text-navy-800'
                : 'border-navy-200 bg-white text-navy-700')
            }
          >
            {dragMode ? 'Reordering ✓' : 'Reorder'}
          </button>

          <div className="inline-flex rounded-md border border-navy-100 bg-gray-50 p-0.5">
            <SegPill active={density === 'comfortable'} onClick={() => setDensity('comfortable')}>
              Comf.
            </SegPill>
            <SegPill active={density === 'compact'} onClick={() => setDensity('compact')}>
              Comp.
            </SegPill>
          </div>
        </div>
      </div>
    </Card>
  );
}
