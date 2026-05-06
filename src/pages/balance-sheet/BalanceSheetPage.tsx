/**
 * Balance Sheet page — Phase 5.
 *
 * Two stacked sections:
 *   1. Item table — one row per active asset/liability. Shows the *effective*
 *      value at the selected as-of month (perpetuate-forward) plus a per-item
 *      24-month sparkline. Inline-editable name / equity_group / archive.
 *   2. Per-item value editor — appears when you select an item. Lists every
 *      explicit value entry the user has made (any month, any year), with
 *      add/edit/delete. This is the "input a March value, watch it
 *      perpetuate" workflow from the master plan.
 *
 * Household net worth headline + trend chart live on Reports → Balance sheet.
 *
 * As-of month follows the app header period (same as the rest of the app).
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  fetchBalanceSheetItems,
  fetchBalanceSheetValues,
  createBalanceSheetItem,
  updateBalanceSheetItem,
  deleteBalanceSheetItem,
  setBalanceSheetValue,
  deleteBalanceSheetValue,
} from '@/api/balanceSheet';
import {
  effectiveValuesAt,
  periodToBsMonth,
  netWorthSeries,
  valuesForItem,
  type BsItem,
  type BsValue,
} from '@/features/balance-sheet/effective';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { varianceClass } from '@/lib/money';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { maskUsd } from '@/lib/privacyMoney';
import { formatPeriod, type Period, MONTH_NAMES_LONG } from '@/lib/period';
import { StatusPanel } from '@/components/StatusPanel';
import { Sparkline } from '@/components/Sparkline';
import { Badge, Button, Card, RT } from '@/components/ds';

const KNOWN_EQUITY_GROUPS = [
  'Retirement',
  'Investments',
  'Savings',
  'Credit Union',
  'House',
  'Car',
  'Other',
] as const;

export function BalanceSheetPage() {
  const household = useHousehold();
  const qc = useQueryClient();

  const { period } = useAppPeriod();

  const itemsQ = useQuery({
    queryKey: ['bs-items', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetItems(household!.id),
  });
  const valuesQ = useQuery({
    queryKey: ['bs-values', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetValues(household!.id),
  });

  const items = itemsQ.data ?? [];
  const values = valuesQ.data ?? [];

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  const targetIso = useMemo(() => periodToBsMonth(period), [period]);
  const priorPeriod: Period =
    period.month === 1
      ? { year: period.year - 1, month: 12 }
      : { year: period.year, month: period.month - 1 };
  const priorIso = useMemo(() => periodToBsMonth(priorPeriod), [priorPeriod]);

  const effective = useMemo(
    () => effectiveValuesAt(values, targetIso),
    [values, targetIso],
  );
  const effectivePrior = useMemo(
    () => effectiveValuesAt(values, priorIso),
    [values, priorIso],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bs-items', household?.id] });
    qc.invalidateQueries({ queryKey: ['bs-values', household?.id] });
  };

  const loading = itemsQ.isLoading || valuesQ.isLoading;
  const firstError = itemsQ.error ?? valuesQ.error;

  return (
    <div>
      <p className="mb-4 text-sm text-gray-600">
        Values as of{' '}
        <span className="font-semibold text-navy-900">{formatPeriod(period)}</span>. Each value
        carries forward until you enter a new one — change a March entry and only March (and any
        later months without their own entry) update.
      </p>

      {firstError ? (
        <StatusPanel
          kind="error"
          message="Couldn’t load balance sheet"
          detail={firstError instanceof Error ? firstError.message : undefined}
        />
      ) : loading ? (
        <StatusPanel kind="loading" message="Loading balance sheet…" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
            <ItemsPanel
              items={items}
              values={values}
              effective={effective}
              effectivePrior={effectivePrior}
              series24Period={period}
              selectedItemId={selectedItemId}
              onSelect={setSelectedItemId}
              onCreate={async (args) => {
                if (!household) return;
                await createBalanceSheetItem({
                  household_id: household.id,
                  ...args,
                  sort_order: items.length * 10,
                });
                invalidate();
              }}
              onPatch={async (id, patch) => {
                await updateBalanceSheetItem({ id, patch });
                invalidate();
              }}
              onDelete={async (id) => {
                if (!confirm('Delete this item and all its history? This cannot be undone.'))
                  return;
                await deleteBalanceSheetItem(id);
                if (selectedItemId === id) setSelectedItemId(null);
                invalidate();
              }}
            />

            <ValueEditorPanel
              item={selectedItem}
              values={values}
              effectiveValue={selectedItem ? effective.get(selectedItem.id) ?? null : null}
              targetIso={targetIso}
              onPatchItem={async (id, patch) => {
                await updateBalanceSheetItem({ id, patch });
                invalidate();
              }}
              onSave={async (vals) => {
                await setBalanceSheetValue(vals);
                invalidate();
              }}
              onDelete={async (vals) => {
                await deleteBalanceSheetValue(vals);
                invalidate();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Items panel — list + create
// ----------------------------------------------------------------------------

interface ItemsPanelProps {
  items: BsItem[];
  values: BsValue[];
  effective: Map<string, number>;
  effectivePrior: Map<string, number>;
  series24Period: Period;
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  onCreate: (args: {
    name: string;
    type: 'asset' | 'liability';
    equity_group?: string | null;
  }) => Promise<void>;
  onPatch: (
    id: string,
    patch: Partial<{
      name: string;
      type: 'asset' | 'liability';
      equity_group: string | null;
      is_active: boolean;
      sort_order: number;
    }>,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function ItemsPanel(props: ItemsPanelProps) {
  const {
    items,
    values,
    effective,
    effectivePrior,
    series24Period,
    selectedItemId,
    onSelect,
    onCreate,
    onPatch,
    onDelete,
  } = props;

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'asset' | 'liability'>('asset');
  const [newGroup, setNewGroup] = useState<string>('');
  const [showInactive, setShowInactive] = useState(false);

  const visible = items.filter((i) => showInactive || i.is_active);
  const assets = visible.filter((i) => i.type === 'asset');
  const liabilities = visible.filter((i) => i.type === 'liability');

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between border-b border-navy-100 px-4 py-2.5">
        <h2 className="text-h3 text-navy-800">Items</h2>
        <label className="flex items-center gap-1.5 text-caption text-gray-500">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      <ItemSection
        title="Assets"
        items={assets}
        values={values}
        effective={effective}
        effectivePrior={effectivePrior}
        seriesPeriod={series24Period}
        selectedItemId={selectedItemId}
        onSelect={onSelect}
        onPatch={onPatch}
        onDelete={onDelete}
      />
      <ItemSection
        title="Liabilities"
        items={liabilities}
        values={values}
        effective={effective}
        effectivePrior={effectivePrior}
        seriesPeriod={series24Period}
        selectedItemId={selectedItemId}
        onSelect={onSelect}
        onPatch={onPatch}
        onDelete={onDelete}
      />

      <div className="border-t border-navy-100 px-4 py-3">
        <div className="text-label uppercase tracking-wider text-gray-500">
          Add item
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (e.g. Crypto Wallet)"
            className="min-w-[180px] flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as 'asset' | 'liability')}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
          </select>
          <select
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            <option value="">— group —</option>
            {KNOWN_EQUITY_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            size="sm"
            disabled={!newName.trim()}
            onClick={async () => {
              const trimmed = newName.trim();
              if (!trimmed) return;
              await onCreate({
                name: trimmed,
                type: newType,
                equity_group: newGroup || null,
              });
              setNewName('');
              setNewGroup('');
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface ItemSectionProps {
  title: string;
  items: BsItem[];
  values: BsValue[];
  effective: Map<string, number>;
  effectivePrior: Map<string, number>;
  seriesPeriod: Period;
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  onPatch: ItemsPanelProps['onPatch'];
  onDelete: (id: string) => Promise<void>;
}

function ItemSection({
  title,
  items,
  values,
  effective,
  effectivePrior,
  seriesPeriod,
  selectedItemId,
  onSelect,
  onPatch,
  onDelete,
}: ItemSectionProps) {
  const { hideIncomeAssets } = usePrivacyMode();
  const $ = (n: number) => maskUsd(hideIncomeAssets, n, true);

  if (items.length === 0) return null;
  const total = items.reduce(
    (acc, i) => acc + (effective.get(i.id) ?? 0),
    0,
  );

  return (
    <div>
      <div className={`${RT.groupRow} px-4 py-1.5 text-label uppercase tracking-wider text-navy-700`}>
        {title}
      </div>
      <table className={RT.table}>
        <thead className={RT.head}>
          <tr>
            <th className={`${RT.th} ${RT.thLeft}`}>Item</th>
            <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
            <th className={`${RT.th} ${RT.thRight}`}>Value</th>
            <th className={`${RT.th} ${RT.thRight}`}>Δ vs prior</th>
            <th className={`${RT.th} ${RT.thLeft}`}>24-mo trend</th>
            <th className={RT.th} />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const v = effective.get(it.id);
            const pv = effectivePrior.get(it.id);
            const dv = v != null && pv != null ? v - pv : null;
            const sparkData = netWorthSeries({
              items: [it],
              values: values.filter((x) => x.item_id === it.id),
              endMonth: seriesPeriod,
              count: 24,
            }).map((s) => ({
              label: '',
              value: it.type === 'asset' ? s.assets : s.liabilities,
            }));
            const isSel = selectedItemId === it.id;
            return (
              <tr
                key={it.id}
                onClick={() => onSelect(it.id)}
                className={`cursor-pointer border-t border-navy-100 ${
                  isSel ? 'bg-gold-100/60' : 'hover:bg-navy-50/40'
                } ${it.is_active ? '' : 'text-gray-400'}`}
              >
                <td className="px-3 py-1.5">
                  <InlineText
                    value={it.name}
                    onSave={(s) => onPatch(it.id, { name: s })}
                  />
                </td>
                <td className="px-3 py-1.5 text-gray-500">
                  <InlineSelect
                    value={it.equity_group ?? ''}
                    options={['', ...KNOWN_EQUITY_GROUPS]}
                    onSave={(s) => onPatch(it.id, { equity_group: s || null })}
                  />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {v == null ? <span className="text-gray-300">—</span> : $(v)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums ${
                    dv == null ? 'text-gray-300' : varianceClass(it.type === 'asset' ? -dv : dv)
                  }`}
                >
                  {dv == null
                    ? '—'
                    : `${dv >= 0 ? '+' : '−'}${$(Math.abs(dv))}`}
                </td>
                <td className="px-3 py-1.5">
                  {hideIncomeAssets ? (
                    <div className="h-7 w-[140px] rounded bg-navy-50" aria-hidden />
                  ) : (
                    <Sparkline
                      points={sparkData}
                      width={140}
                      height={28}
                      showEndpointLabels={false}
                      area={false}
                      color={it.type === 'asset' ? '#1f8a70' : '#b14b4b'}
                    />
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPatch(it.id, { is_active: !it.is_active });
                    }}
                    className="text-xs text-gray-500 hover:text-navy-800"
                  >
                    {it.is_active ? 'Archive' : 'Restore'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(it.id);
                    }}
                    className="ml-2 text-xs text-neg hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
          <tr className={RT.subtotalRow}>
            <td className="px-3 py-1.5">Total {title}</td>
            <td />
            <td className="px-3 py-1.5 text-right tabular-nums">{$(total)}</td>
            <td colSpan={3} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Editable cell helpers
// ----------------------------------------------------------------------------

function InlineText({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft !== value) onSave(draft.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-full rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
    />
  );
}

function InlineSelect({
  value,
  options,
  onSave,
}: {
  value: string;
  options: readonly string[];
  onSave: (v: string) => void | Promise<void>;
}) {
  return (
    <select
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onSave(e.target.value)}
      className="rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-gray-300 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o || '—'}
        </option>
      ))}
    </select>
  );
}

// ----------------------------------------------------------------------------
// Value editor — per-selected-item entry list
// ----------------------------------------------------------------------------

interface ValueEditorProps {
  item: BsItem | null;
  values: BsValue[];
  effectiveValue: number | null;
  targetIso: string;
  onPatchItem: (
    id: string,
    patch: Partial<{ value_source_url: string | null }>,
  ) => Promise<void>;
  onSave: (args: {
    item_id: string;
    as_of_month: string;
    value: number;
    notes?: string | null;
  }) => Promise<void>;
  onDelete: (args: { item_id: string; as_of_month: string }) => Promise<void>;
}

function ItemValueSourceUrl({
  item,
  onPatch,
}: {
  item: BsItem;
  onPatch: (id: string, patch: Partial<{ value_source_url: string | null }>) => Promise<void>;
}) {
  const saved = (item.value_source_url ?? '').trim();
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft((item.value_source_url ?? '').trim());
  }, [item.id, item.value_source_url]);

  const normalized = draft.trim();
  const dirty = normalized !== saved;

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      await onPatch(item.id, {
        value_source_url: normalized === '' ? null : normalized,
      });
    } finally {
      setBusy(false);
    }
  };

  const openHref =
    normalized &&
    (normalized.startsWith('http://') || normalized.startsWith('https://'))
      ? normalized
      : null;

  const inputCls =
    'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';

  return (
    <div className="border-t border-navy-100 px-4 py-3">
      <div className="text-label uppercase tracking-wider text-gray-500">Value source URL</div>
      <p className="mt-1 text-caption text-gray-400">
        One link per item (not per month). Use the page where you check this balance — e.g. your
        bank or brokerage site.
      </p>
      <div className="mt-2 space-y-2">
        <input
          type="text"
          inputMode="url"
          autoComplete="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://…"
          className={inputCls}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => save()} disabled={!dirty || busy}>
            {busy ? 'Saving…' : 'Save link'}
          </Button>
          {openHref && (
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-navy-700 underline hover:text-navy-900"
            >
              Open link
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ValueEditorPanel(props: ValueEditorProps) {
  const { item, values, effectiveValue, targetIso, onPatchItem, onSave, onDelete } = props;
  const { hideIncomeAssets } = usePrivacyMode();
  const $ = (n: number) => maskUsd(hideIncomeAssets, n, true);

  if (!item) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
        Select an item on the left to view or edit its history.
      </div>
    );
  }

  const itemValues = valuesForItem(values, item.id);

  // Quick-add form for THIS item, defaulted to the currently selected as-of.
  const initialPeriod = (() => {
    const [y, m] = targetIso.split('-');
    return { year: Number(y), month: Number(m) };
  })();

  return (
    <Card padded={false}>
      <div className="border-b border-navy-100 px-4 py-2.5">
        <div className="text-label uppercase tracking-wider text-gray-500">
          {item.type === 'asset' ? <Badge tone="pos">Asset</Badge> : <Badge tone="neg">Liability</Badge>}
        </div>
        <h2 className="mt-1 text-h2 text-navy-900">{item.name}</h2>
        <div className="mt-1 text-caption text-gray-500">
          Effective at {targetIso.slice(0, 7)}:{' '}
          <span className="tabular-nums font-semibold text-navy-800">
            {effectiveValue == null ? '—' : $(effectiveValue)}
          </span>
        </div>
      </div>

      <ItemValueSourceUrl item={item} onPatch={onPatchItem} />

      <QuickAddValue
        defaultPeriod={initialPeriod}
        onSave={async (period, value, notes) => {
          await onSave({
            item_id: item.id,
            as_of_month: periodToBsMonth(period),
            value,
            notes,
          });
        }}
      />

      <div className="border-t border-navy-100">
        <div className="px-4 py-2 text-label uppercase tracking-wider text-gray-500">
          History — entered values
        </div>
        {itemValues.length === 0 ? (
          <div className="px-4 pb-4 text-caption text-gray-400">
            No entries yet. Add one above to get started.
          </div>
        ) : (
          <table className={RT.table}>
            <thead className={RT.head}>
              <tr>
                <th className={`${RT.th} ${RT.thLeft}`}>Month</th>
                <th className={`${RT.th} ${RT.thRight}`}>Value</th>
                <th className={`${RT.th} ${RT.thLeft}`}>Notes</th>
                <th className={RT.th} />
              </tr>
            </thead>
            <tbody>
              {itemValues
                .slice()
                .reverse()
                .map((v) => (
                  <tr key={v.id} className="border-t border-navy-100 hover:bg-navy-50/40">
                    <td className="px-3 py-1.5 text-gray-700 tabular-nums">
                      {v.as_of_month.slice(0, 7)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {$(v.value)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{v.notes ?? ''}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() =>
                          onDelete({ item_id: item.id, as_of_month: v.as_of_month })
                        }
                        className="text-xs text-neg hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function QuickAddValue({
  defaultPeriod,
  onSave,
}: {
  defaultPeriod: Period;
  onSave: (p: Period, value: number, notes: string | null) => Promise<void>;
}) {
  const [year, setYear] = useState(defaultPeriod.year);
  const [month, setMonth] = useState(defaultPeriod.month);
  const [valueStr, setValueStr] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const num = Number(valueStr.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(num)) return;
    setBusy(true);
    try {
      await onSave({ year, month }, num, notes.trim() || null);
      setValueStr('');
      setNotes('');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';
  return (
    <div className="border-t border-navy-100 px-4 py-3">
      <div className="text-label uppercase tracking-wider text-gray-500">
        Add / overwrite value
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className={inputCls}
        >
          {MONTH_NAMES_LONG.map((n, i) => (
            <option key={i} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className={`${inputCls} tabular-nums`}
        />
        <input
          value={valueStr}
          onChange={(e) => setValueStr(e.target.value)}
          placeholder="Value"
          className={`col-span-2 ${inputCls} tabular-nums`}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className={`col-span-2 ${inputCls}`}
        />
        <div className="col-span-2">
          <Button
            variant="primary"
            size="md"
            onClick={submit}
            disabled={busy || !valueStr.trim()}
            className="w-full"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
