/**
 * Bills page — manage monthly recurring bills with website links.
 *
 * Lives under Budget Input in the nav, at /bills. Each bill has a name,
 * optional URL (the biller's website), due day, and notes. The main table
 * shows a prominent "Go" button to launch the URL in a new tab.
 * Add and edit use a centered modal dialog.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { fetchBills, createBill, updateBill, deleteBill, type Bill } from '@/api/bills';
import { StatusPanel } from '@/components/StatusPanel';
import { Button, Card, RT } from '@/components/ds';

export function BillsPage() {
  const household = useHousehold();
  const qc = useQueryClient();

  const billsQ = useQuery({
    queryKey: ['bills', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBills(household!.id),
  });

  const bills = billsQ.data ?? [];
  const activeBills = useMemo(() => bills.filter((b) => b.is_active), [bills]);
  const archivedBills = useMemo(() => bills.filter((b) => !b.is_active), [bills]);

  const [showArchived, setShowArchived] = useState(false);
  const [modalBill, setModalBill] = useState<Bill | 'new' | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bills', household?.id] });

  if (billsQ.error) {
    return (
      <StatusPanel
        kind="error"
        message="Couldn't load bills"
        detail={billsQ.error instanceof Error ? billsQ.error.message : undefined}
      />
    );
  }

  if (billsQ.isLoading) {
    return <StatusPanel kind="loading" message="Loading bills…" />;
  }

  const visibleBills = showArchived ? [...activeBills, ...archivedBills] : activeBills;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-gray-600">
          Monthly bills and their payment websites. Click <strong>Go</strong> to open the bill site in a new tab.
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-caption text-gray-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
          <Button variant="primary" size="sm" onClick={() => setModalBill('new')}>
            + Add Bill
          </Button>
        </div>
      </div>

      <Card padded={false}>
        <table className={`${RT.table} w-full table-fixed`}>
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[34%]" />
            <col className="w-[10%]" />
            <col className="w-[26%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className={RT.head}>
            <tr>
              <th className={`${RT.th} ${RT.thLeft}`}>Bill</th>
              <th className={`${RT.th} ${RT.thLeft}`}>Website</th>
              <th className={`${RT.th} ${RT.thRight}`}>Due Day</th>
              <th className={`${RT.th} ${RT.thLeft}`}>Notes</th>
              <th className={RT.th} />
            </tr>
          </thead>
          <tbody>
            {visibleBills.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No bills yet. Click <strong>+ Add Bill</strong> to get started.
                </td>
              </tr>
            ) : (
              visibleBills.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  onEdit={() => setModalBill(bill)}
                />
              ))
            )}
          </tbody>
        </table>
      </Card>

      {modalBill && (
        <BillModal
          bill={modalBill === 'new' ? null : modalBill}
          onSave={async (vals) => {
            if (modalBill === 'new') {
              if (!household) return;
              await createBill({
                household_id: household.id,
                ...vals,
                sort_order: bills.length * 10,
              });
            } else {
              await updateBill({ id: modalBill.id, patch: vals });
            }
            invalidate();
            setModalBill(null);
          }}
          onArchive={
            modalBill !== 'new'
              ? async () => {
                  await updateBill({ id: modalBill.id, patch: { is_active: !modalBill.is_active } });
                  invalidate();
                  setModalBill(null);
                }
              : undefined
          }
          onDelete={
            modalBill !== 'new'
              ? async () => {
                  if (!confirm(`Delete "${modalBill.name}"? This cannot be undone.`)) return;
                  await deleteBill(modalBill.id);
                  invalidate();
                  setModalBill(null);
                }
              : undefined
          }
          isArchived={modalBill !== 'new' ? !modalBill.is_active : false}
          onClose={() => setModalBill(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bill row (read-only)
// ---------------------------------------------------------------------------

function BillRow({ bill, onEdit }: { bill: Bill; onEdit: () => void }) {
  const hasUrl = bill.url && bill.url.trim().length > 0;
  const href =
    hasUrl && (bill.url!.startsWith('http://') || bill.url!.startsWith('https://'))
      ? bill.url!
      : hasUrl
        ? `https://${bill.url}`
        : null;

  return (
    <tr
      className={`border-t border-navy-100 hover:bg-navy-50/40 ${bill.is_active ? '' : 'text-gray-400'}`}
    >
      <td className="px-3 py-2 font-medium text-navy-900">
        {bill.name}
        {!bill.is_active && (
          <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500">
            Archived
          </span>
        )}
      </td>
      <td className="overflow-hidden px-3 py-2">
        {href ? (
          <div className="flex min-w-0 items-center gap-2">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-navy-600 px-3 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-navy-700 active:bg-navy-800"
              onClick={(e) => e.stopPropagation()}
            >
              Go
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
            <span className="truncate text-xs text-gray-400" title={bill.url ?? ''}>
              {bill.url}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {bill.due_day != null ? ordinal(bill.due_day) : <span className="text-gray-300">—</span>}
      </td>
      <td className="overflow-hidden truncate px-3 py-2 text-sm text-gray-500" title={bill.notes ?? ''}>
        {bill.notes || ''}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={onEdit}
          className="rounded bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700 transition-colors hover:bg-navy-100 hover:text-navy-900"
        >
          Edit
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Modal for add / edit
// ---------------------------------------------------------------------------

function BillModal({
  bill,
  onSave,
  onArchive,
  onDelete,
  isArchived,
  onClose,
}: {
  bill: Bill | null;
  onSave: (vals: { name: string; url: string | null; due_day: number | null; notes: string | null }) => Promise<void>;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  isArchived: boolean;
  onClose: () => void;
}) {
  const isNew = bill === null;
  const [name, setName] = useState(bill?.name ?? '');
  const [url, setUrl] = useState(bill?.url ?? '');
  const [dueDay, setDueDay] = useState(bill?.due_day != null ? String(bill.due_day) : '');
  const [notes, setNotes] = useState(bill?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const inputCls =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';

  async function handleSave() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const parsedDay = dueDay.trim() ? Number(dueDay) : null;
      await onSave({
        name: name.trim(),
        url: url.trim() || null,
        due_day: parsedDay != null && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : null,
        notes: notes.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="border-b border-navy-100 px-6 py-4">
          <h2 className="text-lg font-bold text-navy-900">
            {isNew ? 'Add Bill' : 'Edit Bill'}
          </h2>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Name *</label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              className={inputCls}
              placeholder="e.g. AT&T Phone"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Website URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              className={inputCls}
              placeholder="https://att.com/mybill"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Due Day (1–31)</label>
              <input
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                className={`${inputCls} tabular-nums`}
                placeholder="15"
                inputMode="numeric"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              className={inputCls}
              placeholder="Auto-pay, account #, etc."
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-navy-100 px-6 py-4">
          <div className="flex items-center gap-2">
            {onArchive && (
              <Button variant="secondary" size="sm" onClick={onArchive}>
                {isArchived ? 'Restore' : 'Archive'}
              </Button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="text-xs font-semibold text-neg hover:underline">
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={busy || !name.trim()} onClick={handleSave}>
              {isNew ? 'Add Bill' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ordinal(day: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  return `${day}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
