/**
 * Manage Accounts page — Settings section.
 *
 * Centralises account (BS item) administration: add, rename, set type/group,
 * set value-source URL, archive/restore, and delete. Value entry stays on
 * the BS Accounts page.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  fetchBalanceSheetItems,
  createBalanceSheetItem,
  updateBalanceSheetItem,
  deleteBalanceSheetItem,
} from '@/api/balanceSheet';
import type { BsItem } from '@/features/balance-sheet/effective';
import { StatusPanel } from '@/components/StatusPanel';
import { Button, Card, RT } from '@/components/ds';

const KNOWN_EQUITY_GROUPS = [
  'Retirement',
  'Investments',
  'Savings',
  'Credit Union',
  'House',
  'Car',
  'Other',
] as const;

export function ManageAccountsPage() {
  const household = useHousehold();
  const qc = useQueryClient();

  const itemsQ = useQuery({
    queryKey: ['bs-items', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetItems(household!.id),
  });

  const items = itemsQ.data ?? [];
  const activeItems = useMemo(() => items.filter((i) => i.is_active), [items]);

  const [showArchived, setShowArchived] = useState(false);
  const [modalItem, setModalItem] = useState<BsItem | 'new' | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bs-items', household?.id] });

  if (itemsQ.error) {
    return (
      <StatusPanel
        kind="error"
        message="Couldn't load accounts"
        detail={itemsQ.error instanceof Error ? itemsQ.error.message : undefined}
      />
    );
  }
  if (itemsQ.isLoading) {
    return <StatusPanel kind="loading" message="Loading accounts…" />;
  }

  const assets = (showArchived ? items : activeItems).filter((i) => i.type === 'asset');
  const liabilities = (showArchived ? items : activeItems).filter((i) => i.type === 'liability');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-gray-600">
          Add, rename, and configure balance-sheet accounts. Enter monthly values on the{' '}
          <a href="/balance-sheet" className="font-medium text-navy-700 underline hover:text-navy-900">
            BS Accounts
          </a>{' '}
          page.
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
          <Button variant="primary" size="sm" onClick={() => setModalItem('new')}>
            + Add Account
          </Button>
        </div>
      </div>

      <AccountSection
        title="Assets"
        items={assets}
        onEdit={(item) => setModalItem(item)}
      />
      <AccountSection
        title="Liabilities"
        items={liabilities}
        onEdit={(item) => setModalItem(item)}
      />

      {assets.length === 0 && liabilities.length === 0 && (
        <Card>
          <p className="py-4 text-center text-sm text-gray-400">
            No accounts yet. Click <strong>+ Add Account</strong> to get started.
          </p>
        </Card>
      )}

      {modalItem && (
        <AccountModal
          item={modalItem === 'new' ? null : modalItem}
          onSave={async (vals) => {
            if (modalItem === 'new') {
              if (!household) return;
              await createBalanceSheetItem({
                household_id: household.id,
                name: vals.name,
                type: vals.type,
                equity_group: vals.equity_group,
                sort_order: items.length * 10,
              });
              if (vals.value_source_url) {
                const refreshed = await fetchBalanceSheetItems(household.id);
                const created = refreshed.find((i) => i.name === vals.name);
                if (created) {
                  await updateBalanceSheetItem({
                    id: created.id,
                    patch: { value_source_url: vals.value_source_url },
                  });
                }
              }
            } else {
              await updateBalanceSheetItem({ id: modalItem.id, patch: vals });
            }
            invalidate();
            setModalItem(null);
          }}
          onArchive={
            modalItem !== 'new'
              ? async () => {
                  await updateBalanceSheetItem({
                    id: modalItem.id,
                    patch: { is_active: !modalItem.is_active },
                  });
                  invalidate();
                  setModalItem(null);
                }
              : undefined
          }
          onDelete={
            modalItem !== 'new'
              ? async () => {
                  if (!confirm(`Delete "${modalItem.name}" and all its history? This cannot be undone.`))
                    return;
                  await deleteBalanceSheetItem(modalItem.id);
                  invalidate();
                  setModalItem(null);
                }
              : undefined
          }
          isArchived={modalItem !== 'new' ? !modalItem.is_active : false}
          onClose={() => setModalItem(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section (assets or liabilities)
// ---------------------------------------------------------------------------

function AccountSection({
  title,
  items,
  onEdit,
}: {
  title: string;
  items: BsItem[];
  onEdit: (item: BsItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Card padded={false}>
      <div className={`${RT.groupRow} px-4 py-2 text-label uppercase tracking-wider text-navy-700`}>
        {title}
      </div>
      <table className={`${RT.table} w-full table-fixed`}>
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[14%]" />
          <col className="w-[34%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className={RT.head}>
          <tr>
            <th className={`${RT.th} ${RT.thLeft}`}>Account</th>
            <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
            <th className={`${RT.th} ${RT.thLeft}`}>URL</th>
            <th className={`${RT.th} ${RT.thLeft}`}>Status</th>
            <th className={RT.th} />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr
              key={it.id}
              className={`border-t border-navy-100 hover:bg-navy-50/40 ${it.is_active ? '' : 'text-gray-400'}`}
            >
              <td className="px-3 py-2 font-medium text-navy-900">
                {it.name}
              </td>
              <td className="px-3 py-2 text-sm text-gray-500">
                {it.equity_group || '—'}
              </td>
              <td className="overflow-hidden px-3 py-2">
                {it.value_source_url ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <a
                      href={
                        it.value_source_url.startsWith('http://') || it.value_source_url.startsWith('https://')
                          ? it.value_source_url
                          : `https://${it.value_source_url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-navy-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-navy-700 active:bg-navy-800"
                    >
                      Open
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                    <span className="truncate text-xs text-gray-400" title={it.value_source_url}>
                      {it.value_source_url}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-sm">
                {it.is_active ? (
                  <span className="text-green-600">Active</span>
                ) : (
                  <span className="text-gray-400">Archived</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => onEdit(it)}
                  className="rounded bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700 transition-colors hover:bg-navy-100 hover:text-navy-900"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Modal for add / edit
// ---------------------------------------------------------------------------

function AccountModal({
  item,
  onSave,
  onArchive,
  onDelete,
  isArchived,
  onClose,
}: {
  item: BsItem | null;
  onSave: (vals: {
    name: string;
    type: 'asset' | 'liability';
    equity_group: string | null;
    value_source_url: string | null;
  }) => Promise<void>;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  isArchived: boolean;
  onClose: () => void;
}) {
  const isNew = item === null;
  const [name, setName] = useState(item?.name ?? '');
  const [type, setType] = useState<'asset' | 'liability'>(item?.type ?? 'asset');
  const [group, setGroup] = useState(item?.equity_group ?? '');
  const [url, setUrl] = useState(item?.value_source_url ?? '');
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
  const selectCls =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';

  async function handleSave() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        type,
        equity_group: group || null,
        value_source_url: url.trim() || null,
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
            {isNew ? 'Add Account' : 'Edit Account'}
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
              placeholder="e.g. Fidelity 401K"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'asset' | 'liability')} className={selectCls}>
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Group</label>
              <select value={group} onChange={(e) => setGroup(e.target.value)} className={selectCls}>
                <option value="">— none —</option>
                {KNOWN_EQUITY_GROUPS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Value Source URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              className={inputCls}
              placeholder="https://fidelity.com/account"
            />
            <p className="mt-1 text-xs text-gray-400">
              The page where you check this balance — e.g. your bank or brokerage site.
            </p>
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
              {isNew ? 'Add Account' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
