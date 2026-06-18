import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import { fetchCategories, fetchAccounts, type CategoryOption } from '@/api/transactions';
import { applyBulkAction } from '@/api/phase2';
import { fetchReviewQueue, fetchHistoryHints, merchantToken, type HistoryHint } from '@/api/review';
import { categoryColorHex, CategoryChip } from '@/components/ds';
import { accountStripeHex } from '@/pages/transactions/txAccountColor';
import { MakeRuleModal } from '@/pages/transactions/MakeRuleModal';
import type { TransactionRow } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function accountInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtDayLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === yest) return 'Yesterday';
  const [, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function fmtDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function fmtReviewAmount(amount: number): string {
  const abs = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconHistory({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.6V8l2.4 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTag({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M2.2 2.2H7l6.6 6.6a1.2 1.2 0 010 1.7l-3.1 3.1a1.2 1.2 0 01-1.7 0L2.2 7V2.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="5.2" cy="5.2" r="1.05" fill="currentColor" />
    </svg>
  );
}

function IconBoltSm({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M9.5 1.5L3 9h5l-1.5 5.5L14 7h-5l0.5-5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IconCheckSm({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M3 8.5l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── AccountAvatar ──────────────────────────────────────────────────────────────

function AccountAvatar({ accountId, accountName, size }: { accountId: string; accountName: string; size: number }) {
  const stripe = accountStripeHex(accountId);
  const initials = accountInitials(accountName);
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[9px] border border-gray-200 bg-gray-50"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: stripe }} />
      <div
        className="font-mono-ds flex h-full items-center justify-center font-semibold text-gray-600"
        style={{ fontSize: Math.round(size * 0.34), paddingLeft: 2 }}
      >
        {initials}
      </div>
    </div>
  );
}

// ── ReviewCard ────────────────────────────────────────────────────────────────

interface ReviewCardProps {
  tx: TransactionRow;
  hint: HistoryHint | null;
  disabled: boolean;
  onOpen: () => void;
  onApplyHint: (categoryName: string) => void;
  onNewRule: () => void;
}

function ReviewCard({ tx, hint, disabled, onOpen, onApplyHint, onNewRule }: ReviewCardProps) {
  return (
    <div className="mx-4 mb-[11px]">
      <div className="rounded-[18px] border border-gray-200 bg-white px-4 py-[15px] shadow-[0_1px_2px_rgba(13,21,39,0.05),0_4px_14px_rgba(13,21,39,0.04)]">
        {/* Header — tap to open categorize sheet */}
        <div className="flex cursor-pointer items-center gap-3" onClick={onOpen}>
          <AccountAvatar accountId={tx.account_id} accountName={tx.account_name} size={38} />
          <div className="min-w-0 flex-1">
            <div className="font-mono-ds truncate text-[13.5px] font-semibold text-navy-900">
              {tx.description}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              {tx.account_name} · {fmtDateShort(tx.date)}
            </div>
          </div>
          <span
            className={`font-mono-ds text-[16.5px] font-bold tabular-nums ${tx.amount < 0 ? 'text-pos' : 'text-navy-900'}`}
          >
            {fmtReviewAmount(tx.amount)}
          </span>
        </div>

        {/* History hint */}
        {hint && hint.similar > 0 && (
          <div className="mt-3 flex items-center gap-2.5 rounded-[13px] border border-navy-100 bg-navy-50 py-[9px] pl-[11px] pr-[10px]">
            <span className="shrink-0 text-navy-700">
              <IconHistory />
            </span>
            <div className="min-w-0 flex-1 text-[11.5px] leading-[1.4] text-gray-600">
              You've filed{' '}
              <span className="font-mono-ds font-bold text-navy-700">{hint.similar}</span> like this
              as <CategoryChip name={hint.category} className="!text-[11px]" />
            </div>
            <button
              onClick={() => onApplyHint(hint.category)}
              disabled={disabled}
              className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-navy-700 px-3 py-[7px] text-[12.5px] font-bold text-white transition hover:bg-navy-600 disabled:opacity-50"
            >
              <IconCheckSm />
              Apply
            </button>
          </div>
        )}

        {/* Action row */}
        <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
          <button
            onClick={onOpen}
            disabled={disabled}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-gray-200 bg-white py-2.5 text-[13.5px] font-bold text-navy-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <IconTag />
            Categorize
          </button>
          <button
            onClick={onNewRule}
            disabled={disabled}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-gray-200 bg-white py-2.5 text-[13.5px] font-bold text-navy-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <IconBoltSm />
            New rule
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ReviewCategorizeModal ─────────────────────────────────────────────────────

interface ReviewCategorizeModalProps {
  tx: TransactionRow;
  hint: HistoryHint | null;
  categories: CategoryOption[];
  catByName: Map<string, string>;
  catById: Map<string, string>;
  busy: boolean;
  onApply: (categoryId: string, categoryName: string, makeRule: boolean) => void;
  onClose: () => void;
}

function ReviewCategorizeModal({
  tx,
  hint,
  categories,
  catByName,
  catById,
  busy,
  onApply,
  onClose,
}: ReviewCategorizeModalProps) {
  const hintCatId = hint?.category ? (catByName.get(hint.category) ?? null) : null;
  const [sel, setSel] = useState<string | null>(hintCatId);
  const [makeRule, setMakeRule] = useState(false);
  const [q, setQ] = useState('');

  // Reset when tx changes
  useEffect(() => {
    setSel(hintCatId);
    setMakeRule(false);
    setQ('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.id]);

  const grouped = useMemo(() => {
    const s = q.trim().toLowerCase();
    const m = new Map<string, CategoryOption[]>();
    for (const c of categories) {
      if (s && !c.name.toLowerCase().includes(s)) continue;
      const key = c.group_name ?? 'Other';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    const GROUP_ORDER = [
      'Food', 'Transport', 'Shopping', 'Lifestyle', 'Bills',
      'Health', 'Travel', 'Income', 'Transfer', 'Family',
    ];
    return [...m.keys()]
      .sort((a, b) => {
        const ia = GROUP_ORDER.indexOf(a);
        const ib = GROUP_ORDER.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
      })
      .map((k) => ({ label: k, items: m.get(k)! }));
  }, [categories, q]);

  const selName = sel ? (catById.get(sel) ?? '') : '';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy-900/40"
        style={{ backdropFilter: 'blur(1.5px)' }}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Categorize transaction"
        className="relative flex max-h-[88vh] w-full max-w-[480px] flex-col overflow-hidden bg-gray-50"
        style={{ borderRadius: 26, boxShadow: '0 -10px 40px rgba(13,21,39,0.22)' }}
      >
        {/* Drag handle (visual only) */}
        <div className="flex shrink-0 justify-center py-2.5">
          <div className="h-1.5 w-9 rounded-full bg-gray-300" />
        </div>

        {/* Transaction summary */}
        <div className="shrink-0 px-5 pb-4">
          <div className="flex items-center gap-3">
            <AccountAvatar accountId={tx.account_id} accountName={tx.account_name} size={42} />
            <div className="min-w-0 flex-1">
              <div className="font-mono-ds truncate text-[14.5px] font-semibold text-navy-900">
                {tx.description}
              </div>
              <div className="text-[12.5px] text-gray-500">
                {tx.account_name} · {fmtDateShort(tx.date)}
              </div>
            </div>
            <span
              className={`font-mono-ds text-[19px] font-bold tabular-nums ${tx.amount < 0 ? 'text-pos' : 'text-navy-900'}`}
            >
              {fmtReviewAmount(tx.amount)}
            </span>
          </div>
        </div>

        {/* From your history quick-pick */}
        {hint && hint.similar > 0 && hintCatId && (
          <button
            onClick={() => setSel((prev) => (prev === hintCatId ? null : hintCatId))}
            className="mx-4 mb-3.5 shrink-0 cursor-pointer text-left transition"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: '#f4f5fb',
              border: `1.5px solid ${sel === hintCatId ? '#243460' : '#e8ecf5'}`,
              borderRadius: 16,
              padding: '12px 13px',
              boxShadow: sel === hintCatId ? '0 0 0 3px rgba(36,52,96,0.10)' : 'none',
            }}
          >
            <div
              className="flex shrink-0 items-center justify-center text-navy-700"
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#fff',
                border: '1px solid #e8ecf5',
              }}
            >
              <IconHistory />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500">From your history</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <CategoryChip name={hint.category} className="!text-[11px]" />
                <span className="text-[11.5px] text-gray-500">
                  {hint.similar} similar categorized this way
                </span>
              </div>
            </div>
            {sel === hintCatId ? (
              <span className="shrink-0 text-navy-700">
                <IconCheckSm size={18} />
              </span>
            ) : (
              <span
                className="shrink-0 rounded-full border-2 border-gray-300"
                style={{ width: 18, height: 18, display: 'inline-block' }}
              />
            )}
          </button>
        )}

        {/* Section label */}
        <div className="shrink-0 px-[22px] pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-navy-500">
          Choose a category
        </div>

        {/* Search */}
        <div className="shrink-0 px-5 pb-3">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-gray-400">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search categories"
              className="flex-1 bg-transparent text-[15px] text-navy-900 outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Category 2-column grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {grouped.map((g) => (
            <div key={g.label} className="mb-3.5">
              <div className="mb-2 px-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">
                {g.label}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {g.items.map((c) => {
                  const on = sel === c.id;
                  const hex = categoryColorHex(c.name);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSel(on ? null : c.id)}
                      className="flex items-center gap-2 text-left text-sm font-semibold transition"
                      style={{
                        borderRadius: 13,
                        padding: '11px 12px',
                        border: `1.5px solid ${on ? '#243460' : '#e2e5ec'}`,
                        backgroundColor: on ? `${hex}1a` : '#fff',
                        boxShadow: on ? '0 0 0 3px rgba(36,52,96,0.10)' : 'none',
                        color: on ? hex : '#0d1527',
                      }}
                    >
                      <span
                        className="shrink-0 rounded-full"
                        style={{ width: 10, height: 10, background: hex }}
                      />
                      <span className="flex-1 truncate">{c.name}</span>
                      {on && (
                        <span className="shrink-0 text-navy-700">
                          <IconCheckSm />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
          {/* Also create a rule toggle */}
          <button
            onClick={() => setMakeRule((r) => !r)}
            className="mb-3 flex w-full items-center gap-3 text-left"
          >
            <span className="text-navy-700">
              <IconBoltSm />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-navy-800">Also create a rule</span>
              <span className="block text-xs text-gray-500">Auto-categorize future matches</span>
            </span>
            {/* Toggle */}
            <span
              className="relative shrink-0 rounded-full transition-colors"
              style={{
                width: 44,
                height: 26,
                background: makeRule ? '#243460' : '#c5cad4',
                display: 'inline-block',
              }}
            >
              <span
                className="absolute top-[3px] rounded-full bg-white"
                style={{
                  width: 20,
                  height: 20,
                  left: makeRule ? 21 : 3,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  transition: 'left 0.18s',
                }}
              />
            </span>
          </button>

          {/* Primary button */}
          <button
            disabled={!sel || busy}
            onClick={() => sel && onApply(sel, selName, makeRule)}
            className="flex w-full items-center justify-center rounded-[14px] py-4 text-base font-bold text-white transition"
            style={{
              background: sel ? '#243460' : '#c5cad4',
              cursor: sel ? 'pointer' : 'not-allowed',
            }}
          >
            {busy
              ? 'Saving…'
              : makeRule
                ? 'Apply & create rule'
                : sel
                  ? `Categorize as ${selName}`
                  : 'Pick a category'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ReviewPage ────────────────────────────────────────────────────────────────

export function ReviewPage() {
  const qc = useQueryClient();
  const household = useHousehold();

  const schemeQ = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });
  const schemeId = schemeQ.data;

  const queueQ = useQuery({
    queryKey: ['review-queue', schemeId],
    enabled: !!schemeId,
    queryFn: () => fetchReviewQueue(schemeId!),
  });

  const hintsQ = useQuery({
    queryKey: ['review-hints', household?.id, schemeId],
    enabled: !!household?.id && !!schemeId,
    queryFn: () => fetchHistoryHints(household!.id, schemeId!),
    staleTime: 5 * 60 * 1000,
  });

  const categoriesQ = useQuery({
    queryKey: ['categories', schemeId],
    enabled: !!schemeId,
    queryFn: () => fetchCategories(schemeId!),
  });

  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  });

  // Track categorizations applied this session (optimistic removal from queue)
  const [localCats, setLocalCats] = useState(new Set<string>());
  // Freeze the total at first load so the progress bar shows correct context
  const [initialTotal, setInitialTotal] = useState<number | null>(null);
  useEffect(() => {
    if (queueQ.isSuccess && initialTotal === null) {
      setInitialTotal(queueQ.data.total);
    }
  }, [queueQ.isSuccess, queueQ.data?.total, initialTotal]);

  const [busy, setBusy] = useState(false);
  const [sheetTx, setSheetTx] = useState<TransactionRow | null>(null);
  const [makeRuleSeed, setMakeRuleSeed] = useState<TransactionRow | null>(null);
  const [makeRuleOpen, setMakeRuleOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }

  const hintsMap = hintsQ.data ?? new Map<string, HistoryHint>();

  // Lookup maps
  const catByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categoriesQ.data ?? []) m.set(c.name, c.id);
    return m;
  }, [categoriesQ.data]);

  const catById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categoriesQ.data ?? []) m.set(c.id, c.name);
    return m;
  }, [categoriesQ.data]);

  // The visible queue (excluding locally categorized items)
  const visibleQueue = useMemo(
    () => (queueQ.data?.rows ?? []).filter((tx) => !localCats.has(tx.id)),
    [queueQ.data, localCats],
  );

  const done = localCats.size;
  const total = initialTotal ?? (queueQ.data?.total ?? 0);
  const remaining = visibleQueue.length;
  const groups = useMemo(() => groupByDate(visibleQueue), [visibleQueue]);

  function getHint(tx: TransactionRow): HistoryHint | null {
    return hintsMap.get(merchantToken(tx.description)) ?? null;
  }

  // Apply a hint directly from the card (no modal)
  async function handleApplyHint(tx: TransactionRow, categoryName: string) {
    const catId = catByName.get(categoryName);
    if (!catId || !schemeId || busy) return;
    setBusy(true);
    try {
      await applyBulkAction(schemeId, [tx.id], { type: 'set_category', category_id: catId });
      setLocalCats((prev) => { const s = new Set(prev); s.add(tx.id); return s; });
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      showToast(`Categorized as ${categoryName}`);
    } catch {
      showToast('Could not save — please try again');
    } finally {
      setBusy(false);
    }
  }

  // Apply from the categorize modal
  async function handleSheetApply(
    categoryId: string,
    categoryName: string,
    makeRule: boolean,
  ) {
    if (!sheetTx || !schemeId || busy) return;
    const tx = sheetTx;
    setBusy(true);
    try {
      await applyBulkAction(schemeId, [tx.id], { type: 'set_category', category_id: categoryId });
      setLocalCats((prev) => { const s = new Set(prev); s.add(tx.id); return s; });
      setSheetTx(null);
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      if (makeRule) {
        setMakeRuleSeed({ ...tx, category_id: categoryId, category_name: categoryName });
        setMakeRuleOpen(true);
      } else {
        showToast(`Categorized as ${categoryName}`);
      }
    } catch {
      showToast('Could not save — please try again');
    } finally {
      setBusy(false);
    }
  }

  const isLoading = schemeQ.isLoading || queueQ.isLoading;

  return (
    <div className="flex-1 overflow-y-auto py-8">
      <div className="mx-auto max-w-2xl px-4">
        {/* Page header */}
        <div className="px-[4px] pb-4">
          <h2 className="text-[32px] font-extrabold leading-[1.05] tracking-tight text-navy-800">
            Review
          </h2>
          <p className="mt-1.5 text-[13.5px] font-medium text-gray-500">
            {isLoading
              ? 'Loading…'
              : remaining > 0
                ? `${remaining} transaction${remaining !== 1 ? 's' : ''} didn't match a rule`
                : "You're all caught up"}
          </p>
        </div>

        {/* Progress bar */}
        {!isLoading && total > 0 && (
          <div className="mb-3 flex items-center gap-2.5 px-[4px]">
            <div className="relative h-[7px] flex-1 overflow-hidden rounded-full bg-gray-200">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-navy-700 transition-[width] duration-[350ms] ease-out"
                style={{ width: `${Math.round((done / total) * 100)}%` }}
              />
            </div>
            <span className="font-mono-ds tabular-nums text-xs font-semibold text-gray-500">
              {done}/{total}
            </span>
          </div>
        )}

        {/* Explainer card */}
        {!isLoading && remaining > 0 && (
          <div className="mb-3 flex gap-2.5 rounded-[13px] border border-gray-200 bg-gray-50 px-[13px] py-[11px]">
            <span className="mt-0.5 shrink-0 text-gray-400">
              <IconBoltSm />
            </span>
            <p className="text-xs leading-[1.45] text-gray-600">
              No active rule matched these.{' '}
              <strong className="font-bold text-navy-700">Categorize</strong> one to file it now,
              or make a <strong className="font-bold text-navy-700">rule</strong> to
              auto-categorize matches from here on.
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="mx-4 h-[120px] animate-pulse rounded-[18px] bg-gray-200" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && remaining === 0 && (
          <div className="mt-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-pos-soft text-pos">
              <IconCheckSm size={30} />
            </div>
            <p className="text-[17px] font-bold text-navy-800">All caught up</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">
              Every transaction matched a rule or was filed by hand.
              <br />
              New imports show up here.
            </p>
          </div>
        )}

        {/* Day groups */}
        {!isLoading && remaining > 0 && (
          <div className="pt-2">
            {groups.map(([day, items]) => (
              <div key={day}>
                <div
                  className="text-xs font-bold uppercase tracking-[0.04em] text-gray-400"
                  style={{ padding: '18px 22px 8px' }}
                >
                  {fmtDayLabel(day)}
                </div>
                {items.map((tx) => (
                  <ReviewCard
                    key={tx.id}
                    tx={tx}
                    hint={getHint(tx)}
                    disabled={busy}
                    onOpen={() => setSheetTx(tx)}
                    onApplyHint={(cat) => handleApplyHint(tx, cat)}
                    onNewRule={() => {
                      setMakeRuleSeed(tx);
                      setMakeRuleOpen(true);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Categorize modal */}
      {sheetTx && categoriesQ.data && (
        <ReviewCategorizeModal
          tx={sheetTx}
          hint={getHint(sheetTx)}
          categories={categoriesQ.data}
          catByName={catByName}
          catById={catById}
          busy={busy}
          onApply={handleSheetApply}
          onClose={() => setSheetTx(null)}
        />
      )}

      {/* Make rule modal (existing component) */}
      {household && schemeId && (
        <MakeRuleModal
          open={makeRuleOpen}
          onClose={() => { setMakeRuleOpen(false); setMakeRuleSeed(null); }}
          seed={makeRuleSeed}
          householdId={household.id}
          schemeId={schemeId}
          categories={categoriesQ.data ?? []}
          accounts={(accountsQ.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['review-queue'] });
          }}
          toast={showToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-[15px] bg-navy-800 px-4 py-[13px] text-white"
          style={{ zIndex: 300, boxShadow: '0 10px 30px rgba(13,21,39,0.35)', whiteSpace: 'nowrap' }}
        >
          <span className="text-gold-400">
            <IconCheckSm />
          </span>
          <span className="font-mono-ds text-[13.5px] font-semibold">{toast}</span>
        </div>
      )}
    </div>
  );
}
