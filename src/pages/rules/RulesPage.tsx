import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { supabase } from '@/api/supabase';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import { listRules, deleteRule, updateRule, reorderRules, loadScope } from '@/api/phase2';
import { countMatches } from '@/features/rules/engine';
import type { MatchableTransaction } from '@/types/phase2';
import { Button } from '@/components/ds';
import { StatusPanel } from '@/components/StatusPanel';
import { IconBolt, IconClose, IconPlay, IconSearch } from './rulesIcons';
import { SCROLL_TIDY, StatCard } from './rulesShared';
import { RuleRow } from './RuleRow';
import { RuleEditor } from './RuleEditor';

type ActiveFilter = 'active' | 'all' | 'disabled';
const ALL_CATEGORIES = '__all__';

export function RulesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const household = useHousehold();

  const schemeQuery = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });
  const schemeId = schemeQuery.data;

  const rulesQuery = useQuery({
    queryKey: ['rules', schemeId],
    enabled: !!schemeId,
    queryFn: () => listRules(schemeId!),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories', schemeId],
    enabled: !!schemeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tf_categories')
        .select('id, name, group_name')
        .eq('scheme_id', schemeId!)
        .eq('status', 'active')
        .order('sort_order');
      if (error) throw error;
      return data as { id: string; name: string; group_name: string | null }[];
    },
  });

  const allTxQuery = useQuery({
    queryKey: ['rule-builder-tx', household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const [txRes, acctRes] = await Promise.all([
        supabase
          .from('tf_transactions')
          .select('id, description, amount, account_id')
          .eq('household_id', household!.id)
          .limit(20000),
        supabase.from('tf_accounts').select('id, name').eq('household_id', household!.id),
      ]);
      if (txRes.error) throw txRes.error;
      if (acctRes.error) throw acctRes.error;
      const acctMap = new Map(acctRes.data.map((a) => [a.id, a.name]));
      return txRes.data.map((t) => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        account_name: acctMap.get(t.account_id) ?? '',
      })) as MatchableTransaction[];
    },
  });

  const uncategorizedQ = useQuery({
    queryKey: ['uncategorized-count', household?.id, schemeId],
    enabled: !!household?.id && !!schemeId,
    queryFn: async () => {
      const { transactions } = await loadScope(household!.id, {
        kind: 'uncategorized',
        scheme_id: schemeId!,
      });
      return transactions.length;
    },
    staleTime: 60_000,
  });

  const orderedRules = rulesQuery.data ?? [];
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const categoryNameById = (id: string) =>
    categoriesQuery.data?.find((c) => c.id === id)?.name ?? '(unknown)';

  const assignedCategoryIds = useMemo(() => {
    const ids = new Set(orderedRules.map((r) => r.action_category_id));
    return Array.from(ids).sort((a, b) => {
      const nameA = categoryNameById(a).toLowerCase();
      const nameB = categoryNameById(b).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [orderedRules, categoriesQuery.data]);

  const matchCountByRule = useMemo(() => {
    const txs = allTxQuery.data;
    const m = new Map<string, number>();
    if (!txs) return m;
    for (const r of orderedRules) {
      m.set(r.id, countMatches(r, txs));
    }
    return m;
  }, [orderedRules, allTxQuery.data]);

  const totalMatches = useMemo(() => {
    let s = 0;
    for (const r of orderedRules) {
      if (r.is_active) s += matchCountByRule.get(r.id) ?? 0;
    }
    return s;
  }, [orderedRules, matchCountByRule]);

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orderedRules.filter((r) => {
      if (activeFilter === 'active' && !r.is_active) return false;
      if (activeFilter === 'disabled' && r.is_active) return false;
      if (categoryFilter !== ALL_CATEGORIES && r.action_category_id !== categoryFilter)
        return false;
      if (!q) return true;
      if (r.name.toLowerCase().includes(q)) return true;
      const catName = categoryNameById(r.action_category_id).toLowerCase();
      if (catName.includes(q)) return true;
      const hay = JSON.stringify(r.conditions).toLowerCase();
      return hay.includes(q);
    });
  }, [orderedRules, search, activeFilter, categoryFilter, categoriesQuery.data]);

  const activeCount = orderedRules.filter((r) => r.is_active).length;

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateRule(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => reorderRules(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });

  function moveRuleById(id: string, dir: -1 | 1) {
    const arr = [...orderedRules];
    const idx = arr.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    reorderMut.mutate(arr.map((r) => r.id));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const bulkDisable = () => {
    for (const id of selectedIds) toggleMut.mutate({ id, is_active: false });
    setSelectedIds(new Set());
  };
  const bulkEnable = () => {
    for (const id of selectedIds) toggleMut.mutate({ id, is_active: true });
    setSelectedIds(new Set());
  };
  const bulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} rule(s)?`)) return;
    for (const id of selectedIds) deleteMut.mutate(id);
    setSelectedIds(new Set());
  };

  const loading = schemeQuery.isLoading || rulesQuery.isLoading;
  const err = schemeQuery.error ?? rulesQuery.error;

  return (
    <div className="min-h-0">
      <header className="border-b border-navy-100 bg-white px-6 pb-5 pt-7 md:px-8">
        <div className="text-caption text-gray-500">
          <span>Categorization</span>
          <span className="mx-1.5 text-gray-300">/</span>
          <span className="font-semibold text-navy-700">Rules</span>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-2xl text-[14px] text-gray-600">
            Drag rows to change priority — rules apply top to bottom.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              + New rule
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/rules/run')}
              className="inline-flex items-center gap-1.5"
            >
              <IconPlay className="text-white" />
              Run rules
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-6 md:px-8">
        {loading && <StatusPanel kind="loading" message="Loading rules…" />}
        {!loading && err && (
          <StatusPanel kind="error" message="Could not load rules." detail={(err as Error).message} />
        )}

        {!loading && !err && schemeId && household && (
          <>
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="Active rules"
                value={
                  <span>
                    <span className="font-mono tabular-nums">{activeCount}</span>
                    <span className="text-h4 font-medium text-gray-400">
                      {' '}
                      / {orderedRules.length}
                    </span>
                  </span>
                }
              />
              <StatCard
                label="Total matches"
                value={<span className="font-mono tabular-nums">{totalMatches}</span>}
              />
              <StatCard
                label="Uncategorized"
                value={
                  <span className="font-mono tabular-nums text-warn">
                    {uncategorizedQ.isLoading ? '…' : uncategorizedQ.data ?? 0}
                  </span>
                }
              />
            </div>

            <div className="flex flex-col overflow-hidden rounded-lg border border-navy-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 px-4 py-2.5">
                <div className="relative max-w-sm min-w-[12rem] flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                    <IconSearch />
                  </span>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search rules…"
                    className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 py-1 pl-8 pr-3 text-sm focus:border-navy-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/20"
                  />
                </div>
                <div className="inline-flex rounded-md bg-gray-100 p-0.5 text-[11px] font-semibold">
                  {(['active', 'all', 'disabled'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setActiveFilter(k)}
                      className={
                        'rounded-[5px] px-2.5 py-1 capitalize transition-colors ' +
                        (activeFilter === k
                          ? 'bg-white text-navy-800 shadow-sm'
                          : 'text-gray-600 hover:text-navy-800')
                      }
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-8 rounded-md border border-gray-200 bg-gray-50 px-2 text-[12px] font-medium text-navy-800 focus:border-navy-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/20"
                >
                  <option value={ALL_CATEGORIES}>All categories</option>
                  {assignedCategoryIds.map((catId) => (
                    <option key={catId} value={catId}>
                      {categoryNameById(catId)}
                    </option>
                  ))}
                </select>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-gray-500">
                  {filteredRules.length} of {orderedRules.length}
                </span>
              </div>

              {creating && (
                <div className="border-b border-navy-100 bg-gold-100/30 px-4 py-3">
                  <RuleEditor
                    mode="create"
                    rule={null}
                    schemeId={schemeId}
                    householdId={household.id}
                    categories={categoriesQuery.data ?? []}
                    transactions={allTxQuery.data}
                    onCancel={() => setCreating(false)}
                    onSaved={() => setCreating(false)}
                  />
                </div>
              )}

              <div className={`max-h-[60vh] overflow-y-auto ${SCROLL_TIDY}`}>
                {filteredRules.length === 0 && !creating ? (
                  <div className="px-6 py-16 text-center">
                    <div className="text-h4 text-navy-800">No rules match</div>
                    <p className="mt-2 text-[13px] text-gray-600">
                      Try clearing your search, or create a new rule.
                    </p>
                    <Button variant="primary" size="sm" className="mt-4" onClick={() => setCreating(true)}>
                      + Create rule
                    </Button>
                  </div>
                ) : (
                  filteredRules.map((rule) => {
                    const globalIdx = orderedRules.findIndex((r) => r.id === rule.id);
                    return (
                      <div key={rule.id}>
                        <RuleRow
                          rule={rule}
                          index={globalIdx >= 0 ? globalIdx : 0}
                          total={orderedRules.length}
                          matchCount={matchCountByRule.get(rule.id) ?? 0}
                          expanded={expandedId === rule.id}
                          selected={selectedIds.has(rule.id)}
                          categoryName={categoryNameById(rule.action_category_id)}
                          onToggleExpand={() =>
                            setExpandedId((id) => (id === rule.id ? null : rule.id))
                          }
                          onToggleSelect={() => toggleSelect(rule.id)}
                          onMove={(dir) => moveRuleById(rule.id, dir)}
                          onToggleActive={() =>
                            toggleMut.mutate({ id: rule.id, is_active: !rule.is_active })
                          }
                          onDelete={() => {
                            if (confirm(`Delete rule "${rule.name}"?`)) deleteMut.mutate(rule.id);
                          }}
                        />
                        {expandedId === rule.id && (
                          <div className="border-t border-navy-100 bg-navy-50/40 px-4 pb-4 pt-1">
                            <RuleEditor
                              mode="edit"
                              rule={rule}
                              schemeId={schemeId}
                              householdId={household.id}
                              categories={categoriesQuery.data ?? []}
                              transactions={allTxQuery.data}
                              onCancel={() => setExpandedId(null)}
                              onSaved={() => setExpandedId(null)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 bg-navy-50/60 px-4 py-2.5">
                  <span className="text-[12px] font-semibold text-navy-800">
                    {selectedIds.size} selected
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={bulkDisable}>
                      Disable
                    </Button>
                    <Button variant="ghost" size="sm" onClick={bulkEnable}>
                      Enable
                    </Button>
                    <Button variant="danger" size="sm" onClick={bulkDelete}>
                      Delete
                    </Button>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-navy-700 hover:bg-navy-100"
                      aria-label="Clear selection"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      <IconClose />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-start gap-3 rounded-lg border border-navy-100 bg-navy-50 px-4 py-3">
              <IconBolt className="mt-0.5 h-5 w-5 shrink-0 text-gold-500" />
              <div className="min-w-0 flex-1">
                <strong className="text-navy-900">Ready to apply?</strong>
                <p className="mt-0.5 text-[13px] text-gray-600">
                  Run rules against uncategorized transactions and preview every change before
                  it&apos;s saved.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/rules/run')}
                className="inline-flex items-center gap-1.5"
              >
                <IconPlay />
                Run rules
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
