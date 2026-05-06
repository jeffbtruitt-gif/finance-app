import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ds';
import { categoryColorHex } from '@/components/ds';
import type { CategoryRow as Cat } from '@/api/categories';
import { fetchCategoryUsage, mergeCategory } from '@/api/categories';

export function MergeDialog(props: {
  open: boolean;
  source: Cat | null;
  schemeId: string;
  categories: Cat[];
  onClose: () => void;
  onMerged: () => void;
  toast: (msg: string) => void;
}) {
  const { open, source, schemeId, categories, onClose, onMerged, toast } = props;
  const [query, setQuery] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ txnCount: number; ruleCount: number; budgetCellCount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !source) return;
    setQuery('');
    setTargetId(null);
    fetchCategoryUsage({ categoryId: source.id, schemeId })
      .then(setUsage)
      .catch(() => setUsage({ txnCount: 0, ruleCount: 0, budgetCellCount: 0 }));
  }, [open, source, schemeId]);

  const candidates = useMemo(() => {
    if (!source) return [];
    const q = query.trim().toLowerCase();
    return categories.filter(
      (c) =>
        c.id !== source.id &&
        c.status === 'active' &&
        (!q || c.name.toLowerCase().includes(q)),
    );
  }, [categories, source, query]);

  const target = candidates.find((c) => c.id === targetId) ?? null;

  async function confirm() {
    if (!source || !target) return;
    setBusy(true);
    try {
      await mergeCategory(source.id, target.id);
      toast(`Merged "${source.name}" → "${target.name}"`);
      onMerged();
      onClose();
    } catch (e) {
      console.error(e);
      toast('Merge failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open || !source) return null;

  const nTx = usage?.txnCount ?? 0;
  const nRules = usage?.ruleCount ?? 0;
  const nBud = usage?.budgetCellCount ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-900/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[520px] rounded-lg border border-navy-100 bg-white shadow-xl">
        <div className="border-b border-navy-100 px-5 py-4">
          <h2 className="text-h3 text-navy-900">Merge category</h2>
          <p className="mt-1 text-caption text-gray-600">
            Move all transactions, rules, and budget cells from{' '}
            <span className="font-semibold text-navy-800">{source.name}</span> into another
            category. This action is logged and reversible for 30 days.
          </p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <div className="mb-4 flex gap-2 rounded-md border border-warn/20 bg-warn-soft px-3 py-2 text-caption text-navy-900">
            <span className="shrink-0 font-bold text-warn">!</span>
            <div>
              <strong>{nTx} transaction(s)</strong>, <strong>{nRules} rule(s)</strong>, and{' '}
              <strong>{nBud} budget cell(s)</strong> reference &quot;{source.name}&quot;. They will
              be reassigned to the chosen target.
            </div>
          </div>

          <div className="text-label mb-1 uppercase text-gray-600">Merge into</div>
          <input
            className="mb-2 w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
            placeholder="Search target category"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="max-h-60 overflow-y-auto rounded-md border border-gray-200">
            {candidates.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No matches.</div>
            ) : (
              candidates.map((c) => {
                const sel = c.id === targetId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setTargetId(c.id)}
                    className={
                      'flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left last:border-0 ' +
                      (sel ? 'bg-navy-100' : 'hover:bg-navy-50')
                    }
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color_override ?? categoryColorHex(c.name) }}
                    />
                    <span className="text-sm font-semibold text-navy-900">{c.name}</span>
                    <span className="ml-auto text-caption text-gray-500">{c.group_name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-navy-100 bg-gray-50 px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!target || busy}
            onClick={confirm}
          >
            Merge into {target?.name ?? '…'}
          </Button>
        </div>
      </div>
    </div>
  );
}
