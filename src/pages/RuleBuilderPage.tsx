import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { supabase } from '@/api/supabase';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import { createRule, updateRule, getRule } from '../api/phase2';
import { listMatchingTransactions } from '../features/rules/engine';
import { ConditionEditor } from '../features/rules/ConditionEditor';
import type { RuleCondition, MatchableTransaction } from '../types/phase2';
import { Button, Card } from '@/components/ds';
import { StatusPanel } from '@/components/StatusPanel';
import { ColumnFilterPopover } from '@/pages/transactions/ColumnFilterPopover';
import { formatDate } from '@/lib/date';
import { formatMoney } from '@/lib/money';
import {
  RULE_BUILDER_FROM_IDS_KEY,
  type RuleBuilderLocationState,
} from '@/lib/ruleBuilderNavigation';

export function RuleBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const household = useHousehold();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const editId = params.id;
  const stateIds = (location.state as RuleBuilderLocationState | null)?.[
    RULE_BUILDER_FROM_IDS_KEY
  ];
  const fromQuery = searchParams.get('from')?.split(',').filter(Boolean) ?? [];
  const fromSelection =
    stateIds && stateIds.length > 0 ? stateIds : fromQuery;

  const schemeQuery = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories', schemeQuery.data],
    enabled: !!schemeQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tf_categories')
        .select('id, name, group_name')
        .eq('scheme_id', schemeQuery.data!)
        .eq('status', 'active')
        .order('group_name')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const allTxQuery = useQuery({
    queryKey: ['rule-builder-tx', household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const [txRes, acctRes] = await Promise.all([
        supabase
          .from('tf_transactions')
          .select('id, description, amount, account_id, date, flag_for_review')
          .eq('household_id', household!.id)
          .limit(20000),
        supabase
          .from('tf_accounts')
          .select('id, name')
          .eq('household_id', household!.id),
      ]);
      if (txRes.error) throw txRes.error;
      if (acctRes.error) throw acctRes.error;
      const acctMap = new Map(acctRes.data.map(a => [a.id, a.name]));
      return txRes.data.map(t => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        account_name: acctMap.get(t.account_id) ?? '',
        date: t.date,
        flag_for_review: Boolean(t.flag_for_review),
      })) as MatchableTransaction[];
    },
  });

  const ruleQuery = useQuery({
    queryKey: ['rule', editId],
    enabled: !!editId,
    queryFn: () => getRule(editId!),
  });

  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<RuleCondition[]>([]);
  const [actionCategoryId, setActionCategoryId] = useState('');
  const [matchPreviewFilter, setMatchPreviewFilter] = useState<'all' | 'flagged'>('all');
  const [previewSearch, setPreviewSearch] = useState('');

  const hydratedEditIdRef = useRef<string | null>(null);
  const seededFromKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (editId) return;
    hydratedEditIdRef.current = null;
    seededFromKeyRef.current = null;
    setName('');
    setConditions([]);
    setActionCategoryId('');
  }, [editId]);

  useEffect(() => {
    if (!editId || !ruleQuery.data || ruleQuery.data.id !== editId) return;
    if (hydratedEditIdRef.current === editId) return;
    hydratedEditIdRef.current = editId;
    setName(ruleQuery.data.name);
    setConditions(ruleQuery.data.conditions);
    setActionCategoryId(ruleQuery.data.action_category_id);
  }, [editId, ruleQuery.data]);

  const fromKey = fromSelection.join(',');
  useEffect(() => {
    if (editId || fromSelection.length === 0 || !allTxQuery.data) return;
    if (seededFromKeyRef.current === fromKey) return;
    const selected = allTxQuery.data.filter(t => fromSelection.includes(t.id));
    if (selected.length === 0) return;
    seededFromKeyRef.current = fromKey;
    const seed = seedFromSelection(selected);
    setConditions(seed.conditions);
    setName(seed.suggestedName);
  }, [editId, allTxQuery.data, fromKey]);

  const matchingTransactions = useMemo(() => {
    if (!allTxQuery.data || conditions.length === 0) return [];
    return listMatchingTransactions({ conditions }, allTxQuery.data);
  }, [allTxQuery.data, conditions]);

  const matchCount = matchingTransactions.length;

  const flaggedInMatches = useMemo(
    () => matchingTransactions.filter((t) => t.flag_for_review).length,
    [matchingTransactions],
  );

  const previewRows = useMemo(() => {
    let rows = matchingTransactions;
    if (matchPreviewFilter === 'flagged') {
      rows = rows.filter((t) => t.flag_for_review);
    }
    const q = previewSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((t) =>
        t.description.toLowerCase().includes(q) ||
        (t.account_name ?? '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [matchingTransactions, matchPreviewFilter, previewSearch]);

  useEffect(() => {
    if (matchPreviewFilter === 'flagged' && flaggedInMatches === 0 && matchCount > 0) {
      setMatchPreviewFilter('all');
    }
  }, [matchPreviewFilter, flaggedInMatches, matchCount]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editId) {
        await updateRule(editId, {
          name, conditions, action_category_id: actionCategoryId,
        });
        return { id: editId };
      }
      return createRule({
        household_id: household!.id,
        scheme_id: schemeQuery.data!,
        name, conditions, action_category_id: actionCategoryId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      navigate('/rules');
    },
  });

  const canSave = name.trim() && conditions.length > 0 && actionCategoryId;

  const inputCls =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';

  if (editId && ruleQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <StatusPanel kind="loading" message="Loading rule…" />
      </div>
    );
  }

  if (editId && ruleQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <StatusPanel
          kind="error"
          message="Could not load this rule. It may have been deleted, or you may not have access."
        />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/rules')}>
            Back to rules
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="space-y-5">
        <div>
          <label className="mb-1 block text-label uppercase tracking-wider text-gray-600">
            Name
          </label>
          <input
            className={inputCls}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Target → Shopping"
          />
        </div>

        <div>
          <label className="mb-2 block text-label uppercase tracking-wider text-gray-600">
            Conditions <span className="text-gray-400 normal-case tracking-normal">(all must match)</span>
          </label>
          <div className="space-y-2">
            {conditions.map((c, i) => (
              <ConditionEditor
                key={i}
                condition={c}
                onChange={(nc) => setConditions(arr => arr.map((x, j) => j === i ? nc : x))}
                onRemove={() => setConditions(arr => arr.filter((_, j) => j !== i))}
              />
            ))}
          </div>
          <button
            className="mt-2 text-sm font-semibold text-navy-700 hover:text-navy-900 hover:underline"
            onClick={() => setConditions(arr => [...arr,
              { field: 'description', op: 'contains', value: '', case_insensitive: true }
            ])}
          >
            + Add condition
          </button>
        </div>

        <div>
          <label className="mb-1 block text-label uppercase tracking-wider text-gray-600">
            Then assign category
          </label>
          <select
            className={inputCls}
            value={actionCategoryId}
            onChange={e => setActionCategoryId(e.target.value)}
          >
            <option value="">— pick a category —</option>
            {Object.entries(groupBy(categoriesQuery.data ?? [], c => c.group_name ?? 'Other')).map(
              ([group, cats]) => (
                <optgroup key={group} label={group}>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              )
            )}
          </select>
        </div>

        {/* Live preview with V4 inline-filter style */}
        <div className="space-y-3 rounded-md border border-info/30 bg-info-soft px-3 py-3 text-sm text-navy-800">
          <div>
            <strong>Live preview:</strong> this rule would match{' '}
            <strong>{matchCount}</strong> existing transactions
            {flaggedInMatches > 0 ? (
              <>
                {' '}
                (<strong>{flaggedInMatches}</strong> flagged for review)
              </>
            ) : null}
            .
          </div>
          {conditions.length > 0 && matchCount > 0 && (
            <>
              {/* Preview toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-[220px] max-w-full">
                  <svg viewBox="0 0 16 16" className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="7" cy="7" r="5" /><path d="m11 11 3 3" strokeLinecap="round" />
                  </svg>
                  <input
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    placeholder="Search matches…"
                    className="w-full rounded-md border border-navy-200 bg-white py-1 pl-7 pr-2 text-xs focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-200"
                  />
                </div>

                <ColumnFilterPopover label="View" active={matchPreviewFilter !== 'all'}>
                  <div className="w-[200px] space-y-0.5">
                    {(
                      [
                        ['all', `All matches (${matchCount})`],
                        ['flagged', `Flagged for review (${flaggedInMatches})`],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-navy-50">
                        <input
                          type="radio"
                          name="preview-filter"
                          checked={matchPreviewFilter === k}
                          disabled={k === 'flagged' && flaggedInMatches === 0}
                          onChange={() => setMatchPreviewFilter(k)}
                          className="h-3.5 w-3.5 border-gray-300 accent-navy-700"
                        />
                        <span className="text-navy-800">{label}</span>
                      </label>
                    ))}
                  </div>
                </ColumnFilterPopover>

                <span className="ml-auto font-mono text-[10px] tabular-nums text-gray-500">
                  {previewRows.length} of {matchCount}
                </span>
              </div>

              {/* Preview table */}
              <div className="max-h-[min(40vh,320px)] overflow-auto rounded-md border border-navy-100 bg-white">
                <table className="w-full text-left text-[12px] text-navy-900">
                  <thead className="sticky top-0 z-[1] border-b border-navy-100 bg-gray-50">
                    <tr>
                      <th className="whitespace-nowrap px-2 py-2 text-label uppercase text-gray-500">
                        Date
                      </th>
                      <th className="whitespace-nowrap px-2 py-2 text-label uppercase text-gray-500">
                        Description
                      </th>
                      <th className="whitespace-nowrap px-2 py-2 text-label uppercase text-gray-500">
                        Account
                      </th>
                      <th className="whitespace-nowrap px-2 py-2 text-right text-label uppercase text-gray-500">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-gray-500">
                          No matches found.
                          {previewSearch && (
                            <button type="button" className="ml-2 font-semibold text-navy-700 underline" onClick={() => setPreviewSearch('')}>
                              Clear search
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      previewRows.map((row) => {
                        const amtCls = row.amount < 0 ? 'text-pos' : 'text-navy-900';
                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-navy-100 last:border-0 ${
                              row.flag_for_review ? 'bg-gold-100/70' : 'hover:bg-navy-50/40'
                            }`}
                          >
                            <td className="whitespace-nowrap px-2 py-1.5">
                              <span className="inline-flex items-center gap-1">
                                {row.flag_for_review ? (
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500"
                                    title="Flagged for review"
                                  />
                                ) : null}
                                <span className="num-tab text-gray-700">
                                  {row.date ? formatDate(row.date) : '—'}
                                </span>
                              </span>
                            </td>
                            <td className="max-w-[200px] truncate px-2 py-1.5 font-semibold text-navy-900 md:max-w-none">
                              {row.description}
                            </td>
                            <td className="max-w-[120px] truncate px-2 py-1.5 text-gray-700">
                              {row.account_name || '—'}
                            </td>
                            <td className={`num-tab whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums ${amtCls}`}>
                              {formatMoney(row.amount)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => saveMut.mutate()}
            disabled={!canSave || saveMut.isPending}
          >
            {saveMut.isPending ? 'Saving…' : (editId ? 'Save Changes' : 'Create Rule')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/rules')}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Pre-fill heuristic from selection
// ----------------------------------------------------------------------------

function seedFromSelection(
  selected: MatchableTransaction[],
): { conditions: RuleCondition[]; suggestedName: string } {
  const conditions: RuleCondition[] = [];

  const descs = selected.map(t => t.description);
  let suggestedName = 'New rule';

  if (selected.length === 1) {
    const tok = longestMeaningfulToken(descs[0]);
    if (tok) {
      conditions.push({
        field: 'description', op: 'contains', value: tok, case_insensitive: true,
      });
      suggestedName = `${tok.slice(0, 30)} → category`;
    }
  } else {
    const prefix = longestCommonPrefix(descs);
    if (prefix.length >= 4) {
      conditions.push({
        field: 'description', op: 'starts_with', value: prefix.trim(), case_insensitive: true,
      });
      suggestedName = `${prefix.trim().slice(0, 30)} → category`;
    } else {
      const sub = mostCommonToken(descs);
      if (sub) {
        conditions.push({
          field: 'description', op: 'contains', value: sub, case_insensitive: true,
        });
        suggestedName = `${sub.slice(0, 30)} → category`;
      }
    }
  }

  const accounts = new Set(selected.map(t => t.account_name));
  if (accounts.size === 1) {
    const onlyAccount = [...accounts][0];
    if (onlyAccount) {
      conditions.push({ field: 'account', op: 'is', value: onlyAccount });
    }
  }

  const amounts = selected.map(t => t.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  if (selected.length >= 3 && max - min < 2) {
    conditions.push({ field: 'amount', op: 'between',
      min: Math.floor(min - 1), max: Math.ceil(max + 1) });
  }

  return { conditions, suggestedName };
}

function longestMeaningfulToken(description: string): string | null {
  const tokens = description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;
  return tokens.reduce((a, b) => (b.length > a.length ? b : a));
}

function longestCommonPrefix(strs: string[]): string {
  if (strs.length === 0) return '';
  let prefix = strs[0];
  for (const s of strs.slice(1)) {
    while (!s.toLowerCase().startsWith(prefix.toLowerCase())) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

function mostCommonToken(strs: string[]): string | null {
  const counts = new Map<string, number>();
  for (const s of strs) {
    const tokens = new Set(
      s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4)
    );
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: [string, number] | null = null;
  for (const [k, v] of counts) {
    if (v >= Math.ceil(strs.length * 0.6)) {
      if (!best || v > best[1]) best = [k, v];
    }
  }
  return best?.[0] ?? null;
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}
