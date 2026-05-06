import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ds';
import { categoryColorHex } from '@/components/ds';
import { ALL_GROUPS } from '@/features/categories/constants';
import type { CategoryOption } from '@/api/transactions';

export function CategorizeModal(props: {
  open: boolean;
  onClose: () => void;
  seedDescription: string;
  categories: CategoryOption[];
  onPick: (categoryId: string) => Promise<void>;
}) {
  const { open, onClose, seedDescription, categories, onPick } = props;
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(s));
  }, [categories, q]);

  const grouped = useMemo(() => {
    const m = new Map<string, CategoryOption[]>();
    for (const c of filtered) {
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
    return keys.map((k) => ({ label: k === '(ungrouped)' ? 'Ungrouped' : k, items: m.get(k)! }));
  }, [filtered]);

  if (!open) return null;

  async function pick(id: string) {
    setBusy(true);
    try {
      await onPick(id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-900/40" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[85vh] w-full max-w-[440px] flex-col rounded-lg border border-navy-100 bg-white shadow-xl">
        <div className="border-b border-navy-100 px-4 py-3">
          <h2 className="text-h3 text-navy-900">Set category</h2>
          <p className="text-caption text-gray-600">Choose a category for the current selection.</p>
        </div>
        <div className="border-b border-navy-100 px-4 py-2">
          <input
            type="search"
            placeholder="Search categories"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {grouped.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {g.label}
              </div>
              {g.items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(c.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-navy-50"
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
        <div className="border-t border-navy-100 bg-gray-50 px-4 py-3">
          <div className="text-caption text-gray-600">
            Sample: <span className="font-medium text-navy-800">{seedDescription || '—'}</span>
          </div>
          <Link
            to="/categories"
            className="mt-2 inline-block text-sm font-semibold text-navy-700 underline"
            onClick={onClose}
          >
            + New category
          </Link>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
