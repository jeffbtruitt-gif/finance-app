import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteTransaction,
  fetchAccounts,
  fetchCategories,
  fetchTransactionById,
  updateTransaction,
} from '@/api/transactions';
import { fetchTrips } from '@/api/trips';
import type { CategoryOption } from '@/api/transactions';
import type { TransactionRow } from '@/types';
import { formatDate } from '@/lib/date';
import { Button } from '@/components/ds';
import { DescriptionSearchLink } from './DescriptionSearchLink';
import { errorMessageFromUnknown } from '@/lib/errors';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-4 block">
      <div className="text-label mb-1.5 uppercase text-gray-600">{label}</div>
      {children}
      {hint && <div className="text-caption mt-1 text-gray-500">{hint}</div>}
    </label>
  );
}

const inputCls =
  'w-full rounded-md border border-navy-200 px-3 py-2 text-sm text-navy-900 placeholder:text-gray-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300';

function amountDirty(rowAmt: number, str: string): boolean {
  const n = parseFloat(str);
  if (!Number.isFinite(n)) return true;
  return Math.round(n * 100) !== Math.round(rowAmt * 100);
}

export function TransactionPropertiesDrawer(props: {
  open: boolean;
  onClose: () => void;
  transactionId: string | null;
  schemeId: string | null;
  seedRow?: TransactionRow | null;
  /** Called after a successful delete so parents can clear selection / detail state. */
  onDeleted?: (id: string) => void;
}) {
  const { open, onClose, transactionId, schemeId, seedRow, onDeleted } = props;
  const qc = useQueryClient();

  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [sourceCategory, setSourceCategory] = useState('');
  const [cardMember, setCardMember] = useState('');
  const [externalId, setExternalId] = useState('');
  const [tag, setTag] = useState('');
  const [tripId, setTripId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [flagForReview, setFlagForReview] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const txnQ = useQuery({
    queryKey: ['transaction', schemeId, transactionId],
    enabled: open && !!schemeId && !!transactionId,
    queryFn: () => fetchTransactionById(schemeId!, transactionId!),
    placeholderData:
      seedRow && transactionId && seedRow.id === transactionId ? seedRow : undefined,
  });

  const row = txnQ.data ?? null;

  const accountsQ = useQuery({
    queryKey: ['accounts'],
    enabled: open,
    queryFn: fetchAccounts,
  });

  const categoriesQ = useQuery({
    queryKey: ['categories', schemeId],
    enabled: open && !!schemeId,
    queryFn: () => fetchCategories(schemeId!),
  });

  const tripsQ = useQuery({
    queryKey: ['trips', row?.household_id],
    enabled: open && !!row?.household_id,
    queryFn: () => fetchTrips(row!.household_id),
  });

  useEffect(() => {
    if (!open) {
      setDeleteConfirm(false);
      return;
    }
    if (!row) return;
    setDate(row.date);
    setDescription(row.description);
    setAmountStr(String(row.amount));
    setAccountId(row.account_id);
    setCategoryId(row.category_id ?? '');
    setSourceCategory(row.source_category ?? '');
    setCardMember(row.card_member ?? '');
    setExternalId(row.external_id ?? '');
    setTag(row.tag ?? '');
    setTripId(row.trip_id ?? '');
    setNotes(row.notes ?? '');
    setFlagForReview(row.flag_for_review);
  }, [
    open,
    row?.id,
    row?.date,
    row?.description,
    row?.amount,
    row?.account_id,
    row?.category_id,
    row?.source_category,
    row?.card_member,
    row?.external_id,
    row?.tag,
    row?.trip_id,
    row?.notes,
    row?.flag_for_review,
  ]);

  const accountOptions = useMemo(() => {
    const list = [...(accountsQ.data ?? [])];
    if (row && !list.some((a) => a.id === row.account_id)) {
      list.unshift({
        id: row.account_id,
        name: `${row.account_name || 'Account'} (inactive or hidden)`,
        source_type: '',
        is_active: false,
        link: null,
      });
    }
    return list;
  }, [accountsQ.data, row]);

  const categoryOptionsWithFallback = useMemo(() => {
    const list = [...(categoriesQ.data ?? [])];
    if (
      row?.category_id &&
      row.category_name &&
      !list.some((c) => c.id === row.category_id)
    ) {
      list.unshift({
        id: row.category_id,
        name: row.category_name,
        group_name: row.category_group,
        sort_order: -1,
        is_yearly: false,
        quick_assign: false,
        status: 'active',
      });
    }
    return list;
  }, [categoriesQ.data, row?.category_id, row?.category_name, row?.category_group]);

  const categoriesGrouped = useMemo(() => {
    const m = new Map<string, CategoryOption[]>();
    for (const c of categoryOptionsWithFallback) {
      const g = c.group_name ?? 'Other';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(c);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [categoryOptionsWithFallback]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!transactionId || !schemeId || !row) return;
      const desc = description.trim();
      if (!desc) throw new Error('Description is required');
      const amount = parseFloat(amountStr);
      if (!Number.isFinite(amount)) throw new Error('Amount must be a valid number');
      await updateTransaction({
        id: transactionId,
        scheme_id: schemeId,
        date,
        description: desc,
        amount,
        account_id: accountId,
        source_category: sourceCategory.trim() === '' ? null : sourceCategory,
        card_member: cardMember.trim() === '' ? null : cardMember,
        external_id: externalId.trim() === '' ? null : externalId,
        notes: notes.trim() === '' ? null : notes,
        tag: tag.trim() === '' ? null : tag,
        trip_id: tripId === '' ? null : tripId,
        flag_for_review: flagForReview,
        category_id: categoryId === '' ? null : categoryId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['transaction', schemeId, transactionId] });
      qc.invalidateQueries({ queryKey: ['category-transactions'] });
      qc.invalidateQueries({ queryKey: ['reports-shell-tx'] });
      qc.invalidateQueries({ queryKey: ['reports-monthly-actuals'] });
      qc.invalidateQueries({ queryKey: ['dashboard-data'] });
      qc.invalidateQueries({ queryKey: ['transaction_categories'] });
      setDeleteConfirm(false);
      onClose();
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!transactionId) return;
      await deleteTransaction(transactionId);
    },
    onSuccess: () => {
      if (!transactionId) return;
      const id = transactionId;
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.removeQueries({ queryKey: ['transaction', schemeId, id] });
      qc.invalidateQueries({ queryKey: ['category-transactions'] });
      qc.invalidateQueries({ queryKey: ['reports-shell-tx'] });
      qc.invalidateQueries({ queryKey: ['reports-monthly-actuals'] });
      qc.invalidateQueries({ queryKey: ['dashboard-data'] });
      qc.invalidateQueries({ queryKey: ['transaction_categories'] });
      qc.invalidateQueries({ queryKey: ['import-monthly-stats'] });
      qc.invalidateQueries({ queryKey: ['uncategorized-count'] });
      setDeleteConfirm(false);
      onClose();
      onDeleted?.(id);
    },
  });

  const amountOk = Number.isFinite(parseFloat(amountStr));
  const descOk = description.trim().length > 0;
  const accountOk = accountId.length > 0;

  const dirty =
    !!row &&
    (date !== row.date ||
      description !== row.description ||
      amountDirty(row.amount, amountStr) ||
      accountId !== row.account_id ||
      (categoryId || '') !== (row.category_id ?? '') ||
      (sourceCategory || '') !== (row.source_category ?? '') ||
      (cardMember || '') !== (row.card_member ?? '') ||
      (externalId || '') !== (row.external_id ?? '') ||
      (tag || '') !== (row.tag ?? '') ||
      (tripId || '') !== (row.trip_id ?? '') ||
      notes !== (row.notes ?? '') ||
      flagForReview !== row.flag_for_review);

  const canSave = dirty && descOk && amountOk && accountOk && !!schemeId && !!row;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-navy-900/30" onClick={onClose} aria-hidden />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-navy-100 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-navy-100 px-5 py-4">
          <div>
            <h2 className="text-h3 text-navy-900">Edit transaction</h2>
            <p className="text-caption text-gray-500">
              Outflows are positive; inflows (income) are negative — same as imports.
            </p>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-navy-50"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {txnQ.isLoading && !row && <p className="text-sm text-gray-500">Loading…</p>}
          {txnQ.error && (
            <p className="text-sm text-neg">{(txnQ.error as Error).message}</p>
          )}
          {(saveMut.error || deleteMut.error) && (
            <p className="mb-3 rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-sm text-navy-900">
              {errorMessageFromUnknown(saveMut.error ?? deleteMut.error)}
            </p>
          )}
          {row && (
            <>
              <div className="mb-4 rounded-lg border border-navy-100 bg-navy-50/40 px-3 py-2 text-caption text-gray-600">
                <div>
                  <span className="font-medium text-gray-500">Imported</span>{' '}
                  {new Date(row.imported_at).toLocaleString()}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-gray-500">ID {row.id}</div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date">
                  <input
                    type="date"
                    className={inputCls}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                <Field
                  label="Amount"
                  hint="Positive = spend/outflow; negative = income/credits."
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${inputCls} tabular-nums`}
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    aria-invalid={!amountOk}
                  />
                </Field>
              </div>

              <Field
                label="Description"
                hint="Use the search icon to look up an unfamiliar merchant on Google."
              >
                <div className="relative">
                  <input
                    type="text"
                    className={`${inputCls} pr-10`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    aria-invalid={!descOk}
                  />
                  <DescriptionSearchLink
                    description={description}
                    variant="inline"
                    className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                  />
                </div>
              </Field>

              <Field label="Account">
                <select
                  className={inputCls}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {accountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Category"
                hint="Default budget scheme. Cleared rows are uncategorized."
              >
                <select
                  className={inputCls}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={!schemeId}
                >
                  <option value="">Uncategorized</option>
                  {categoriesGrouped.map(([group, items]) => (
                    <optgroup key={group} label={group}>
                      {items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>

              <Field
                label="Trip"
                hint="Optional — links this row to a trip for highlighting."
              >
                <select
                  className={inputCls}
                  value={tripId}
                  onChange={(e) => setTripId(e.target.value)}
                  disabled={tripsQ.isLoading}
                >
                  <option value="">None</option>
                  {(tripsQ.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({formatDate(t.start_date)} — {formatDate(t.end_date)})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Bank / source category" hint="Raw label from CSV, if any.">
                <input
                  type="text"
                  className={inputCls}
                  value={sourceCategory}
                  onChange={(e) => setSourceCategory(e.target.value)}
                  placeholder="Optional"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Card member" hint="e.g. Amex cardholder field.">
                  <input
                    type="text"
                    className={inputCls}
                    value={cardMember}
                    onChange={(e) => setCardMember(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="External ID" hint="Bank stable id when present.">
                  <input
                    type="text"
                    className={inputCls}
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </div>

              <Field label="Tag">
                <input
                  type="text"
                  className={inputCls}
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="Optional"
                />
              </Field>

              <Field
                label="Notes"
                hint="Private notes — not used by imports or rules."
              >
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className={`${inputCls} resize-y`}
                  placeholder="Optional"
                />
              </Field>

              <Field label="Flag for review">
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-navy-100 bg-white px-3 py-3">
                  <input
                    type="checkbox"
                    checked={flagForReview}
                    onChange={(e) => setFlagForReview(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-navy-700 focus:ring-navy-300"
                  />
                  <span className="text-sm text-gray-700">
                    Mark for follow-up while reconciling.
                  </span>
                </label>
              </Field>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 bg-gray-50 px-5 py-3">
          <div className="flex min-h-7 flex-wrap items-center gap-2">
            {row && !deleteConfirm && (
              <Button
                variant="ghost"
                size="sm"
                className="text-neg hover:bg-neg-soft"
                disabled={saveMut.isPending || deleteMut.isPending}
                onClick={() => setDeleteConfirm(true)}
              >
                Delete
              </Button>
            )}
            {row && deleteConfirm && (
              <>
                <span className="text-xs text-gray-600">Delete permanently?</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deleteMut.isPending}
                  onClick={() => setDeleteConfirm(false)}
                >
                  Back
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate()}
                >
                  {deleteMut.isPending ? 'Deleting…' : 'Delete transaction'}
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={deleteMut.isPending}
              onClick={() => {
                setDeleteConfirm(false);
                onClose();
              }}
            >
              {dirty ? 'Cancel' : 'Close'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canSave || saveMut.isPending || deleteMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
