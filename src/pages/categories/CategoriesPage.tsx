import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DragEvent } from 'react';
import { useHousehold } from '@/api/household';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import { Button } from '@/components/ds';
import { StatusPanel } from '@/components/StatusPanel';
import { ALL_GROUPS, NO_GROUP_KEY } from '@/features/categories/constants';
import type { CategoryRow as Cat } from '@/api/categories';
import {
  listCategories,
  createCategory,
  updateCategory,
  reorderCategories,
  archiveCategory,
  restoreCategory,
} from '@/api/categories';
import { rebuildFullOrderAfterVisibleReorder, sortByOrder } from './orderUtils';
import { CountStrip, type CategoryCounts } from './CountStrip';
import { FilterBar, type StatusFilter } from './FilterBar';
import { ListHeaderRow } from './ListHeaderRow';
import { GroupSection } from './GroupSection';
import type { DrawerMode } from './CategoryEditDrawer';
import { CategoryEditDrawer } from './CategoryEditDrawer';
import { MergeDialog } from './MergeDialog';

function invalidateCategoryRelated(qc: ReturnType<typeof useQueryClient>, schemeId: string) {
  qc.invalidateQueries({ queryKey: ['categories', schemeId] });
  qc.invalidateQueries({ queryKey: ['scheme-categories'] });
  qc.invalidateQueries({ queryKey: ['rules'] });
  qc.invalidateQueries({ queryKey: ['categories'] });
  qc.invalidateQueries({ queryKey: ['transaction_categories'] });
  qc.invalidateQueries({ queryKey: ['budget-year'] });
}

function buildGrouped(filtered: Cat[]): [string, Cat[]][] {
  const m = new Map<string, Cat[]>();
  for (const g of ALL_GROUPS) m.set(g, []);
  for (const c of filtered) {
    const key = c.group_name ?? NO_GROUP_KEY;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(c);
  }
  const used = new Set<string>();
  const ordered: [string, Cat[]][] = [];
  for (const g of ALL_GROUPS) {
    const arr = m.get(g);
    if (arr?.length) {
      ordered.push([g, arr]);
      used.add(g);
    }
  }
  const extras = [...m.keys()]
    .filter((k) => !used.has(k) && k !== NO_GROUP_KEY)
    .sort((a, b) => a.localeCompare(b));
  for (const k of extras) {
    const arr = m.get(k);
    if (arr?.length) ordered.push([k, arr]);
  }
  const no = m.get(NO_GROUP_KEY);
  if (no?.length) ordered.push([NO_GROUP_KEY, no]);
  return ordered;
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CategoriesPage() {
  const qc = useQueryClient();
  const household = useHousehold();
  const [toast, setToast] = useState<string | null>(null);

  const schemeQuery = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });

  const schemeId = schemeQuery.data;

  const categoriesQuery = useQuery({
    queryKey: ['categories', schemeId],
    enabled: !!schemeId,
    queryFn: () => listCategories(schemeId!),
  });

  const categories = categoriesQuery.data ?? [];

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [groupFilter, setGroupFilter] = useState<'all' | string>('all');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [dragMode, setDragMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>({ mode: 'new' });
  const [mergeSrc, setMergeSrc] = useState<Cat | null>(null);
  const [drag, setDrag] = useState<{ src: string | null; over: string | null }>({
    src: null,
    over: null,
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const filtered = useMemo(() => {
    return categories.filter((c) => {
      if (statusFilter === 'active' && c.status !== 'active') return false;
      if (statusFilter === 'archived' && c.status !== 'archived') return false;
      if (groupFilter !== 'all' && c.group_name !== groupFilter) return false;
      if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [categories, statusFilter, groupFilter, query]);

  const grouped = useMemo(() => buildGrouped(filtered), [filtered]);

  const counts: CategoryCounts = useMemo(() => {
    const active = categories.filter((c) => c.status === 'active').length;
    const archived = categories.filter((c) => c.status === 'archived').length;
    const groups = new Set(
      categories.filter((c) => c.status === 'active').map((c) => c.group_name),
    ).size;
    const yearly = categories.filter((c) => c.status === 'active' && c.is_yearly).length;
    return { active, groups, yearly, archived };
  }, [categories]);

  function openDrawer(mode: DrawerMode) {
    setDrawerMode(mode);
    setDrawerOpen(true);
  }

  async function handleDrawerSave(payload: {
    name: string;
    group_name: string | null;
    is_yearly: boolean;
    quick_assign: boolean;
    color_override: string | null;
  }) {
    if (drawerMode.mode === 'edit') {
      await updateCategory(drawerMode.category.id, payload);
      showToast(`Saved "${payload.name}"`);
    } else {
      await createCategory({
        household_id: household!.id,
        scheme_id: schemeId!,
        name: payload.name,
        group_name: payload.group_name,
        is_yearly: payload.is_yearly,
        quick_assign: payload.quick_assign,
        color_override: payload.color_override,
      });
      showToast(`Created "${payload.name}"`);
    }
    invalidateCategoryRelated(qc, schemeId!);
  }

  async function handleReorderDrop(srcId: string, targetId: string) {
    const fullSorted = sortByOrder(categories);
    const flatVis = grouped.flatMap(([, items]) => items);
    const from = flatVis.findIndex((c) => c.id === srcId);
    const to = flatVis.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const tgtRow = flatVis[to];
    const arr = flatVis.map((c) => ({ ...c }));
    const [moved] = arr.splice(from, 1);
    let patch = moved;
    if (tgtRow && moved.group_name !== tgtRow.group_name) {
      patch = { ...moved, group_name: tgtRow.group_name };
    }
    let insertAt = to;
    if (from < to) insertAt = to - 1;
    arr.splice(insertAt, 0, patch);
    const rebuilt = rebuildFullOrderAfterVisibleReorder(fullSorted, arr);
    if (patch.group_name !== moved.group_name) {
      await updateCategory(patch.id, { group_name: patch.group_name });
    }
    await reorderCategories(rebuilt.map((c) => c.id));
    invalidateCategoryRelated(qc, schemeId!);
  }

  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveCategory(id),
    onSuccess: () => {
      invalidateCategoryRelated(qc, schemeId!);
    },
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreCategory(id),
    onSuccess: () => {
      invalidateCategoryRelated(qc, schemeId!);
    },
  });

  async function onArchiveRestore(c: Cat) {
    if (c.status === 'archived') {
      await restoreMut.mutateAsync(c.id);
      showToast(`Restored "${c.name}"`);
    } else {
      await archiveMut.mutateAsync(c.id);
      showToast(`Archived "${c.name}". Hidden from new transactions.`);
    }
    setSelected((s) => {
      const n = new Set(s);
      n.delete(c.id);
      return n;
    });
  }

  async function onDuplicate(c: Cat) {
    let name = `${c.name} (copy)`;
    let i = 2;
    while (categories.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
      name = `${c.name} (copy ${i})`;
      i += 1;
    }
    await createCategory({
      household_id: household!.id,
      scheme_id: schemeId!,
      name,
      group_name: c.group_name,
      is_yearly: c.is_yearly,
      quick_assign: c.quick_assign,
      color_override: c.color_override,
    });
    showToast(`Duplicated "${c.name}"`);
    invalidateCategoryRelated(qc, schemeId!);
  }

  async function onBulkArchive() {
    const ids = [...selected];
    for (const id of ids) {
      await archiveCategory(id);
    }
    showToast(`Archived ${ids.length} categor${ids.length === 1 ? 'y' : 'ies'}`);
    setSelected(new Set());
    invalidateCategoryRelated(qc, schemeId!);
  }

  async function onBulkChangeGroup(g: string) {
    const gn = g === '__none__' ? null : g;
    for (const id of selected) {
      await updateCategory(id, { group_name: gn });
    }
    setSelected(new Set());
    invalidateCategoryRelated(qc, schemeId!);
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleCollapse(key: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  const loading = schemeQuery.isLoading || categoriesQuery.isLoading;
  const err = schemeQuery.error ?? categoriesQuery.error;

  const onRowDragStart = (id: string) => (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ src: id, over: null });
  };
  const onRowDragOver = (id: string) => (e: DragEvent) => {
    e.preventDefault();
    setDrag((d) => ({ ...d, over: id }));
  };
  const onRowDrop = (targetId: string) => async (e: DragEvent) => {
    e.preventDefault();
    const src = e.dataTransfer.getData('text/plain') || drag.src;
    setDrag({ src: null, over: null });
    if (!src || src === targetId || !schemeId) return;
    try {
      await handleReorderDrop(src, targetId);
    } catch (ex) {
      console.error(ex);
      showToast('Reorder failed.');
    }
  };

  const emptyFiltered = filtered.length === 0 && categories.length > 0;

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <div className="mb-6 flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => showToast('CSV import coming soon')}
        >
          Import from CSV
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => openDrawer({ mode: 'new' })}
        >
          <PlusIcon />
          New category
        </Button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm text-white shadow-xl">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12l4 4L19 7"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {toast}
        </div>
      )}

      {loading && <div className="text-gray-500">Loading…</div>}
      {err && (
        <StatusPanel
          kind="error"
          message="Could not load categories"
          detail={String(err)}
        />
      )}

      {!loading && !err && schemeId && household && (
        <>
          <CountStrip counts={counts} />
          <FilterBar
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            query={query}
            setQuery={setQuery}
            groupFilter={groupFilter}
            setGroupFilter={setGroupFilter}
            density={density}
            setDensity={setDensity}
            dragMode={dragMode}
            setDragMode={setDragMode}
            selectedCount={selected.size}
            onBulkArchive={onBulkArchive}
            onBulkChangeGroup={onBulkChangeGroup}
            onClearSelection={() => setSelected(new Set())}
          />

          {emptyFiltered ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">
              No categories match your filters.
              {query && (
                <button
                  type="button"
                  className="ml-2 font-semibold text-navy-700 underline"
                  onClick={() => setQuery('')}
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              <ListHeaderRow />
              {grouped.map(([groupKey, items]) => (
                <GroupSection
                  key={groupKey}
                  groupKey={groupKey}
                  items={items}
                  collapsed={collapsed.has(groupKey)}
                  onToggleCollapse={() => toggleCollapse(groupKey)}
                  density={density}
                  dragMode={dragMode}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onEdit={(c) => openDrawer({ mode: 'edit', category: c })}
                  onMerge={(c) => setMergeSrc(c)}
                  onDuplicate={onDuplicate}
                  onArchiveRestore={onArchiveRestore}
                  onAddToGroup={(g) =>
                    openDrawer({
                      mode: 'new',
                      presetGroup: g === '' ? null : g,
                    })
                  }
                  dragSrc={drag.src}
                  dragOver={drag.over}
                  setDragOver={(id) => setDrag((d) => ({ ...d, over: id }))}
                  onRowDragStart={onRowDragStart}
                  onRowDragOver={onRowDragOver}
                  onRowDrop={onRowDrop}
                />
              ))}
            </>
          )}

          <p className="text-caption mt-6 text-gray-500">
            Categories are scoped to the household&apos;s default scheme. Renaming preserves links;
            archiving hides from new transactions but keeps history. Merge to reassign past
            transactions, rules, and budget cells.
          </p>
        </>
      )}

      {schemeId && (
        <>
          <CategoryEditDrawer
            open={drawerOpen}
            mode={drawerMode}
            schemeId={schemeId}
            categories={categories}
            onClose={() => setDrawerOpen(false)}
            onSave={handleDrawerSave}
            onOpenMerge={(src) => {
              setMergeSrc(src);
            }}
            toast={showToast}
          />

          <MergeDialog
            open={!!mergeSrc}
            source={mergeSrc}
            schemeId={schemeId}
            categories={categories}
            onClose={() => setMergeSrc(null)}
            onMerged={() => invalidateCategoryRelated(qc, schemeId)}
            toast={showToast}
          />
        </>
      )}
    </div>
  );
}
