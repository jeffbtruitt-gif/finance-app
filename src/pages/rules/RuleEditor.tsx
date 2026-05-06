import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ds';
import { createRule, updateRule } from '@/api/phase2';
import { countMatches } from '@/features/rules/engine';
import { ConditionEditor } from '@/features/rules/ConditionEditor';
import type { MatchableTransaction, Rule, RuleCondition } from '@/types/phase2';
import { IconBolt, IconPlus } from './rulesIcons';
import { INP } from './rulesShared';

function defaultCondition(): RuleCondition {
  return { field: 'description', op: 'contains', value: '', case_insensitive: true };
}

function conditionsValid(conditions: RuleCondition[]): boolean {
  if (conditions.length === 0) return false;
  for (const c of conditions) {
    if (c.field === 'description' && !String(c.value).trim()) return false;
    if (c.field === 'account' && !String(c.value).trim()) return false;
    if (c.field === 'amount') {
      if (c.op === 'between') {
        if (!Number.isFinite(c.min) || !Number.isFinite(c.max)) return false;
      } else if (!Number.isFinite(c.value)) return false;
    }
  }
  return true;
}

export function RuleEditor(props: {
  mode: 'create' | 'edit';
  rule: Rule | null;
  schemeId: string;
  householdId: string;
  categories: { id: string; name: string; group_name?: string | null }[];
  transactions: MatchableTransaction[] | undefined;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { mode, rule, schemeId, householdId, categories, transactions, onCancel, onSaved } = props;
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<RuleCondition[]>([defaultCondition()]);
  const [categoryId, setCategoryId] = useState('');

  useEffect(() => {
    if (mode === 'edit' && rule) {
      setName(rule.name);
      setConditions(rule.conditions.length ? rule.conditions : [defaultCondition()]);
      setCategoryId(rule.action_category_id);
    } else {
      setName('');
      setConditions([defaultCondition()]);
      setCategoryId('');
    }
  }, [mode, rule?.id]);

  const liveCount = useMemo(() => {
    if (!transactions?.length || conditions.length === 0) return 0;
    return countMatches({ conditions }, transactions);
  }, [transactions, conditions]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!conditionsValid(conditions) || !categoryId.trim()) return;
      if (mode === 'edit' && rule) {
        await updateRule(rule.id, {
          name: name.trim(),
          conditions,
          action_category_id: categoryId,
        });
      } else {
        await createRule({
          household_id: householdId,
          scheme_id: schemeId,
          name: name.trim(),
          conditions,
          action_category_id: categoryId,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules'] });
      onSaved();
    },
  });

  const canSave =
    name.trim().length > 0 && categoryId && conditionsValid(conditions);

  return (
    <div className="rounded-lg border border-navy-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase text-gold-600">
          {mode === 'create' ? '+ New rule' : 'Edit rule'}
        </span>
        <Link
          to="/rules/new"
          className="text-[12px] font-semibold text-navy-700 underline hover:text-navy-900"
        >
          Advanced editor
        </Link>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <label className="col-span-12 md:col-span-5">
          <span className="text-label uppercase text-gray-500">Name</span>
          <input
            className={`${INP} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. STARBUCKS'
          />
        </label>
        <label className="col-span-12 md:col-span-7">
          <span className="text-label uppercase text-gray-500">Then assign to</span>
          <select
            className={`${INP} mt-1`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— pick a category —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.group_name ? `${c.group_name}: ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="col-span-12">
          <div className="mb-1 text-label uppercase text-gray-500">When a transaction matches</div>
          <div className="space-y-2">
            {conditions.map((c, i) => (
              <ConditionEditor
                key={i}
                condition={c}
                onChange={(nc) =>
                  setConditions((arr) => arr.map((x, j) => (j === i ? nc : x)))
                }
                onRemove={() =>
                  setConditions((arr) => (arr.length <= 1 ? arr : arr.filter((_, j) => j !== i)))
                }
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold text-navy-700 hover:bg-navy-50"
            onClick={() =>
              setConditions((arr) => [...arr, defaultCondition()])
            }
          >
            <IconPlus className="text-navy-600" />
            Add condition
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-navy-100 pt-3">
        <div
          className="flex items-center gap-2 text-[12px] text-gray-600"
          aria-live="polite"
        >
          <IconBolt className="text-gold-500" />
          <span>
            Would match{' '}
            <strong className="font-mono tabular-nums text-navy-900">{liveCount}</strong> existing
            transactions
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saveMut.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending
              ? 'Saving…'
              : mode === 'create'
                ? 'Create rule'
                : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
