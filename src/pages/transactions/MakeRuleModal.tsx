import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, CategoryChip } from '@/components/ds';
import { formatMoney } from '@/lib/money';
import type { TransactionRow } from '@/types';
import type { RuleCondition } from '@/types/phase2';
import { applyBulkAction, createRule } from '@/api/phase2';
import {
  backfillUncategorizedByDescriptionMatch,
  type CategoryOption,
} from '@/api/transactions';
import { ALL_GROUPS } from '@/features/categories/constants';

export function MakeRuleModal(props: {
  open: boolean;
  onClose: () => void;
  seed: TransactionRow | null;
  /** All selected rows. When more than one, the rule is generalized from the whole set. */
  selection?: TransactionRow[];
  householdId: string;
  schemeId: string;
  categories: CategoryOption[];
  accounts: { id: string; name: string }[];
  onCreated: () => void;
  toast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const { open, onClose, seed, selection, householdId, schemeId, categories, accounts, onCreated, toast } =
    props;

  const rows = useMemo<TransactionRow[]>(() => {
    if (selection && selection.length > 0) return selection;
    return seed ? [seed] : [];
  }, [selection, seed]);
  const isMulti = rows.length > 1;
  const rowsKey = rows.map((r) => r.id).join(',');

  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<'contains' | 'starts_with' | 'equals' | 'regex'>(
    'contains',
  );
  const [accountScope, setAccountScope] = useState<'any' | string>('any');
  const [categoryId, setCategoryId] = useState('');
  const [applyHistory, setApplyHistory] = useState(true);

  useEffect(() => {
    if (!open || rows.length === 0) return;
    const suggestion = suggestPattern(rows.map((r) => r.description));
    setPattern(suggestion.pattern);
    setMatchType(suggestion.matchType);
    setAccountScope('any');
    // Pre-pick the category only when every selected row already shares it.
    const catNames = new Set(rows.map((r) => r.category_name ?? ''));
    const sharedName = catNames.size === 1 ? [...catNames][0] : '';
    const cat = sharedName ? categories.find((c) => c.name === sharedName) : undefined;
    setCategoryId(cat?.id ?? '');
    setApplyHistory(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rowsKey, categories]);

  const selectedMatchCount = useMemo(() => {
    const acctName =
      accountScope === 'any' ? null : accounts.find((a) => a.id === accountScope)?.name ?? null;
    return rows.filter(
      (r) =>
        descriptionMatches(r.description, matchType, pattern) &&
        (acctName === null || r.account_name === acctName),
    ).length;
  }, [rows, matchType, pattern, accountScope, accounts]);

  const quickAssignCategories = useMemo(
    () =>
      [...categories].filter((c) => c.quick_assign).sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  );

  const categorySelectGroups = useMemo(() => {
    const m = new Map<string, CategoryOption[]>();
    for (const c of categories) {
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
  }, [categories]);

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
      if (rows.length === 0 || !pattern.trim() || !categoryId) return;
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
      // Always categorize the selected transactions themselves, regardless of
      // the "apply to history" / match-type settings below, so they
      // immediately drop out of the review queue and can't spawn duplicate rules.
      await applyBulkAction(schemeId, rows.map((r) => r.id), {
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

  if (!open || rows.length === 0) return null;

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
            {isMulti
              ? `Generalize from the ${rows.length} selected transactions. Review before confirming.`
              : 'Generalize from the selected transaction. Review before confirming.'}
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-navy-100 bg-navy-50/50">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex gap-3 border-b border-navy-100 px-3 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1 break-words text-sm font-semibold text-navy-900">
                  {r.description}
                </div>
                <div className="shrink-0 self-start text-sm font-semibold tabular-nums text-navy-800">
                  {formatMoney(r.amount)}
                </div>
              </div>
            ))}
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

          {quickAssignCategories.length > 0 && (
            <div className="mb-3">
              <span className="text-label text-gray-600">Quick assign</span>
              <p className="text-caption mt-0.5 text-gray-500">
                Sets the category field below for this rule only.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {quickAssignCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setCategoryId(c.id)}
                    className={`rounded-full border p-0 shadow-sm transition hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-45 ${
                      categoryId === c.id
                        ? 'border-navy-500 ring-2 ring-navy-300'
                        : 'border-navy-100 bg-white'
                    }`}
                    aria-label={`Use ${c.name} as rule category`}
                    aria-pressed={categoryId === c.id}
                  >
                    <CategoryChip name={c.name} className="!px-2.5 !py-1 !text-xs" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="mb-3 block">
            <span className="text-label text-gray-600">Category</span>
            <select
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
              value={categoryId}
              disabled={busy}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select category…</option>
              {categorySelectGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

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
          {isMulti && (
            <div
              className={`mt-2 rounded-md px-3 py-2 text-caption ${
                selectedMatchCount === rows.length
                  ? 'bg-info-soft text-navy-800'
                  : 'bg-gold-100/70 text-navy-900'
              }`}
            >
              Pattern matches <strong>{selectedMatchCount}</strong> of {rows.length} selected
              transactions.
              {selectedMatchCount < rows.length &&
                ' All selected rows will still get this category, but the rule won\u2019t catch the others in future.'}
            </div>
          )}
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

// ----------------------------------------------------------------------------
// Pattern suggestion from one or more descriptions
// ----------------------------------------------------------------------------

type MatchType = 'contains' | 'starts_with' | 'equals' | 'regex';

function suggestPattern(descs: string[]): { pattern: string; matchType: MatchType } {
  const cleaned = descs.map((d) => d.trim()).filter(Boolean);
  if (cleaned.length === 0) return { pattern: '', matchType: 'contains' };
  if (cleaned.length === 1) return { pattern: cleaned[0], matchType: 'contains' };

  const unique = new Set(cleaned.map((d) => d.toLowerCase()));
  if (unique.size === 1) return { pattern: cleaned[0], matchType: 'contains' };

  // Shared leading text (e.g. "AMAZON MKTPL*AB12" / "AMAZON MKTPL*ZX9") → starts with.
  const prefix = trimToWordBoundary(longestCommonPrefix(cleaned));
  if (prefix.length >= 4) return { pattern: prefix, matchType: 'starts_with' };

  // Otherwise the longest word that appears in every description → contains.
  const common = longestSharedToken(cleaned);
  if (common) return { pattern: common, matchType: 'contains' };

  return { pattern: cleaned[0], matchType: 'contains' };
}

function longestCommonPrefix(strs: string[]): string {
  let prefix = strs[0];
  for (const s of strs.slice(1)) {
    while (!s.toLowerCase().startsWith(prefix.toLowerCase())) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

/** Drop a trailing partial word / punctuation so "STARBUCKS STO" becomes "STARBUCKS". */
function trimToWordBoundary(prefix: string): string {
  const t = prefix.replace(/[\s*#\-_.,/]+$/, '');
  if (t.length === prefix.length) {
    // Prefix ended mid-token; cut back to the last separator if there is one.
    const cut = t.search(/[\s*#\-_.,/][^\s*#\-_.,/]*$/);
    if (cut >= 4) return t.slice(0, cut).replace(/[\s*#\-_.,/]+$/, '');
  }
  return t;
}

function longestSharedToken(strs: string[]): string | null {
  const tokenSets = strs.map(
    (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)),
  );
  let best: string | null = null;
  for (const t of tokenSets[0]) {
    if (tokenSets.every((set) => set.has(t)) && (!best || t.length > best.length)) best = t;
  }
  return best;
}

function descriptionMatches(desc: string, op: MatchType, pattern: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  const d = desc.toLowerCase();
  const q = p.toLowerCase();
  switch (op) {
    case 'contains':
      return d.includes(q);
    case 'starts_with':
      return d.startsWith(q);
    case 'equals':
      return d.trim() === q;
    case 'regex':
      try {
        return new RegExp(p, 'i').test(desc);
      } catch {
        return false;
      }
  }
}
