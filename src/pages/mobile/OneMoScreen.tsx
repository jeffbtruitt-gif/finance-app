import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchMonthlyActuals,
  fetchBudgetYear,
  fetchSchemeCategories,
  fetchReportShellTransactions,
  actualsToLookup,
  budgetsToLookup,
  type MonthlyActualRow,
  type ReportShellTransaction,
} from '@/api/reports';
import {
  buildSpendReport,
  type GroupedSection,
  type GroupedRow,
} from '@/features/reports/grouping';
import {
  type Period,
  formatPeriod,
  periodStartIso,
  periodEndIso,
  shiftPeriod,
  currentPeriod,
} from '@/lib/period';
import { accountStripeHex } from '@/pages/transactions/txAccountColor';
import { merchantToken } from '@/api/review';

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastCompleteMonth(): Period {
  const now = new Date();
  const m = now.getMonth(); // 0-based
  if (m === 0) return { year: now.getFullYear() - 1, month: 12 };
  return { year: now.getFullYear(), month: m };
}

function isCurrentMonth(p: Period): boolean {
  const c = currentPeriod();
  return p.year === c.year && p.month === c.month;
}

function dayOfMonth(): number {
  return new Date().getDate();
}

function fmtDollars(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${mo[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function fmtAmt(amount: number): string {
  const abs = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `+$${abs}` : `$${abs}`;
}

function accountInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function buildCountLookup(rows: MonthlyActualRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.category_id, (m.get(r.category_id) ?? 0) + r.txn_count);
  return m;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ actual, budget, height = 5 }: { actual: number; budget: number; height?: number }) {
  const pct = budget > 0 ? Math.min(actual / budget, 1) * 100 : 0;
  const over = budget > 0 && actual > budget;
  return (
    <div style={{ height, borderRadius: height / 2, background: '#eef0f7', overflow: 'hidden', position: 'relative' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: over ? '#e5554f' : '#0d1527', borderRadius: height / 2, transition: 'width 0.3s ease' }} />
    </div>
  );
}

function OverUnderPill({ actual, budget }: { actual: number; budget: number }) {
  if (budget === 0) return null;
  const diff = budget - actual;
  const over = diff < 0;
  const label = over ? `+${fmtDollars(Math.abs(diff))} over` : `-${fmtDollars(diff)} left`;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 20,
      fontSize: 11, fontWeight: 600,
      background: over ? '#fef2f2' : '#f0fdf4',
      color: over ? '#e5554f' : '#1e7e5a',
      border: `1px solid ${over ? '#fecaca' : '#bbf7d0'}`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function TxAvatar({ accountId, name }: { accountId: string; name: string }) {
  const stripe = accountStripeHex(accountId);
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 8, background: `${stripe}1a`,
      position: 'relative', flexShrink: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: stripe }} />
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: stripe, marginLeft: 3 }}>
        {accountInitials(name)}
      </span>
    </div>
  );
}

// ── DrillDown ─────────────────────────────────────────────────────────────────

interface DrillTarget {
  name: string;
  actual: number;
  budget: number;
  txnCount: number;
  categoryIds: string[];
  isGroup: boolean;
}

function DrillDown({
  target,
  period,
  allTx,
  onBack,
}: {
  target: DrillTarget;
  period: Period;
  allTx: ReportShellTransaction[];
  onBack: () => void;
}) {
  const txs = useMemo(() => {
    const idSet = new Set(target.categoryIds);
    return allTx.filter(tx => tx.category_id && idSet.has(tx.category_id));
  }, [allTx, target.categoryIds]);

  // Group by date
  const grouped = useMemo(() => {
    const m = new Map<string, ReportShellTransaction[]>();
    for (const tx of txs) {
      const arr = m.get(tx.date) ?? [];
      arr.push(tx);
      m.set(tx.date, arr);
    }
    return [...m.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [txs]);

  const pct = target.budget > 0 ? Math.round((target.actual / target.budget) * 100) : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f5fb' }}>
      {/* Back + header */}
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #eef0f7', padding: '10px 20px 14px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0d1527', fontFamily: "'Figtree', system-ui", fontSize: 13, fontWeight: 600, padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Budget
        </button>
        <div style={{ fontFamily: "'Figtree', system-ui", fontWeight: 800, fontSize: 22, color: '#0d1527', letterSpacing: '-0.02em' }}>
          {target.name}
        </div>
        <div style={{ fontSize: 12, color: '#9aa0af', marginTop: 2 }}>
          {formatPeriod(period)} · {target.txnCount} transaction{target.txnCount !== 1 ? 's' : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 22, color: '#0d1527' }}>
            {fmtDollars(target.actual)}
          </span>
          <OverUnderPill actual={target.actual} budget={target.budget} />
        </div>
        {target.budget > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: '#9aa0af' }}>of {fmtDollars(target.budget)} budget</span>
              <span style={{ fontSize: 11, color: '#9aa0af' }}>{pct}%</span>
            </div>
            <ProgressBar actual={target.actual} budget={target.budget} height={5} />
          </div>
        )}
      </div>

      {/* Transactions */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {grouped.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#9aa0af', fontFamily: "'Figtree', system-ui", fontSize: 14 }}>
            No transactions this month.
          </div>
        )}
        {grouped.map(([date, dateTxs]) => (
          <div key={date}>
            <div style={{ padding: '12px 20px 4px', fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', color: '#9aa0af' }}>
              {fmtDay(date)}
            </div>
            {dateTxs.map(tx => (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: '1px solid #f4f5fb', background: '#fff' }}>
                <TxAvatar accountId={tx.account_id} name={tx.account_name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#0d1527', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {merchantToken(tx.description)}
                  </div>
                  {target.isGroup && tx.category_name && (
                    <div style={{ marginTop: 3, fontSize: 11, color: '#9aa0af' }}>{tx.category_name}</div>
                  )}
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: tx.amount < 0 ? '#1e7e5a' : '#0d1527', flexShrink: 0 }}>
                  {fmtAmt(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Table view ────────────────────────────────────────────────────────────────

function TableView({
  sections,
  countLookup,
  onDrill,
}: {
  sections: GroupedSection[];
  countLookup: Map<string, number>;
  onDrill: (target: DrillTarget) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set([sections[0]?.group ?? '']));

  function toggle(group: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(group)) n.delete(group);
      else n.add(group);
      return n;
    });
  }

  return (
    <div style={{ padding: '10px 16px 24px' }}>
      {sections.map(sec => {
        const isOpen = expanded.has(sec.group);
        const over = sec.budgetTotal > 0 && sec.actualTotal > sec.budgetTotal;
        const pct = sec.budgetTotal > 0 ? Math.round((sec.actualTotal / sec.budgetTotal) * 100) : 0;
        const groupTxCount = sec.rows.reduce((s, r) => s + (countLookup.get(r.category.id) ?? 0), 0);

        return (
          <div key={sec.group} style={{ marginBottom: 10, background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(13,21,39,0.06), 0 0 0 1px #eef0f7' }}>
            {/* Group header */}
            <button
              onClick={() => toggle(sec.group)}
              style={{ width: '100%', display: 'flex', alignItems: 'flex-start', padding: '14px 16px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 10 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                      <path d="M3 5l4 4 4-4" stroke="#9aa0af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 14, color: '#0d1527' }}>{sec.group}</span>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color: over ? '#e5554f' : '#0d1527', flexShrink: 0 }}>
                    {fmtDollars(sec.actualTotal)}
                  </span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <ProgressBar actual={sec.actualTotal} budget={sec.budgetTotal} height={4} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                  <span style={{ fontSize: 11, color: '#9aa0af' }}>
                    of {fmtDollars(sec.budgetTotal)} · {pct}%
                  </span>
                  <OverUnderPill actual={sec.actualTotal} budget={sec.budgetTotal} />
                </div>
              </div>
            </button>

            {/* Category rows */}
            {isOpen && (
              <div style={{ borderTop: '1px solid #f4f5fb' }}>
                {sec.rows.map((row: GroupedRow) => {
                  const count = countLookup.get(row.category.id) ?? 0;
                  if (row.actual === 0 && row.budget === 0) return null;
                  const catOver = row.budget > 0 && row.actual > row.budget;
                  const catPct = row.budget > 0 ? Math.round((row.actual / row.budget) * 100) : 0;
                  return (
                    <button
                      key={row.category.id}
                      onClick={() => onDrill({ name: row.category.name, actual: row.actual, budget: row.budget, txnCount: count, categoryIds: [row.category.id], isGroup: false })}
                      style={{ width: '100%', display: 'block', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid #f8f9fc', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: "'Figtree', system-ui", fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.category.name}
                          </span>
                          {count > 0 && (
                            <span style={{ padding: '1px 6px', borderRadius: 10, background: '#f4f5fb', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#7a8196', flexShrink: 0 }}>
                              {count}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <OverUnderPill actual={row.actual} budget={row.budget} />
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: catOver ? '#e5554f' : '#0d1527' }}>
                            {fmtDollars(row.actual)}
                          </span>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M4 2.5l3.5 3.5L4 9.5" stroke="#d1d5db" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </div>
                      <div style={{ marginTop: 5 }}>
                        <ProgressBar actual={row.actual} budget={row.budget} height={3} />
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: '#9aa0af' }}>
                        of {fmtDollars(row.budget)} budget · {catPct}%
                      </div>
                    </button>
                  );
                })}
                {/* View all link */}
                <button
                  onClick={() => onDrill({
                    name: sec.group,
                    actual: sec.actualTotal,
                    budget: sec.budgetTotal,
                    txnCount: groupTxCount,
                    categoryIds: sec.rows.map(r => r.category.id),
                    isGroup: true,
                  })}
                  style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center', fontFamily: "'Figtree', system-ui", fontSize: 13, fontWeight: 600, color: '#0d1527' }}
                >
                  View all {groupTxCount} transactions →
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Chart view ────────────────────────────────────────────────────────────────

function ChartView({
  sections,
  onDrill,
}: {
  sections: GroupedSection[];
  onDrill: (target: DrillTarget) => void;
}) {
  const maxActual = Math.max(...sections.map(s => Math.max(s.actualTotal, s.budgetTotal)), 1);

  return (
    <div style={{ padding: '10px 16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 4px 14px', fontSize: 12, color: '#7a8196' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 10, background: '#0d1527', borderRadius: 2, display: 'inline-block' }} />
          Actual
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 10, border: '2px dashed #c8ccd8', borderRadius: 2, display: 'inline-block' }} />
          Budget
        </span>
      </div>
      {sections.map(sec => {
        const over = sec.budgetTotal > 0 && sec.actualTotal > sec.budgetTotal;
        const actualW = (sec.actualTotal / maxActual) * 100;
        const budgetW = (sec.budgetTotal / maxActual) * 100;
        return (
          <button
            key={sec.group}
            onClick={() => onDrill({ name: sec.group, actual: sec.actualTotal, budget: sec.budgetTotal, txnCount: sec.rows.length, categoryIds: sec.rows.map(r => r.category.id), isGroup: true })}
            style={{ width: '100%', marginBottom: 14, padding: '14px 16px', background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(13,21,39,0.06), 0 0 0 1px #eef0f7', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'block' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 14, color: '#0d1527' }}>{sec.group}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: over ? '#e5554f' : '#374151' }}>
                {fmtDollars(sec.actualTotal)} / {fmtDollars(sec.budgetTotal)}
              </span>
            </div>
            {/* Budget track (dashed outline) */}
            <div style={{ position: 'relative', height: 22 }}>
              <div style={{ position: 'absolute', top: 4, left: 0, height: 14, width: `${budgetW}%`, border: '2px dashed #c8ccd8', borderRadius: 7, boxSizing: 'border-box' }} />
              {/* Actual bar */}
              <div style={{ position: 'absolute', top: 7, left: 0, height: 8, width: `${Math.min(actualW, budgetW)}%`, background: over ? '#e5554f' : '#0d1527', borderRadius: 4 }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── OneMoScreen ───────────────────────────────────────────────────────────────

export function OneMoScreen({ householdId, schemeId }: { householdId: string; schemeId: string }) {
  const [period, setPeriod] = useState<Period>(lastCompleteMonth);
  const [subTab, setSubTab] = useState<'table' | 'chart'>('table');
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null);

  const categoriesQ = useQuery({
    queryKey: ['scheme-categories', schemeId],
    enabled: !!schemeId,
    queryFn: () => fetchSchemeCategories(schemeId),
  });

  const actualsQ = useQuery({
    queryKey: ['monthly-actuals-mobile', householdId, schemeId, period.year, period.month],
    enabled: !!householdId && !!schemeId,
    queryFn: () => fetchMonthlyActuals({ household_id: householdId, scheme_id: schemeId, from: period, to: period }),
  });

  const budgetQ = useQuery({
    queryKey: ['budget-year-mobile', householdId, period.year],
    enabled: !!householdId,
    queryFn: () => fetchBudgetYear({ household_id: householdId, year: period.year }),
  });

  // Transactions for drill-down (fetched for the whole month)
  const txQ = useQuery({
    queryKey: ['report-tx-mobile', householdId, schemeId, period.year, period.month],
    enabled: !!householdId && !!schemeId && !!drillTarget,
    queryFn: () => fetchReportShellTransactions({
      household_id: householdId,
      scheme_id: schemeId,
      from: periodStartIso(period),
      to: periodEndIso(period),
    }),
  });

  const report = useMemo(() => {
    if (!categoriesQ.data || !actualsQ.data || !budgetQ.data) return null;
    return buildSpendReport({
      categories: categoriesQ.data,
      periods: [period],
      actuals: actualsToLookup(actualsQ.data),
      budgets: budgetsToLookup(budgetQ.data),
    });
  }, [categoriesQ.data, actualsQ.data, budgetQ.data, period]);

  const countLookup = useMemo(() =>
    actualsQ.data ? buildCountLookup(actualsQ.data) : new Map<string, number>(),
    [actualsQ.data]
  );

  const isLoading = categoriesQ.isLoading || actualsQ.isLoading || budgetQ.isLoading;
  const isCurrent = isCurrentMonth(period);

  const summaryPct = report && report.grandBudget > 0
    ? Math.round((report.grandActual / report.grandBudget) * 100)
    : 0;
  const summaryOver = report ? report.grandActual > report.grandBudget : false;

  function stepMonth(delta: number) {
    setPeriod(p => shiftPeriod(p, delta));
    setDrillTarget(null);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Frozen sub-header ── */}
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #eef0f7' }}>

        {/* Month selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 8px' }}>
          <button onClick={() => stepMonth(-1)} style={{ width: 32, height: 32, borderRadius: 8, background: '#f4f5fb', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="#374151" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 15, color: '#0d1527' }}>
              {formatPeriod(period)}
            </div>
            <div style={{ marginTop: 2 }}>
              {isCurrent ? (
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#e5554f', background: '#fef2f2', padding: '1px 7px', borderRadius: 6 }}>
                  IN PROGRESS · DAY {dayOfMonth()}
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#1e7e5a', background: '#f0fdf4', padding: '1px 7px', borderRadius: 6 }}>
                  COMPLETE
                </span>
              )}
            </div>
          </div>
          <button onClick={() => stepMonth(1)} style={{ width: 32, height: 32, borderRadius: 8, background: '#f4f5fb', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="#374151" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* Table / Chart sub-tabs */}
        <div style={{ display: 'flex', padding: '0 20px', borderTop: '1px solid #f4f5fb' }}>
          {(['table', 'chart'] as const).map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              style={{
                padding: '8px 14px 7px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${subTab === t ? '#0d1527' : 'transparent'}`,
                marginBottom: -1,
                fontFamily: "'Figtree', system-ui", fontSize: 13,
                fontWeight: subTab === t ? 700 : 500,
                color: subTab === t ? '#0d1527' : '#9aa0af',
                textTransform: 'capitalize',
              }}
            >
              {t === 'table' ? 'Table' : 'Chart'}
            </button>
          ))}
        </div>

        {/* Summary card */}
        {report && (
          <div style={{ margin: '10px 16px 12px', padding: '14px 16px', background: '#0d1527', borderRadius: 14, borderLeft: '4px solid #c9a84c', position: 'relative' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#c9a84c', marginBottom: 4 }}>
              SPENT THIS MONTH
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 28, color: '#fff', lineHeight: 1.1 }}>
                  {fmtDollars(report.grandActual)}
                </div>
                <div style={{ fontSize: 12, color: '#8e97b4', marginTop: 4 }}>
                  of {fmtDollars(report.grandBudget)} budget · {summaryPct}%
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: summaryOver ? '#f87171' : '#34d399', letterSpacing: '0.04em' }}>
                  {summaryOver ? 'OVER BUDGET' : 'LEFT TO SPEND'}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16, color: summaryOver ? '#f87171' : '#34d399', marginTop: 2 }}>
                  {summaryOver ? '+' : ''}{fmtDollars(Math.abs(report.grandBudget - report.grandActual))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(summaryPct, 100)}%`, background: summaryOver ? '#f87171' : '#c9a84c', borderRadius: 2, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {isLoading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa0af', fontFamily: "'Figtree', system-ui", fontSize: 14 }}>
            Loading…
          </div>
        )}

        {!isLoading && report && !drillTarget && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {subTab === 'table' && (
              <TableView
                sections={report.sections}
                countLookup={countLookup}
                onDrill={setDrillTarget}
              />
            )}
            {subTab === 'chart' && (
              <ChartView
                sections={report.sections}
                onDrill={setDrillTarget}
              />
            )}
          </div>
        )}

        {/* Drill-down overlay */}
        {drillTarget && (
          <DrillDown
            target={drillTarget}
            period={period}
            allTx={txQ.data ?? []}
            onBack={() => setDrillTarget(null)}
          />
        )}
      </div>
    </div>
  );
}
