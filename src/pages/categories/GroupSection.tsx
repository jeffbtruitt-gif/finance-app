import { Card } from '@/components/ds';
import { GROUP_META, NO_GROUP_KEY } from '@/features/categories/constants';
import type { CategoryRow as Cat } from '@/api/categories';
import { CategoryRow } from './CategoryRow';

export function GroupSection(props: {
  groupKey: string;
  items: Cat[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  density: 'comfortable' | 'compact';
  dragMode: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (c: Cat) => void;
  onMerge: (c: Cat) => void;
  onDuplicate: (c: Cat) => void;
  onArchiveRestore: (c: Cat) => void;
  onAddToGroup: (groupName: string) => void;
  dragSrc: string | null;
  dragOver: string | null;
  setDragOver: (id: string | null) => void;
  onRowDragStart: (id: string) => (e: React.DragEvent) => void;
  onRowDragOver: (id: string) => (e: React.DragEvent) => void;
  onRowDrop: (id: string) => (e: React.DragEvent) => void;
}) {
  const {
    groupKey,
    items,
    collapsed,
    onToggleCollapse,
    density,
    dragMode,
    selected,
    onToggleSelect,
    onEdit,
    onMerge,
    onDuplicate,
    onArchiveRestore,
    onAddToGroup,
    dragSrc,
    dragOver,
    setDragOver,
    onRowDragStart,
    onRowDragOver,
    onRowDrop,
  } = props;

  const meta = GROUP_META[groupKey] ?? { tone: 'navy' as const, hint: '' };
  const dotClass = groupKey === 'Yearly' ? 'bg-gold-500' : 'bg-navy-500';

  if (collapsed) {
    return (
      <Card padded={false} className="mb-2">
        <button
          type="button"
          className="flex w-full items-center justify-between border-b border-navy-100 bg-navy-50/60 px-4 py-2.5 text-left"
          onClick={onToggleCollapse}
        >
          <span className="flex items-center gap-2">
            <span className="inline-block text-gray-500" style={{ transform: 'rotate(-90deg)' }}>
              ▼
            </span>
            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
            <span className="text-h4 text-navy-800">
              {groupKey} ({items.length})
            </span>
            <span className="rounded-full border border-navy-100 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-navy-700 num-tab">
              {items.length}
            </span>
          </span>
          <span className="max-w-[55%] truncate text-caption italic text-gray-500">
            {meta.hint}
          </span>
        </button>
      </Card>
    );
  }

  return (
    <Card padded={false} className="mb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between border-b border-navy-100 bg-navy-50/60 px-4 py-2.5 text-left"
        onClick={onToggleCollapse}
      >
        <span className="flex items-center gap-2">
          <span className="inline-block text-gray-500">▼</span>
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          <span className="text-h4 text-navy-800">
            {groupKey} ({items.length})
          </span>
          <span className="rounded-full border border-navy-100 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-navy-700 num-tab">
            {items.length}
          </span>
        </span>
        <span className="max-w-[55%] truncate text-caption italic text-gray-500">
          {meta.hint}
        </span>
      </button>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-caption text-gray-500">
          No categories.
          <button
            type="button"
            className="ml-1 font-semibold text-navy-700 underline"
            onClick={() => onAddToGroup(groupKey === NO_GROUP_KEY ? '' : groupKey)}
          >
            + Add one
          </button>
        </div>
      ) : (
        items.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            density={density}
            dragMode={dragMode}
            selected={selected.has(c.id)}
            onToggleSelect={onToggleSelect}
            onEdit={onEdit}
            onMerge={onMerge}
            onDuplicate={onDuplicate}
            onArchiveRestore={onArchiveRestore}
            showDropAbove={dragMode && dragOver === c.id && dragSrc !== c.id}
            draggable={dragMode}
            onDragStart={onRowDragStart(c.id)}
            onDragOver={onRowDragOver(c.id)}
            onDragLeave={() => setDragOver(null)}
            onDrop={onRowDrop(c.id)}
          />
        ))
      )}

      <div className="border-t border-navy-100 bg-gray-50/50 px-4 py-2">
        <button
          type="button"
          className="text-sm font-semibold text-navy-700 hover:underline"
          onClick={() => onAddToGroup(groupKey === NO_GROUP_KEY ? '' : groupKey)}
        >
          + Add category to {groupKey === NO_GROUP_KEY ? 'uncategorized' : groupKey}
        </button>
      </div>
    </Card>
  );
}
