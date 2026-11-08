import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ds';
import { formatMoney } from '@/lib/money';
import type { TransactionRow } from '@/types';
import type { RuleCondition } from '@/types/phase2';
import { applyBulkAction, createRule } from '@/api/phase2';
import {
  backfillUncategorizedByDescriptionMatch,
  type CategoryOption,
} from '@/api/transactions';
import { CategorySelect } from '@/components/CategoryPicker';

export function MakeRuleModal(props: {
  open: boolean;
  onClose: () => void;
  seed: TransactionRow | null;
  householdId: string;
  schemeId: string;
  categories: CategoryOption[];
  accounts: { id: string; name: string }[];
  onCreated: () => void;
  toast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const { open, onClose, seed, householdId, schemeId, categories, accounts, onCreated, toast } =
    props;

  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<'contains' | 'starts_with' | 'equals' | 'regex'>(
    'contains',
  );
  const [accountScope, setAccountScope] = useState<'any' | string>('any');
  const [categoryId, setCategoryId] = useState('');
  const [applyHistory, setApplyHistory] = useState(true);

  useEffect(() => {
    if (!open || !seed) return;
    setPattern(seed.description.trim());
    setMatchType('contains');
    setAccountScope('any');
    const cat = categories.find((c) => c.name === seed.category_name);
    setCategoryId(cat?.id ?? '');
    setApplyHistory(true);
  }, [open, seed, categories]);

  const preview = useMemo(() => {
    const cat = categories.find((c) => c.id === categoryId)?.name ?? '…';
    const op =
      matchType === 'contains'
        ? 'contains'
        : matchType === 'starts_with'
          ? 'starts with'
          : matchType === 'equals'
            ? 'matches exactly'
            : 'matches regex';
    return `Will apply ${cat} to txns where description ${op} "${pattern || '…'}"`;
  }, [categories, categoryId, matchType, pattern]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!seed || !pattern.trim() || !categoryId) return;
      const conds: RuleCondition[] = [];
      if (matchType === 'regex') {
        conds.push({
          field: 'description',
          op: 'regex',
          value: pattern.trim(),
          case_insensitive: true,
        });
      } else {
        conds.push({
          field: 'description',
          op: matchType,
          value: pattern.trim(),
          case_insensitive: true,
        });
      }
      if (accountScope !== 'any') {
        const acct = accounts.find((a) => a.id === accountScope);
        if (acct) {
          conds.push({ field: 'account', op: 'is', value: acct.name });
        }
      }
      await createRule({
        household_id: householdId,
        scheme_id: schemeId,
        name: `Rule: ${pattern.trim().slice(0, 40)}`,
        conditions: conds,
        action_category_id: categoryId,
      });
      // Always categorize the seed transaction itself, regardless of the
      // "apply to history" / match-type settings below, so it immediately
      // drops out of the review queue and can't spawn a duplicate rule.
      await applyBulkAction(schemeId, [seed.id], {
        type: 'set_category',
        category_id: categoryId,
      });
      if (applyHistory && matchType !== 'regex') {
        await backfillUncategorizedByDescriptionMatch({
          household_id: householdId,
          scheme_id: schemeId,
          category_id: categoryId,
          op: matchType,
          pattern: pattern.trim(),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.invalidateQueries({ queryKey: ['transaction_categories'] });
      toast('Rule created');
      onCreated();
      onClose();
    },
    onError: () => {
      toast('Could not create rule');
      createMut.reset();
    },
  });

  const closeModal = useCallback(() => {
    createMut.reset();
    onClose();
  }, [createMut, onClose]);

  useEffect(() => {
    if (!open) createMut.reset();
  }, [open, createMut]);

  if (!open || !seed) return null;

  const canSubmit = pattern.trim().length > 0 && !!categoryId;
  const busy = createMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-900/40" aria-hidden />
      <div
        className="relative flex max-h-[90vh] w-full max-w-[540px] flex-col overflow-hidden rounded-lg border border-navy-100 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="make-rule-title"
      >
        <div className="border-b border-navy-100 px-5 py-4">
          <h2 id="make-rule-title" className="text-h3 text-navy-900">
            Make rule
          </h2>
          <p className="text-caption text-gray-600">
            Generalize from the selected transaction. Review before confirming.
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="mb-4 flex gap-3 rounded-lg border border-navy-100 bg-navy-50/50 p-3">
            <div className="min-w-0 flex-1 break-words text-sm font-semibold text-navy-900">
              {seed.description}
            </div>
            <div className="shrink-0 self-start text-sm font-semibold tabular-nums text-navy-800">
              {formatMoney(seed.amount)}
            </div>
          </div>

          <label className="mb-3 block">
            <span className="text-label text-gray-600">Pattern</span>
            <input
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
              value={pattern}
              disabled={busy}
              onChange={(e) => setPattern(e.target.value)}
            />
          </label>

          <label className="mb-3 block">
            <span className="text-label text-gray-600">Match type</span>
            <select
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
              value={matchType}
              disabled={busy}
              onChange={(e) =>
                setMatchType(e.target.value as typeof matchType)
              }
            >
              <option value="contains">contains</option>
              <option value="starts_with">starts with</option>
              <option value="equals">matches exactly</option>
              <option value="regex">matches regex</option>
            </select>
          </label>

          <label className="mb-3 block">
            <span className="text-label text-gray-600">Account scope</span>
            <select
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
              value={accountScope}
              disabled={busy}
              onChange={(e) => setAccountScope(e.target.value)}
            >
              <option value="any">Any account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-3">
            <span className="text-label text-gray-600">Category</span>
            <CategorySelect
              className="mt-1"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              disabled={busy}
            />
          </div>

          <label className="mb-3 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={applyHistory}
              disabled={busy}
              onChange={(e) => setApplyHistory(e.target.checked)}
              className="rounded border-gray-300 text-navy-700"
            />
            <span className="text-sm text-gray-700">Apply to history (uncategorized matches)</span>
          </label>

          <div className="rounded-md bg-gray-50 px-3 py-2 text-caption text-gray-700">{preview}</div>
        </div>

        <div className="flex justify-end gap-2 border-t border-navy-100 bg-gray-50 px-5 py-3">
          <Button variant="secondary" size="sm" onClick={closeModal} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSubmit || busy}
            onClick={() => createMut.mutate()}
          >
            Create rule
          </Button>
        </div>
      </div>
    </div>
  );
}
