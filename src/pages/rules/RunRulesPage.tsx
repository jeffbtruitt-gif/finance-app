import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { supabase } from '@/api/supabase';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import { listRules, loadScope, applyCategorizations, type ScopeKind } from '@/api/phase2';
import { computeDryRun } from '@/features/rules/dryRun';
import type { DryRunRow, DryRunSummary } from '@/types/phase2';
import { Badge, Button, CategoryChip } from '@/components/ds';
import { formatDate } from '@/lib/date';
import { errorMessageFromUnknown } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { IconBolt, IconCheck, IconPlay, IconWarn } from './rulesIcons';
import { SCROLL_TIDY, StatTile } from './rulesShared';
import { TransactionPropertiesDrawer } from '@/pages/transactions/TransactionPropertiesDrawer';

type ScopeUi = 'uncategorized' | 'date_range' | 'selection';
type ShowOnly = 'all' | 'new' | 'rule_to_rule' | 'manual_override';

function rowKind(row: DryRunRow): Exclude<ShowOnly, 'all'> {
  if (row.overwrites_manual) return 'manual_override';
  if (row.current_source === 'rule') return 'rule_to_rule';
  return 'new';
}

export function RunRulesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const household = useHousehold();
  const [searchParams] = useSearchParams();
  const fromParam = searchParams.get('from');
  const selectionIds = fromParam?.split(',').filter(Boolean) ?? [];

  const schemeQ = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });

  const [detailTxnId, setDetailTxnId] = useState<string | null>(null);

  const [scopeType, setScopeType] = useState<ScopeUi>(() =>
    selectionIds.length > 0 ? 'selection' : 'uncategorized',
  );
  const [fromDate, setFromDate] = useState(() => firstOfYear());
  const [toDate, setToDate] = useState(() => today());
  const [summary, setSummary] = useState<DryRunSummary | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showOnly, setShowOnly] = useState<ShowOnly>('all');

  async function buildPreview() {
    if (!household) return;
    if (scopeType === 'selection' && selectionIds.length === 0) {
      setSummary(null);
      return;
    }
    setPreviewError(null);
    setBuilding(true);
    try {
      const scheme_id = await qc.fetchQuery({
        queryKey: defaultSchemeQueryKey(household.id),
        queryFn: () => fetchDefaultSchemeId(household.id),
      });

      let scope: ScopeKind;
      if (scopeType === 'uncategorized') {
        scope = { kind: 'uncategorized', scheme_id };
      } else if (scopeType === 'date_range') {
        scope = { kind: 'date_range', scheme_id, from: fromDate, to: toDate };
      } else {
        scope = { kind: 'selection', transaction_ids: selectionIds };
      }

      const [rules, scopeData, catList] = await Promise.all([
        listRules(scheme_id),
        loadScope(household.id, scope),
        supabase
          .from('tf_categories')
          .select('id, name')
          .eq('scheme_id', scheme_id)
          .then((r) => {
            if (r.error) throw r.error;
            return r.data;
          }),
      ]);

      const category_names = new Map<string, string>();
      for (const c of catList ?? []) category_names.set(c.id, c.name);

      const dryRun = computeDryRun({
        rules,
        scope_transactions: scopeData.transactions,
        category_names,
      });

      setSummary(dryRun);
      setShowOnly('all');
      const initialExcluded = new Set<string>();
      for (const row of dryRun.rows) {
        if (!row.default_included) initialExcluded.add(row.transaction_id);
      }
      setExcluded(initialExcluded);
    } catch (e) {
      setPreviewError(errorMessageFromUnknown(e));
      setSummary(null);
    } finally {
      setBuilding(false);
    }
  }

  function toggleRow(tid: string) {
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  }

  function bulkToggleManual(include: boolean) {
    if (!summary) return;
    setExcluded((s) => {
      const next = new Set(s);
      for (const row of summary.rows) {
        if (row.overwrites_manual) {
          if (include) next.delete(row.transaction_id);
          else next.add(row.transaction_id);
        }
      }
      return next;
    });
  }

  const includedRows = useMemo(() => {
    if (!summary) return [];
    return summary.rows.filter((r) => !excluded.has(r.transaction_id));
  }, [summary, excluded]);

  const filteredRows = useMemo(() => {
    if (!summary) return [];
    if (showOnly === 'all') return summary.rows;
    return summary.rows.filter((r) => rowKind(r) === showOnly);
  }, [summary, showOnly]);

  const applyMut = useMutation({
    mutationFn: async () => {
      if (!summary || !household) return;
      const scheme_id = await qc.fetchQuery({
        queryKey: defaultSchemeQueryKey(household.id),
        queryFn: () => fetchDefaultSchemeId(household.id),
      });
      await applyCategorizations({
        scheme_id,
        assignments: includedRows.map((r) => ({
          transaction_id: r.transaction_id,
          category_id: r.proposed_category_id,
          source: 'rule' as const,
          rule_id: r.matched_rule_id,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['transaction_categories'] });
      navigate('/rules');
    },
  });

  const dateInp =
    'h-8 rounded-md border border-gray-300 bg-white px-2 font-mono text-[12px] text-navy-900 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20';

  const includedCount = includedRows.length;
  const excludedCount = summary ? summary.rows.length - includedCount : 0;

  return (
    <div className="min-h-0">
      <header className="border-b border-navy-100 bg-white px-6 pb-5 pt-7 md:px-8">
        <div className="text-caption text-gray-500">
          <Link to="/rules" className="hover:text-navy-700">
            Rules
          </Link>
          <span className="mx-1.5 text-gray-300">/</span>
          <span className="font-semibold text-navy-700">Run Rules</span>
        </div>
        <p className="mt-2 max-w-3xl text-[14px] text-gray-600">
          Apply your rules to a scope of transactions. Review every proposed change before saving
          — nothing is committed until you click Apply.
        </p>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-6 py-6 md:px-8">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-navy-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-label uppercase tracking-wider text-gray-500">Scope</span>
            <div className="inline-flex rounded-lg bg-gray-100 p-1">
              {(
                [
                  ['uncategorized', 'All uncategorized'],
                  ['date_range', 'Date range'],
                  ['selection', 'From selection'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  disabled={k === 'selection' && selectionIds.length === 0}
                  title={
                    k === 'selection' && selectionIds.length === 0
                      ? 'Select transactions on the Transactions page, then use Make rule / Run rules with a selection URL.'
                      : undefined
                  }
                  onClick={() => {
                    setScopeType(k);
                    setSummary(null);
                    setPreviewError(null);
                  }}
                  className={
                    'h-8 rounded-md px-3 text-[12px] font-semibold transition-colors ' +
                    (scopeType === k
                      ? 'border border-navy-100 bg-white text-navy-800 shadow-sm'
                      : 'text-gray-600 hover:text-navy-800 disabled:cursor-not-allowed disabled:opacity-40')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {scopeType === 'date_range' && (
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" className={dateInp} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <span className="text-gray-400">→</span>
                <input type="date" className={dateInp} value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            )}
            {scopeType === 'selection' && (
              <span className="text-[12px] text-gray-600">
                {selectionIds.length} transaction{selectionIds.length === 1 ? '' : 's'} from URL
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void buildPreview()}
            disabled={building || !household || (scopeType === 'selection' && selectionIds.length === 0)}
            className="inline-flex items-center gap-1.5"
          >
            <IconPlay />
            {building ? 'Computing…' : summary ? 'Recompute preview' : 'Compute preview'}
          </Button>
        </section>

        {previewError && (
          <div className="rounded-lg border border-neg/25 bg-neg-soft px-4 py-3 text-[13px] text-navy-900">
            <strong className="font-semibold">Preview failed.</strong>{' '}
            <span className="text-gray-800">{previewError}</span>
          </div>
        )}

        {!summary && (
          <div className="rounded-lg border border-dashed border-navy-200 bg-white px-6 py-16 text-center">
            <div className="text-h4 text-navy-800">Choose a scope and click Compute preview</div>
            <p className="mt-2 text-[13px] text-gray-600">
              No transactions are touched until you review and apply.
            </p>
          </div>
        )}

        {summary && (
          <>
            <section className="flex flex-wrap overflow-hidden rounded-lg border border-navy-100 bg-white shadow-sm">
              <StatTile label="In scope" value={summary.total_in_scope} hint="transactions" />
              <StatTile
                label="Newly categorized"
                value={summary.newly_categorized}
                hint="net new"
                accent="pos"
              />
              <StatTile
                label="Rule → Rule"
                value={summary.rule_to_rule}
                hint="reassigned"
                accent="gold"
              />
              <StatTile
                label="Manual → Rule"
                value={summary.manual_to_rule}
                hint="needs review"
                accent="neg"
              />
            </section>

            {summary.manual_to_rule > 0 && (
              <div className="flex flex-wrap items-start gap-3 rounded-lg border border-neg/20 bg-neg-soft px-4 py-3">
                <IconWarn className="mt-0.5 h-5 w-5 shrink-0 text-neg" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-navy-900">
                    {summary.manual_to_rule} row(s) would overwrite a manual selection.
                  </div>
                  <p className="mt-0.5 text-[13px] text-gray-700">
                    By default these are excluded from the apply step.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => bulkToggleManual(true)}>
                    Include all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => bulkToggleManual(false)}>
                    Keep excluded
                  </Button>
                </div>
              </div>
            )}

            <section className="flex flex-col overflow-hidden rounded-lg border border-navy-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 px-4 py-3">
                <h2 className="text-h4 text-navy-800">Proposed changes</h2>
                <Badge tone="navy">{summary.rows.length}</Badge>
                <div className="ml-auto inline-flex rounded-md bg-gray-100 p-0.5 text-[11px] font-semibold">
                  {(
                    [
                      ['all', 'All'],
                      ['new', 'New'],
                      ['rule_to_rule', 'Rule swaps'],
                      ['manual_override', 'Manual overrides'],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setShowOnly(k)}
                      className={
                        'rounded-[5px] px-2 py-1 transition-colors ' +
                        (showOnly === k
                          ? 'bg-white text-navy-800 shadow-sm'
                          : 'text-gray-600 hover:text-navy-800')
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`max-h-[55vh] overflow-auto ${SCROLL_TIDY}`}>
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 z-10 border-b border-navy-100 bg-gray-50">
                    <tr>
                      <th data-no-row-select className="w-10 px-2 py-2.5 text-left">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-navy-700"
                          checked={summary.rows.length > 0 && excluded.size === 0}
                          onChange={(e) => {
                            if (e.target.checked) setExcluded(new Set());
                            else setExcluded(new Set(summary.rows.map((r) => r.transaction_id)));
                          }}
                          aria-label="Toggle all rows"
                        />
                      </th>
                      <th className="px-2 py-2.5 text-left text-label uppercase tracking-wider text-gray-500">
                        Date
                      </th>
                      <th className="px-2 py-2.5 text-left text-label uppercase tracking-wider text-gray-500">
                        Description
                      </th>
                      <th className="px-2 py-2.5 text-right text-label uppercase tracking-wider text-gray-500">
                        Amount
                      </th>
                      <th className="px-2 py-2.5 text-left text-label uppercase tracking-wider text-gray-500">
                        Current
                      </th>
                      <th className="px-1 py-2.5 text-center text-gray-300">→</th>
                      <th className="px-2 py-2.5 text-left text-label uppercase tracking-wider text-gray-500">
                        Proposed
                      </th>
                      <th className="px-2 py-2.5 text-left text-label uppercase tracking-wider text-gray-500">
                        Why
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const kind = rowKind(row);
                      const isIncluded = !excluded.has(row.transaction_id);
                      const rowBg =
                        kind === 'manual_override'
                          ? 'bg-neg-soft/60'
                          : kind === 'rule_to_rule'
                            ? 'bg-warn-soft/40'
                            : 'hover:bg-gray-50';
                      return (
                        <tr
                          key={row.transaction_id}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('[data-no-row-select]')) return;
                            setDetailTxnId(row.transaction_id);
                          }}
                          className={`cursor-pointer border-t border-navy-100 transition-colors ${rowBg} ${
                            isIncluded ? '' : 'opacity-50'
                          }`}
                        >
                          <td data-no-row-select className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-navy-700"
                              checked={isIncluded}
                              onChange={() => toggleRow(row.transaction_id)}
                            />
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[12px] tabular-nums text-gray-600">
                            {formatDate(row.date)}
                          </td>
                          <td
                            className="max-w-[280px] truncate px-2 py-1.5 text-gray-800"
                            title={row.description}
                          >
                            {row.description}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right font-mono text-sm tabular-nums ${
                              row.amount > 0 ? 'font-semibold text-pos' : 'text-gray-800'
                            }`}
                          >
                            {row.amount > 0 ? '+' : ''}
                            {formatMoney(row.amount)}
                          </td>
                          <td className="px-2 py-1.5">
                            {row.current_category_name ? (
                              <CategoryChip name={row.current_category_name} />
                            ) : (
                              <span className="text-[12px] italic text-gray-400">none</span>
                            )}
                          </td>
                          <td className="px-1 py-1.5 text-center text-gray-300">→</td>
                          <td className="px-2 py-1.5">
                            <CategoryChip name={row.proposed_category_name} />
                          </td>
                          <td className="px-2 py-1.5">
                            {kind === 'manual_override' && (
                              <Badge tone="neg" dot>
                                Overrides manual
                              </Badge>
                            )}
                            {kind === 'rule_to_rule' && (
                              <Badge tone="warn" dot>
                                Rule → Rule
                              </Badge>
                            )}
                            {kind === 'new' && (
                              <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-600">
                                <IconBolt className="text-gold-500" />
                                <code className="font-mono text-[11px] text-navy-700">
                                  {row.matched_rule_name}
                                </code>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-[13px] text-gray-500">
                          No proposed changes — your rules already cover this scope.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 bg-gray-50 px-4 py-3">
                <p className="text-[13px] text-gray-700">
                  Will apply{' '}
                  <strong className="font-mono font-semibold text-navy-900 tabular-nums">
                    {includedCount}
                  </strong>{' '}
                  categorization{includedCount === 1 ? '' : 's'}
                  {excludedCount > 0 && (
                    <span className="text-gray-500">
                      {' '}
                      · {excludedCount} excluded
                    </span>
                  )}
                </p>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => navigate('/rules')}>
                    Cancel
                  </Button>
                  <Button
                    variant="accent"
                    size="md"
                    disabled={includedCount === 0 || applyMut.isPending}
                    onClick={() => applyMut.mutate()}
                    className="inline-flex items-center gap-1.5"
                  >
                    <IconCheck />
                    {applyMut.isPending
                      ? 'Applying…'
                      : `Apply ${includedCount} categorization${includedCount === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <TransactionPropertiesDrawer
        open={detailTxnId !== null}
        onClose={() => setDetailTxnId(null)}
        transactionId={detailTxnId}
        schemeId={schemeQ.data ?? null}
      />
    </div>
  );
}

function firstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
