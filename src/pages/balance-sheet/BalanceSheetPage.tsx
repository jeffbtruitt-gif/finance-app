/**
 * Balance Sheet page — Phase 5.
 *
 * Two stacked sections:
 *   1. Item table — one row per active asset/liability. Shows the *effective*
 *      value at the selected as-of month (perpetuate-forward) plus a per-item
 *      24-month sparkline. Read-only names/groups (managed on Settings →
 *      Manage Accounts).
 *   2. Per-item value editor — appears when you select an item. Lists every
 *      explicit value entry the user has made (any month, any year), with
 *      add/edit/delete. This is the "input a March value, watch it
 *      perpetuate" workflow from the master plan.
 *
 * Household net worth headline + trend chart live on Reports → Balance sheet.
 *
 * As-of month follows the app header period (same as the rest of the app).
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  fetchBalanceSheetItems,
  fetchBalanceSheetValues,
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
        carries forward until you enter a new one.{' '}
        <a href="/settings/accounts" className="font-medium text-navy-700 underline hover:text-navy-900">
          Manage accounts
        </a>
      </p>

      {firstError ? (
        <StatusPanel
          kind="error"
          message="Couldn't load balance sheet"
          detail={firstError instanceof Error ? firstError.message : undefined}
        />
      ) : loading ? (
        <StatusPanel kind="loading" message="Loading balance sheet…" />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
          <ItemsPanel
            items={items}
            values={values}
            effective={effective}
            effectivePrior={effectivePrior}
            series24Period={period}
            selectedItemId={selectedItemId}
            onSelect={setSelectedItemId}
          />

          <ValueEditorPanel
            item={selectedItem}
            values={values}
            effectiveValue={selectedItem ? effective.get(selectedItem.id) ?? null : null}
            targetIso={targetIso}
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
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Items panel — read-only list
// ----------------------------------------------------------------------------

interface ItemsPanelProps {
  items: BsItem[];
  values: BsValue[];
  effective: Map<string, number>;
  effectivePrior: Map<string, number>;
  series24Period: Period;
  selectedItemId: string | null;
  onSelect: (id: string) => void;
}

function ItemsPanel(props: ItemsPanelProps) {
  const { items, values, effective, effectivePrior, series24Period, selectedItemId, onSelect } = props;
  const [showInactive, setShowInactive] = useState(false);

  const visible = items.filter((i) => showInactive || i.is_active);
  const assets = visible.filter((i) => i.type === 'asset');
  const liabilities = visible.filter((i) => i.type === 'liability');
  const offBs = visible.filter((i) => i.type === 'off_balance_sheet');

  return (
    <div className="space-y-4">
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
        />
      </Card>

      {offBs.length > 0 && (
        <Card padded={false}>
          <div className="border-b border-navy-100 px-4 py-2.5">
            <h2 className="text-h3 text-navy-800">Off Balance Sheet</h2>
            <p className="text-xs text-gray-500">Tracked for historical trends — not included in net worth</p>
          </div>
          <ItemSection
            title="Off Balance Sheet"
            items={offBs}
            values={values}
            effective={effective}
            effectivePrior={effectivePrior}
            seriesPeriod={series24Period}
            selectedItemId={selectedItemId}
            onSelect={onSelect}
            hideTotal
          />
        </Card>
      )}
    </div>
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
  hideTotal?: boolean;
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
  hideTotal,
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
            <th className={`${RT.th} ${RT.thLeft}`}>Source</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const v = effective.get(it.id);
            const pv = effectivePrior.get(it.id);
            const dv = v != null && pv != null ? v - pv : null;
            const itemSeries = netWorthSeries({
              items: [{ ...it, type: it.type === 'off_balance_sheet' ? 'asset' : it.type }],
              values: values.filter((x) => x.item_id === it.id),
              endMonth: seriesPeriod,
              count: 24,
            });
            const sparkData = itemSeries.map((s) => ({
              label: '',
              value: it.type === 'liability' ? s.liabilities : s.assets,
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
                <td className="px-3 py-1.5 font-medium">{it.name}</td>
                <td className="px-3 py-1.5 text-sm text-gray-500">{it.equity_group || '—'}</td>
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
                      color={it.type === 'liability' ? '#b14b4b' : it.type === 'off_balance_sheet' ? '#6366f1' : '#1f8a70'}
                    />
                  )}
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  {it.value_source_url ? (
                    <a
                      href={
                        it.value_source_url.startsWith('http://') || it.value_source_url.startsWith('https://')
                          ? it.value_source_url
                          : `https://${it.value_source_url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-navy-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-navy-700 active:bg-navy-800"
                    >
                      Open
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {!hideTotal && (
            <tr className={RT.subtotalRow}>
              <td className="px-3 py-1.5">Total {title}</td>
              <td />
              <td className="px-3 py-1.5 text-right tabular-nums">{$(total)}</td>
              <td colSpan={3} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Value editor — per-selected-item entry list (values only, no account mgmt)
// ----------------------------------------------------------------------------

interface ValueEditorProps {
  item: BsItem | null;
  values: BsValue[];
  effectiveValue: number | null;
  targetIso: string;
  onSave: (args: {
    item_id: string;
    as_of_month: string;
    value: number;
    notes?: string | null;
  }) => Promise<void>;
  onDelete: (args: { item_id: string; as_of_month: string }) => Promise<void>;
}

function ValueEditorPanel(props: ValueEditorProps) {
  const { item, values, effectiveValue, targetIso, onSave, onDelete } = props;
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

  const currentPeriod = (() => {
    const [y, m] = targetIso.split('-');
    return { year: Number(y), month: Number(m) };
  })();

  return (
    <Card padded={false}>
      <div className="border-b border-navy-100 px-4 py-2.5">
        <div className="text-label uppercase tracking-wider text-gray-500">
          {item.type === 'asset' ? (
            <Badge tone="pos">Asset</Badge>
          ) : item.type === 'liability' ? (
            <Badge tone="neg">Liability</Badge>
          ) : (
            <Badge tone="neutral">Off Balance Sheet</Badge>
          )}
        </div>
        <h2 className="mt-1 text-h2 text-navy-900">{item.name}</h2>
        <div className="mt-1 text-caption text-gray-500">
          Effective at {targetIso.slice(0, 7)}:{' '}
          <span className="tabular-nums font-semibold text-navy-800">
            {effectiveValue == null ? '—' : $(effectiveValue)}
          </span>
        </div>
      </div>

      <QuickAddValue
        period={currentPeriod}
        onSave={async (p, value, notes) => {
          await onSave({
            item_id: item.id,
            as_of_month: periodToBsMonth(p),
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
  period,
  onSave,
}: {
  period: Period;
  onSave: (p: Period, value: number, notes: string | null) => Promise<void>;
}) {
  const [valueStr, setValueStr] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const num = Number(valueStr.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(num)) return;
    setBusy(true);
    try {
      await onSave(period, num, notes.trim() || null);
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
      <div className="flex items-center justify-between">
        <div className="text-label uppercase tracking-wider text-gray-500">
          Add / overwrite value
        </div>
        <div className="rounded-md bg-navy-50 px-3 py-1 text-sm font-semibold tabular-nums text-navy-800">
          {MONTH_NAMES_LONG[period.month - 1]} {period.year}
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Use the period selector at the top of the page to change the input month.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <input
          value={valueStr}
          onChange={(e) => setValueStr(e.target.value)}
          placeholder="Value"
          className={`${inputCls} tabular-nums`}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className={inputCls}
        />
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
  );
}
