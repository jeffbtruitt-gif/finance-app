import { useEffect, useMemo, useRef, useState } from 'react';
import { OneMoScreen } from './OneMoScreen';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import {
  fetchCategories,
  fetchAccounts,
  fetchTransactions,
  type CategoryOption,
} from '@/api/transactions';
import { applyBulkAction, listRules, updateRule } from '@/api/phase2';
import { fetchReviewQueue, fetchHistoryHints, merchantToken } from '@/api/review';
import { categoryColorHex } from '@/components/ds/CategoryChip';
import { accountStripeHex } from '@/pages/transactions/txAccountColor';
import { MakeRuleModal } from '@/pages/transactions/MakeRuleModal';
import type { TransactionRow } from '@/types';
import type { Rule } from '@/types/phase2';

// ── Helpers ───────────────────────────────────────────────────────────────────

function accountInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtDay(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'TODAY';
  if (dateStr === yest) return 'YESTERDAY';
  const [, m, d] = dateStr.split('-');
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${mo[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mo[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function fmtAmt(amount: number): string {
  const abs = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `+$${abs}` : `$${abs}`;
}

function groupByDate(txs: TransactionRow[]): [string, TransactionRow[]][] {
  const map = new Map<string, TransactionRow[]>();
  for (const tx of txs) {
    const arr = map.get(tx.date) ?? [];
    arr.push(tx);
    map.set(tx.date, arr);
  }
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Avatar({ accountId, name, size = 42 }: { accountId: string; name: string; size?: number }) {
  const stripe = accountStripeHex(accountId);
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 9, background: `${stripe}1a`,
        position: 'relative', flexShrink: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: stripe }} />
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: size < 38 ? 10 : 12, fontWeight: 700, color: stripe, marginLeft: 3 }}>
        {accountInitials(name)}
      </span>
    </div>
  );
}

function CatPill({ name }: { name: string | null | undefined }) {
  const hex = categoryColorHex(name);
  const label = name ?? 'Uncategorized';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: `${hex}1f`, color: hex, border: `1px solid ${hex}33`,
      borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600,
      flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: hex, display: 'inline-block' }} />
      {label}
    </span>
  );
}

// ── CategorizeSheet ───────────────────────────────────────────────────────────

interface SheetProps {
  tx: TransactionRow;
  categories: CategoryOption[];
  onApply: (catId: string, catName: string, alsoRule: boolean) => void;
  onClose: () => void;
}

function CategorizeSheet({ tx, categories, onApply, onClose }: SheetProps) {
  const [search, setSearch] = useState('');
  const [alsoRule, setAlsoRule] = useState(false);
  const [selected, setSelected] = useState<string>('');

  const filtered = useMemo(() => {
    if (!search) return categories;
    const q = search.toLowerCase();
    return categories.filter(c => c.name.toLowerCase().includes(q));
  }, [search, categories]);

  const grouped = useMemo(() => {
    const m = new Map<string, CategoryOption[]>();
    for (const c of filtered) {
      const g = c.group_name ?? 'Other';
      const arr = m.get(g) ?? [];
      arr.push(c);
      m.set(g, arr);
    }
    return [...m.entries()];
  }, [filtered]);

  const selCat = categories.find(c => c.id === selected);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(13,21,39,0.45)', zIndex: 60 }}
      />
      {/* Sheet */}
      <div
        className="mobile-sheet"
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 70,
          background: '#fff', borderRadius: '24px 24px 0 0',
          maxHeight: '82%', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 40px rgba(13,21,39,0.15)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e5ee' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 10px', borderBottom: '1px solid #f0f2f6' }}>
          <div style={{ fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 17, color: '#0d1527' }}>
            Categorize
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Avatar accountId={tx.account_id} name={tx.account_name} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#0d1527', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {merchantToken(tx.description)}
              </div>
              <div style={{ fontSize: 11, color: '#7a8196', marginTop: 1 }}>
                {tx.account_name} · {fmtDate(tx.date)}
              </div>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color: tx.amount < 0 ? '#1e7e5a' : '#0d1527' }}>
              {fmtAmt(tx.amount)}
            </span>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #f0f2f6' }}>
          <input
            type="text"
            placeholder="Search categories…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 10,
              background: '#f2f4f8', border: 'none', outline: 'none',
              fontFamily: "'Figtree', system-ui", fontSize: 14, color: '#0d1527',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Category list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
          {grouped.map(([group, cats]) => (
            <div key={group} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#9aa0af', padding: '6px 4px 4px', textTransform: 'uppercase' }}>
                {group}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {cats.map(c => {
                  const hex = categoryColorHex(c.name);
                  const isSel = selected === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c.id)}
                      style={{
                        padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                        background: isSel ? `${hex}20` : '#f8f9fc',
                        border: `1.5px solid ${isSel ? hex : '#eef0f7'}`,
                        cursor: 'pointer', transition: 'all 0.12s',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: hex, flexShrink: 0 }} />
                      <span style={{ fontFamily: "'Figtree', system-ui", fontSize: 13, fontWeight: isSel ? 700 : 500, color: isSel ? hex : '#374151', lineHeight: 1.2 }}>
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Also create rule toggle */}
        {selected && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid #f0f2f6', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setAlsoRule(v => !v)}
              style={{
                width: 42, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: alsoRule ? '#0d1527' : '#d1d5db', transition: 'background 0.2s',
                position: 'relative', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
                left: alsoRule ? 19 : 3,
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </button>
            <span style={{ fontFamily: "'Figtree', system-ui", fontSize: 13, color: '#374151' }}>
              Also create a rule for future matches
            </span>
          </div>
        )}

        {/* Action button */}
        <div style={{ padding: '10px 20px 24px' }}>
          <button
            disabled={!selected}
            onClick={() => selected && selCat && onApply(selected, selCat.name, alsoRule)}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: selected ? '#0d1527' : '#e5e7eb',
              color: selected ? '#fff' : '#9ca3af',
              fontFamily: "'Figtree', system-ui", fontSize: 16, fontWeight: 700,
              cursor: selected ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
            }}
          >
            {selCat ? `File as ${selCat.name}` : 'Select a category'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Review screen ─────────────────────────────────────────────────────────────

interface ReviewScreenProps {
  queue: TransactionRow[];
  localCats: Map<string, { id: string; name: string }>;
  hints: Map<string, { category: string; similar: number }>;
  categories: CategoryOption[];
  initialTotal: number;
  onApplyHint: (tx: TransactionRow, catId: string, catName: string) => void;
  onCategorize: (tx: TransactionRow) => void;
  onNewRule: (tx: TransactionRow) => void;
}

function ReviewScreen({ queue, localCats, hints, categories, initialTotal, onApplyHint, onCategorize, onNewRule }: ReviewScreenProps) {
  const visible = queue.filter(tx => !localCats.has(tx.id));
  const done = initialTotal - visible.length;
  const pct = initialTotal > 0 ? (done / initialTotal) * 100 : 0;

  if (visible.length === 0 && initialTotal === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#7a8196', padding: 32 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#22a39f" strokeWidth="1.6" />
          <path d="M8 12l3 3 5-5" stroke="#22a39f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 18, color: '#0d1527' }}>All caught up!</div>
        <div style={{ fontSize: 14, textAlign: 'center' }}>Every transaction has been categorized.</div>
      </div>
    );
  }

  const grouped = groupByDate(visible);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
      {/* Header summary */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: "'Figtree', system-ui", fontSize: 13, color: '#7a8196' }}>
            {visible.length} transaction{visible.length !== 1 ? 's' : ''} to review
          </div>
          {initialTotal > 0 && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#0d1527', fontWeight: 700 }}>
              {done}/{initialTotal}
            </div>
          )}
        </div>
        {initialTotal > 0 && (
          <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: '#e5e9f4', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#22a39f', width: `${pct}%`, borderRadius: 3, transition: 'width 0.4s ease' }} />
          </div>
        )}
      </div>

      {/* Explainer card (show first time only) */}
      {visible.length > 0 && done === 0 && (
        <div style={{ margin: '14px 16px 0', padding: '12px 16px', background: '#f4f5fb', borderRadius: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#edf0fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke="#0d1527" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 13, color: '#0d1527' }}>No rule matched</div>
            <div style={{ fontSize: 12, color: '#7a8196', marginTop: 3, lineHeight: 1.5 }}>
              Categorize each transaction manually, or create a rule to handle similar ones automatically.
            </div>
          </div>
        </div>
      )}

      {/* Transaction cards grouped by date */}
      {grouped.map(([date, txs]) => (
        <div key={date}>
          <div style={{ padding: '18px 20px 6px', fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', color: '#9aa0af' }}>
            {fmtDay(date)}
          </div>
          {txs.map(tx => {
            const token = merchantToken(tx.description);
            const hint = hints.get(token);
            const hintCat = hint ? categories.find(c => c.name === hint.category) : null;
            return (
              <div
                key={tx.id}
                style={{ margin: '0 16px 10px', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 8px rgba(13,21,39,0.07), 0 0 0 1px #eef0f7' }}
              >
                {/* Card header */}
                <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <Avatar accountId={tx.account_id} name={tx.account_name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#0d1527', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {token}
                    </div>
                    <div style={{ fontSize: 11, color: '#9aa0af', marginTop: 3 }}>
                      {tx.account_name} · {fmtDate(date)}
                    </div>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color: tx.amount < 0 ? '#1e7e5a' : '#0d1527', flexShrink: 0 }}>
                    {fmtAmt(tx.amount)}
                  </span>
                </div>

                {/* History hint row */}
                {hint && hintCat && (
                  <div style={{ margin: '0 12px 10px', padding: '8px 12px', background: '#f4f5fb', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="8" cy="8" r="6" stroke="#7a8196" strokeWidth="1.6" />
                      <path d="M8 4.6V8l2.4 1.5" stroke="#7a8196" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ flex: 1, fontSize: 12, color: '#374151' }}>
                      Filed <strong>{hint.similar}×</strong> as
                    </span>
                    <CatPill name={hintCat.name} />
                    <button
                      onClick={() => onApplyHint(tx, hintCat.id, hintCat.name)}
                      style={{ padding: '4px 10px', borderRadius: 8, background: '#0d1527', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: "'Figtree', system-ui" }}
                    >
                      Apply
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div style={{ padding: '0 12px 12px', display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => onCategorize(tx)}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: '#f4f5fb', border: '1.5px solid #e8eaf4', color: '#0d1527', fontFamily: "'Figtree', system-ui", fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M2.2 2.2H7l6.6 6.6a1.2 1.2 0 010 1.7l-3.1 3.1a1.2 1.2 0 01-1.7 0L2.2 7V2.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      <circle cx="5.2" cy="5.2" r="1.05" fill="currentColor" />
                    </svg>
                    Categorize
                  </button>
                  <button
                    onClick={() => onNewRule(tx)}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: '#f4f5fb', border: '1.5px solid #e8eaf4', color: '#0d1527', fontFamily: "'Figtree', system-ui", fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M9.5 1.5L3 9h5l-1.5 5.5L14 7h-5l0.5-5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                    New rule
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Transactions screen ───────────────────────────────────────────────────────

interface TxScreenProps {
  txs: TransactionRow[];
  localCats: Map<string, { id: string; name: string }>;
  onCategorize: (tx: TransactionRow) => void;
}

function TxScreen({ txs, localCats, onCategorize }: TxScreenProps) {
  const [search, setSearch] = useState('');

  const overlaid = useMemo(() =>
    txs.map(tx => {
      const local = localCats.get(tx.id);
      if (!local) return tx;
      return { ...tx, category_id: local.id, category_name: local.name };
    }),
    [txs, localCats]
  );

  const filtered = useMemo(() => {
    if (!search) return overlaid;
    const q = search.toLowerCase();
    return overlaid.filter(tx =>
      merchantToken(tx.description).toLowerCase().includes(q) ||
      tx.account_name.toLowerCase().includes(q) ||
      (tx.category_name ?? '').toLowerCase().includes(q)
    );
  }, [overlaid, search]);

  const grouped = groupByDate(filtered);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eef0f7' }}>
        <input
          type="text"
          placeholder="Search transactions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '9px 14px', borderRadius: 12,
            background: '#f2f4f8', border: 'none', outline: 'none',
            fontFamily: "'Figtree', system-ui", fontSize: 14, color: '#0d1527',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {grouped.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#9aa0af', fontFamily: "'Figtree', system-ui", fontSize: 14 }}>
            {search ? 'No transactions match.' : 'No transactions yet.'}
          </div>
        )}
        {grouped.map(([date, dateTxs]) => (
          <div key={date}>
            <div style={{ padding: '14px 20px 4px', fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', color: '#9aa0af' }}>
              {fmtDay(date)}
            </div>
            {dateTxs.map(tx => (
              <button
                key={tx.id}
                onClick={() => onCategorize(tx)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px', background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f4f5fb',
                }}
              >
                <Avatar accountId={tx.account_id} name={tx.account_name} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#0d1527', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {merchantToken(tx.description)}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <CatPill name={tx.category_name} />
                  </div>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: tx.amount < 0 ? '#1e7e5a' : '#0d1527', flexShrink: 0 }}>
                  {fmtAmt(tx.amount)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rules screen ──────────────────────────────────────────────────────────────

interface RulesScreenProps {
  rules: Rule[];
  onToggle: (rule: Rule) => void;
  onNew: () => void;
}

function conditionLabel(rule: Rule): string {
  if (!rule.conditions || rule.conditions.length === 0) return 'No conditions';
  const c = rule.conditions[0] as Record<string, unknown>;
  const field = String(c['field'] ?? '');
  const op = String(c['op'] ?? '');
  const value = String(c['value'] ?? '');
  const opLabels: Record<string, string> = { contains: 'contains', starts_with: 'starts with', equals: '=', regex: '~' };
  const opLabel = opLabels[op] ?? op;
  const fieldLabel = field === 'description' ? 'Desc' : field === 'amount' ? 'Amount' : field;
  const extra = rule.conditions.length > 1 ? ` +${rule.conditions.length - 1}` : '';
  return `${fieldLabel} ${opLabel} "${value.length > 20 ? value.slice(0, 20) + '…' : value}"${extra}`;
}

function RulesScreen({ rules, onToggle }: Omit<RulesScreenProps, 'onNew'>) {
  const active = rules.filter(r => r.is_active).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
        {active > 0 && (
          <div style={{ padding: '4px 4px 10px', fontFamily: "'Figtree', system-ui", fontSize: 12, color: '#9aa0af' }}>
            {active} active rule{active !== 1 ? 's' : ''}
          </div>
        )}
        {rules.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#9aa0af', fontFamily: "'Figtree', system-ui", fontSize: 14 }}>
            No rules yet. Create one from a transaction.
          </div>
        )}
        {rules.map(rule => (
          <div
            key={rule.id}
            style={{ marginBottom: 10, padding: '14px 16px', background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(13,21,39,0.06), 0 0 0 1px #eef0f7', opacity: rule.is_active ? 1 : 0.55 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Figtree', system-ui", fontWeight: 700, fontSize: 14, color: '#0d1527', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.name}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#7a8196', marginTop: 4 }}>
                  {conditionLabel(rule)}
                </div>
              </div>
              {/* Toggle */}
              <button
                onClick={() => onToggle(rule)}
                style={{
                  width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: rule.is_active ? '#0d1527' : '#d1d5db',
                  position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                  left: rule.is_active ? 21 : 3,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type Tab = '1mo' | 'review' | 'tx' | 'rules';

function TabStrip({ tab, setTab, reviewCount }: { tab: Tab; setTab: (t: Tab) => void; reviewCount: number }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: '1mo', label: '1 MO' },
    { id: 'review', label: 'Review' },
    { id: 'tx', label: 'Transactions' },
    { id: 'rules', label: 'Rules' },
  ];
  return (
    <div style={{ display: 'flex', padding: '0 20px', gap: 4 }}>
      {tabs.map(t => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 12px 9px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${active ? '#0d1527' : 'transparent'}`,
              marginBottom: -1,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: "'Figtree', system-ui",
              fontSize: 14, fontWeight: active ? 700 : 500,
              color: active ? '#0d1527' : '#9aa0af',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            {t.id === 'review' && reviewCount > 0 && (
              <span style={{
                minWidth: 18, height: 18, background: '#e5554f', color: '#fff',
                borderRadius: 9, fontFamily: "'Figtree', system-ui",
                fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>
                {reviewCount > 99 ? '99+' : reviewCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Frozen page header (title + tab strip) ────────────────────────────────────

function PageHeader({
  tab, setTab, reviewCount, subtitle, onNewRule,
}: {
  tab: Tab; setTab: (t: Tab) => void; reviewCount: number;
  subtitle?: string; onNewRule: () => void;
}) {
  const titles: Record<Tab, string> = { '1mo': 'Budget', review: 'Review', tx: 'Transactions', rules: 'Rules' };
  return (
    <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #eef0f7' }}>
      {tab !== '1mo' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 20px 6px' }}>
          <div>
            <div style={{ fontFamily: "'Figtree', system-ui", fontWeight: 800, fontSize: 26, color: '#0d1527', letterSpacing: '-0.02em' }}>
              {titles[tab]}
            </div>
            {subtitle && (
              <div style={{ fontFamily: "'Figtree', system-ui", fontSize: 13, color: '#7a8196', marginTop: 3 }}>
                {subtitle}
              </div>
            )}
          </div>
          {tab === 'rules' && (
            <button
              onClick={onNewRule}
              style={{ marginTop: 4, padding: '7px 14px', borderRadius: 10, background: '#0d1527', color: '#fff', border: 'none', fontFamily: "'Figtree', system-ui", fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              New rule
            </button>
          )}
        </div>
      )}
      <TabStrip tab={tab} setTab={setTab} reviewCount={reviewCount} />
    </div>
  );
}

// ── Full-screen wrapper ───────────────────────────────────────────────────────

function IOSFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#f4f5fb', overflow: 'hidden' }}>
      {children}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div style={{
      position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(13,21,39,0.9)', color: '#fff',
      padding: '10px 20px', borderRadius: 12,
      fontFamily: "'Figtree', system-ui", fontSize: 13, fontWeight: 600,
      zIndex: 80, whiteSpace: 'nowrap',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(8px)',
    }}>
      {message}
    </div>
  );
}

// ── MobileApp ─────────────────────────────────────────────────────────────────

export function MobileApp() {
  const qc = useQueryClient();
  const household = useHousehold();
  const hid = household?.id;

  const schemeQ = useQuery({
    queryKey: defaultSchemeQueryKey(hid),
    enabled: !!hid,
    queryFn: () => fetchDefaultSchemeId(hid!),
  });
  const sid = schemeQ.data;

  const reviewQ = useQuery({
    queryKey: ['review-queue', sid],
    enabled: !!sid,
    queryFn: () => fetchReviewQueue(sid!),
  });

  const hintsQ = useQuery({
    queryKey: ['history-hints', hid, sid],
    enabled: !!hid && !!sid,
    queryFn: () => fetchHistoryHints(hid!, sid!),
  });

  const allTxQ = useQuery({
    queryKey: ['all-tx-mobile', sid],
    enabled: !!sid,
    queryFn: () => fetchTransactions({ page: 0, pageSize: 200, schemeId: sid }),
  });

  const catsQ = useQuery({
    queryKey: ['categories', sid],
    enabled: !!sid,
    queryFn: () => fetchCategories(sid!),
  });

  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  });

  const rulesQ = useQuery({
    queryKey: ['rules', sid],
    enabled: !!sid,
    queryFn: () => listRules(sid!),
  });

  const [tab, setTab] = useState<Tab>('1mo');
  const [localCats, setLocalCats] = useState<Map<string, { id: string; name: string }>>(new Map());
  const [initialTotal, setInitialTotal] = useState<number | null>(null);
  const [sheetTx, setSheetTx] = useState<TransactionRow | null>(null);
  const [makeRuleOpen, setMakeRuleOpen] = useState(false);
  const [makeRuleSeed, setMakeRuleSeed] = useState<TransactionRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queue = reviewQ.data?.rows ?? [];
  const visibleQueue = queue.filter(tx => !localCats.has(tx.id));

  useEffect(() => {
    if (initialTotal === null && reviewQ.data) {
      setInitialTotal(reviewQ.data.total);
    }
  }, [reviewQ.data, initialTotal]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3200);
  }

  async function handleApplyHint(tx: TransactionRow, catId: string, catName: string) {
    if (!sid) return;
    setLocalCats(m => new Map(m).set(tx.id, { id: catId, name: catName }));
    showToast(`Filed as ${catName}`);
    try {
      await applyBulkAction(sid, [tx.id], { type: 'set_category', category_id: catId });
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      qc.invalidateQueries({ queryKey: ['all-tx-mobile'] });
    } catch {
      setLocalCats(m => { const n = new Map(m); n.delete(tx.id); return n; });
      showToast('Error — try again');
    }
  }

  async function handleSheetApply(catId: string, catName: string, alsoRule: boolean) {
    if (!sid || !sheetTx) return;
    const tx = sheetTx;
    setSheetTx(null);
    setLocalCats(m => new Map(m).set(tx.id, { id: catId, name: catName }));
    showToast(`Filed as ${catName}`);
    try {
      await applyBulkAction(sid, [tx.id], { type: 'set_category', category_id: catId });
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      qc.invalidateQueries({ queryKey: ['all-tx-mobile'] });
    } catch {
      setLocalCats(m => { const n = new Map(m); n.delete(tx.id); return n; });
      showToast('Error — try again');
      return;
    }
    if (alsoRule) {
      const seed = { ...tx, category_id: catId, category_name: catName };
      setMakeRuleSeed(seed);
      setMakeRuleOpen(true);
    }
  }

  const toggleMutation = useMutation({
    mutationFn: (rule: Rule) => updateRule(rule.id, { is_active: !rule.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules', sid] }),
  });

  const categories = catsQ.data ?? [];
  const accounts = accountsQ.data ?? [];
  const rules = rulesQ.data ?? [];
  const allTx = allTxQ.data?.rows ?? [];

  const isLoading = !sid || reviewQ.isLoading;

  if (isLoading) {
    return (
      <IOSFrame>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa0af', fontFamily: "'Figtree', system-ui", fontSize: 14 }}>
          Loading…
        </div>
      </IOSFrame>
    );
  }

  const reviewSubtitle = visibleQueue.length > 0
    ? `${visibleQueue.length} transaction${visibleQueue.length !== 1 ? 's' : ''} didn't match a rule`
    : undefined;

  return (
    <IOSFrame>
      {/* Frozen header: title + tab strip */}
      <PageHeader
        tab={tab}
        setTab={setTab}
        reviewCount={visibleQueue.length}
        subtitle={tab === 'review' ? reviewSubtitle : undefined}
        onNewRule={() => { setMakeRuleSeed(null); setMakeRuleOpen(true); }}
      />

      {/* Scrollable content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {tab === '1mo' && hid && sid && (
          <OneMoScreen householdId={hid} schemeId={sid} />
        )}
        {tab === 'review' && (
          <ReviewScreen
            queue={queue}
            localCats={localCats}
            hints={hintsQ.data ?? new Map()}
            categories={categories}
            initialTotal={initialTotal ?? 0}
            onApplyHint={handleApplyHint}
            onCategorize={tx => setSheetTx(tx)}
            onNewRule={tx => { setMakeRuleSeed(tx); setMakeRuleOpen(true); }}
          />
        )}
        {tab === 'tx' && (
          <TxScreen
            txs={allTx}
            localCats={localCats}
            onCategorize={tx => setSheetTx(tx)}
          />
        )}
        {tab === 'rules' && (
          <RulesScreen
            rules={rules}
            onToggle={rule => toggleMutation.mutate(rule)}
          />
        )}

        {/* Categorize sheet */}
        {sheetTx && (
          <CategorizeSheet
            tx={sheetTx}
            categories={categories}
            onApply={handleSheetApply}
            onClose={() => setSheetTx(null)}
          />
        )}

        {/* Toast */}
        {toast && <Toast message={toast} />}
      </div>

      {/* MakeRuleModal renders as a fixed overlay over the whole page */}
      <MakeRuleModal
        open={makeRuleOpen}
        onClose={() => { setMakeRuleOpen(false); setMakeRuleSeed(null); }}
        seed={makeRuleSeed}
        householdId={hid ?? ''}
        schemeId={sid}
        categories={categories}
        accounts={accounts}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['rules', sid] });
          showToast('Rule created');
        }}
        toast={showToast}
      />
    </IOSFrame>
  );
}
