import type { CategoryRow as Cat } from '@/api/categories';
import { categoryColorHex } from '@/components/ds';
import { CATEGORY_COL_WIDTHS as COL } from './ListHeaderRow';

function GripIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="4" cy="3.5" r="1.2" fill="currentColor" />
      <circle cx="10" cy="3.5" r="1.2" fill="currentColor" />
      <circle cx="4" cy="7" r="1.2" fill="currentColor" />
      <circle cx="10" cy="7" r="1.2" fill="currentColor" />
      <circle cx="4" cy="10.5" r="1.2" fill="currentColor" />
      <circle cx="10" cy="10.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 8V5a2 2 0 012-2h9a2 2 0 012 2v11a2 2 0 01-2 2h-3M8 8H6a2 2 0 00-2 2v11a2 2 0 002 2h9a2 2 0 002-2v-3M8 8h9a2 2 0 012 2v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1-3h10l1 3M6 7v13a1 1 0 001 1h10a1 1 0 001-1V7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v9l4 2M12 5a7 7 0 107 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface CategoryRowProps {
  category: Cat;
  density: 'comfortable' | 'compact';
  dragMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (c: Cat) => void;
  onMerge: (c: Cat) => void;
  onDuplicate: (c: Cat) => void;
  onArchiveRestore: (c: Cat) => void;
  showDropAbove: boolean;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export function CategoryRow({
  category: c,
  density,
  dragMode,
  selected,
  onToggleSelect,
  onEdit,
  onMerge,
  onDuplicate,
  onArchiveRestore,
  showDropAbove,
  draggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: CategoryRowProps) {
  const py = density === 'comfortable' ? 'py-3' : 'py-2';
  const dot = c.color_override ?? categoryColorHex(c.name);
  const archived = c.status === 'archived';

  return (
    <div className="relative group">
      {showDropAbove && (
        <div
          className="drop-indicator absolute left-2 right-2 top-0 z-[1]"
          aria-hidden
        />
      )}
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex items-center border-b border-navy-100 px-4 hover:bg-navy-50/40 ${py} ${
          archived ? 'opacity-60' : ''
        }`}
        style={{ gap: 8 }}
      >
        <div
          style={{ width: COL.drag, flexShrink: 0 }}
          className={`flex justify-center ${dragMode ? '' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <span
            className={`cursor-grab text-gray-300 hover:text-navy-600 ${!draggable ? 'pointer-events-none opacity-40' : ''}`}
          >
            <GripIcon />
          </span>
        </div>
        <div style={{ width: COL.check, flexShrink: 0 }} className="flex justify-center">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-navy-700 focus:ring-navy-300"
            checked={selected}
            onChange={() => onToggleSelect(c.id)}
            aria-label={`Select ${c.name}`}
          />
        </div>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onEdit(c)}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: dot }}
            />
            <span className="text-body-base font-semibold text-navy-900">{c.name}</span>
            {c.is_yearly && (
              <span className="rounded-full border border-gold-300 bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold text-gold-600">
                Yearly
              </span>
            )}
            {archived && (
              <span className="rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                Archived
              </span>
            )}
          </div>
        </button>
        <div
          style={{ width: COL.group, flexShrink: 0 }}
          className="text-caption text-gray-500"
        >
          {c.group_name ? (
            c.group_name
          ) : (
            <span className="italic text-warn">No group</span>
          )}
        </div>
        <div
          className="row-actions flex shrink-0 items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ width: COL.actions }}
        >
          <button
            type="button"
            className="h-7 rounded-md px-2 text-xs font-semibold text-navy-700 hover:bg-navy-100"
            onClick={() => onEdit(c)}
          >
            Edit
          </button>
          <button
            type="button"
            className="h-7 rounded-md px-2 text-xs font-semibold text-navy-700 hover:bg-navy-100"
            onClick={() => onMerge(c)}
          >
            Merge
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-navy-700 hover:bg-navy-100"
            title="Duplicate"
            aria-label="Duplicate"
            onClick={() => onDuplicate(c)}
          >
            <CopyIcon />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-navy-700 hover:bg-navy-100"
            title={archived ? 'Restore' : 'Archive'}
            aria-label={archived ? 'Restore' : 'Archive'}
            onClick={() => onArchiveRestore(c)}
          >
            {archived ? <RestoreIcon /> : <ArchiveIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}
