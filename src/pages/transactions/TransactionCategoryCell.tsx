import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CategoryChip, categoryColorHex } from '@/components/ds';
import type { CategoryOption } from '@/api/transactions';
import { ALL_GROUPS } from '@/features/categories/constants';
import type { TransactionRow } from '@/types';

function groupCategories(items: CategoryOption[]) {
  const m = new Map<string, CategoryOption[]>();
  for (const c of items) {
    const key = c.group_name ?? '(ungrouped)';
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(c);
  }
  const keys = [...m.keys()].sort((a, b) => {
    if (a === '(ungrouped)') return 1;
    if (b === '(ungrouped)') return -1;
    const ia = ALL_GROUPS.indexOf(a as (typeof ALL_GROUPS)[number]);
    const ib = ALL_GROUPS.indexOf(b as (typeof ALL_GROUPS)[number]);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
  return keys.map((k) => ({
    label: k === '(ungrouped)' ? 'Ungrouped' : k,
    items: m.get(k)!,
  }));
}

export function TransactionCategoryCell(props: {
  row: TransactionRow;
  categories: CategoryOption[];
  onPick: (transactionId: string, categoryId: string) => Promise<void>;
}) {
  const { row, categories, onPick } = props;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const quickAssign = useMemo(
    () =>
      [...categories].filter((c) => c.quick_assign).sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  );

  const groupedRest = useMemo(() => {
    const rest = categories.filter((c) => !c.quick_assign);
    return groupCategories(rest);
  }, [categories]);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 260);
    let left = r.left;
    const pad = 8;
    if (left + width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - width - pad);
    }
    setCoords({ top: r.bottom + 4, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onResize = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const isInsideChrome = (node: Node | null | undefined) =>
      Boolean(node && (triggerRef.current?.contains(node) || menuRef.current?.contains(node)));
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (isInsideChrome(t)) return;
      // Scrollbar drags sometimes report a target outside the scroll box; hit-test the visual position.
      const at = document.elementFromPoint(e.clientX, e.clientY);
      if (isInsideChrome(at)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function pick(categoryId: string) {
    setBusy(true);
    try {
      await onPick(row.id, categoryId);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const menu =
    open &&
    coords &&
    createPortal(
      <div
        ref={menuRef}
        data-no-row-select
        className="fixed z-[70] max-h-[min(22rem,calc(100vh-2rem))] overflow-y-auto rounded-lg border border-navy-100 bg-white py-2 shadow-xl"
        style={{ top: coords.top, left: coords.left, width: coords.width }}
        role="listbox"
        aria-label="Choose category"
        onWheel={(ev) => ev.stopPropagation()}
      >
        {quickAssign.length > 0 && (
          <div className="border-b border-navy-100 px-2 pb-2">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Quick assign
            </div>
            <div className="flex flex-col gap-0.5">
              {quickAssign.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  disabled={busy}
                  onClick={() => pick(c.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-navy-50 disabled:opacity-50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColorHex(c.name) }}
                  />
                  <span className="font-semibold text-navy-900">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="px-2 pt-1">
          {groupedRest.map((g) => (
            <div key={g.label} className="mb-2 last:mb-0">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {g.label}
              </div>
              {g.items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  disabled={busy}
                  onClick={() => pick(c.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-navy-50 disabled:opacity-50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColorHex(c.name) }}
                  />
                  <span className="font-semibold text-navy-900">{c.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <div
        ref={triggerRef}
        data-no-row-select
        onClick={(e) => {
          e.stopPropagation();
          if (categories.length === 0) return;
          setOpen((o) => !o);
        }}
        className="min-w-0 max-w-[7.25rem] cursor-pointer overflow-hidden"
        title={row.category_name ?? 'uncategorized'}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {row.category_name ? (
          <CategoryChip
            name={row.category_name}
            className="!max-w-full !px-1.5 !py-px !text-[10px]"
          />
        ) : (
          <CategoryChip name="uncategorized" className="!max-w-full !px-1.5 !py-px !text-[10px]">
            uncategorized
          </CategoryChip>
        )}
      </div>
      {menu}
    </>
  );
}
