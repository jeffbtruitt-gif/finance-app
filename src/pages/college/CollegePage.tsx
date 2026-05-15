/**
 * College page — Phase 7.
 *
 * Route: /college
 *
 * Replaces the spreadsheet's "College" tab. One row per kid; per-kid
 * year-by-year projection table + balance line chart + on-track summary.
 *
 * Sections:
 *   1. Header — title + summary badge ("on track" / "$X behind across kids").
 *   2. Add-kid form (name + birth year — minimum to materialize).
 *   3. Per kid: editable input row, projection table, balance line chart,
 *      delete button.
 *
 * The simplification vs the spreadsheet: instead of a per-grade cost lookup
 * (College!AB:AC table), each kid stores a base annual_cost + cost_inflation
 * decimal, projected forward as cost × (1 + inflation)^year_offset. This
 * matches MEFA / Schwab calculator inputs and removes a lookup table from
 * the schema. (See migration 10 docstring + api/college.ts decisions.)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { useDefaultPeriod } from '@/lib/useDefaultPeriod';
import {
  DEFAULT_ANNUAL_COST,
  DEFAULT_COST_INFLATION,
  createCollegeKid,
  deleteCollegeKid,
  fetchCollegeKids,
  resolvedAnnualCost,
  resolvedCostInflation,
  resolvedStartYear,
  updateCollegeKid,
  type CollegeKid,
} from '@/api/college';
import { fetchBalanceSheetItems, fetchBalanceSheetValues } from '@/api/balanceSheet';
import {
  effectiveValuesAt,
  periodToBsMonth,
  type BsItem,
  type BsValue,
} from '@/features/balance-sheet/effective';
import {
  buildCollegeProjection,
  type CollegeProjection,
} from '@/features/college/projection';
import { LineChart } from '@/components/LineChart';
import { StatusPanel } from '@/components/StatusPanel';
import { usePrivacyUsdFormatters } from '@/lib/usePrivacyUsdFormatters';
import { MONTH_NAMES_LONG } from '@/lib/period';
import { Badge, Button, Card, Kpi, RT } from '@/components/ds';

// ============================================================================
// Page
// ============================================================================

export function CollegePage() {
  const household = useHousehold();
  const qc = useQueryClient();
  const { period } = useDefaultPeriod();
  const currentYear = period.year;
  const monthsLeft = Math.max(0, 12 - period.month) || 12;

  const kidsQ = useQuery({
    queryKey: ['college-kids', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchCollegeKids(household!.id),
  });

  const bsItemsQ = useQuery({
    queryKey: ['bs-items', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetItems(household!.id),
  });

  const bsValuesQ = useQuery({
    queryKey: ['bs-values', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetValues(household!.id),
  });

  const bsItems = bsItemsQ.data ?? [];
  const bsValues = bsValuesQ.data ?? [];

  const [showAddModal, setShowAddModal] = useState(false);

  async function addKid(name: string, birthYear: number) {
    if (!household) return;
    await createCollegeKid({
      household_id: household.id,
      name,
      birth_year: birthYear,
    });
    qc.invalidateQueries({ queryKey: ['college-kids', household.id] });
  }

  async function patchKid(id: string, patch: Parameters<typeof updateCollegeKid>[0]['patch']) {
    await updateCollegeKid({ id, patch });
    if (!household) return;
    qc.invalidateQueries({ queryKey: ['college-kids', household.id] });
  }

  async function removeKid(kid: CollegeKid) {
    if (!confirm(`Delete ${kid.name} and the projection?`)) return;
    await deleteCollegeKid(kid.id);
    if (!household) return;
    qc.invalidateQueries({ queryKey: ['college-kids', household.id] });
  }

  if (kidsQ.error) {
    return (
      <StatusPanel
        kind="error"
        message="Couldn't load College data."
        detail={String((kidsQ.error as Error).message ?? kidsQ.error)}
      />
    );
  }
  if (kidsQ.isLoading) {
    return <StatusPanel kind="loading" message="Loading College…" />;
  }

  const kids = kidsQ.data ?? [];
  const projections = kids.map((k) => {
    let effectiveKid = k;
    if (k.bs_item_id) {
      const now = new Date();
      const iso = periodToBsMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
      const eff = effectiveValuesAt(bsValues.filter((v) => v.item_id === k.bs_item_id), iso);
      const bal = eff.get(k.bs_item_id!);
      if (bal != null) effectiveKid = { ...k, current_balance: bal };
    }
    return buildCollegeProjection(effectiveKid, {
      currentYear,
      monthsLeftInCurrentYear: monthsLeft,
    });
  });

  // Summary across kids: combined surplus / shortfall after each kid graduates.
  const surplusByKid = projections.map((p) => p.finalBalance);
  const totalSurplus = surplusByKid.reduce((s, v) => s + v, 0);
  const allOnTrack = projections.length > 0 && projections.every((p) => p.onTrack);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-body-base text-gray-500">Per-kid 529 projection from {currentYear}.</p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            <a
              href="https://www.mefa.org/pay/college-cost-projector#future-college-costs"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-navy-700 underline hover:text-navy-900"
            >
              College Costs (MEFA)
            </a>
            <a
              href="https://www.schwab.com/saving-for-college/college-savings-calculator"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-navy-700 underline hover:text-navy-900"
            >
              Schwab Calculator
            </a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {projections.length > 0 && (
            <CollegeSummaryBadge totalSurplus={totalSurplus} allOnTrack={allOnTrack} />
          )}
          <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
            + Add Kid
          </Button>
        </div>
      </div>

      {projections.length === 0 && (
        <StatusPanel
          kind="empty"
          message="No kids yet."
          detail="Add a name and birth year above to start projecting their 529."
        />
      )}
      {projections.map((p) => (
        <KidSection
          key={p.kid.id}
          projection={p}
          onPatch={(patch) => patchKid(p.kid.id, patch)}
          onRemove={() => removeKid(p.kid)}
          bsItems={bsItems}
          bsValues={bsValues}
          currentYear={currentYear}
        />
      ))}

      {showAddModal && (
        <AddKidModal
          onAdd={async (name, birthYear) => {
            await addKid(name, birthYear);
            setShowAddModal(false);
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function CollegeSummaryBadge({
  totalSurplus,
  allOnTrack,
}: {
  totalSurplus: number;
  allOnTrack: boolean;
}) {
  const { sensitive: privUsd } = usePrivacyUsdFormatters();
  if (allOnTrack) {
    return (
      <Badge tone="pos" dot>
        On track {totalSurplus > 0 && `(+${privUsd(totalSurplus)} surplus)`}
      </Badge>
    );
  }
  return (
    <Badge tone="neg" dot>
      Behind by {privUsd(Math.abs(totalSurplus))} across kids
    </Badge>
  );
}

function AddKidModal({
  onAdd,
  onClose,
}: {
  onAdd: (name: string, birthYear: number) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [busy, setBusy] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    const trimmed = name.trim();
    const by = parseInt(birthYear, 10);
    if (!trimmed || !Number.isFinite(by) || by < 1900 || by > 2100) return;
    setBusy(true);
    try {
      await onAdd(trimmed, by);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-navy-100 px-6 py-4">
          <h2 className="text-lg font-bold text-navy-900">Add a Kid</h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Name *</label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              className={inputCls}
              placeholder="e.g. Cooper"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Birth year *</label>
            <input
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              inputMode="numeric"
              className={inputCls}
              placeholder="e.g. 2018"
            />
          </div>
          <p className="text-xs text-gray-400">
            Defaults: ${DEFAULT_ANNUAL_COST.toLocaleString()}/yr cost,{' '}
            {(DEFAULT_COST_INFLATION * 100).toFixed(0)}% inflation, 6% return,
            4-yr undergrad starting at age 18.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-navy-100 px-6 py-4">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !name.trim() || !birthYear.trim()}
            onClick={submit}
          >
            Add Kid
          </Button>
        </div>
      </div>
    </div>
  );
}

function KidSection({
  projection,
  onPatch,
  onRemove,
  bsItems,
  bsValues,
  currentYear,
}: {
  projection: CollegeProjection;
  onPatch: (patch: Parameters<typeof updateCollegeKid>[0]['patch']) => Promise<void>;
  onRemove: () => void;
  bsItems: BsItem[];
  bsValues: BsValue[];
  currentYear: number;
}) {
  const { sensitive: privUsd } = usePrivacyUsdFormatters();
  const { kid } = projection;
  const linePoints = projection.rows.map((r) => ({
    x: r.year,
    y: r.endBalance,
  }));

  const linkedItem = kid.bs_item_id
    ? bsItems.find((i) => i.id === kid.bs_item_id) ?? null
    : null;

  const linkedBalance = useMemo(() => {
    if (!kid.bs_item_id) return null;
    const now = new Date();
    const iso = periodToBsMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
    const eff = effectiveValuesAt(bsValues.filter((v) => v.item_id === kid.bs_item_id), iso);
    return eff.get(kid.bs_item_id!) ?? null;
  }, [kid.bs_item_id, bsValues]);

  const historicalPoints = useMemo(() => {
    if (!kid.bs_item_id) return [];
    const itemValues = bsValues.filter((v) => v.item_id === kid.bs_item_id);
    if (itemValues.length === 0) return [];

    const months: { x: number; y: number; label: string }[] = [];
    const now = new Date();
    const endYear = currentYear;
    const endMonth = now.getMonth() + 1;

    const startIso = itemValues
      .map((v) => v.as_of_month)
      .sort()[0];
    const [sy, sm] = startIso.split('-').map(Number);

    let year = sy;
    let month = sm;
    while (year < endYear || (year === endYear && month <= endMonth)) {
      const iso = periodToBsMonth({ year, month });
      const eff = effectiveValuesAt(bsValues.filter((v) => v.item_id === kid.bs_item_id), iso);
      const val = eff.get(kid.bs_item_id!);
      if (val != null) {
        const idx = (year - sy) * 12 + (month - sm);
        months.push({
          x: idx,
          y: val,
          label: `${MONTH_NAMES_LONG[month - 1].slice(0, 3)} ${year}`,
        });
      }
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    return months;
  }, [kid.bs_item_id, bsValues, currentYear]);

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-h2 text-navy-900">{kid.name}</h2>
          <div className="text-caption text-gray-500">
            Born {kid.birth_year} · College {resolvedStartYear(kid)} →{' '}
            {projection.graduationYear} · {kid.duration_years} yrs
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRemove}
            className="text-xs font-semibold text-neg hover:underline"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-navy-100 p-4 sm:grid-cols-3">
        <Kpi
          label="Through graduation"
          value={
            projection.onTrack ? (
              <span className="text-pos">On track</span>
            ) : (
              <span className="text-neg">Short {privUsd(Math.abs(projection.finalBalance))}</span>
            )
          }
          subtitle={
            projection.onTrack && projection.finalBalance > 0
              ? `${privUsd(projection.finalBalance)} surplus after last year`
              : projection.onTrack
                ? 'Meets modeled tuition through graduation'
                : 'Vs. modeled costs through graduation'
          }
          trend={
            projection.onTrack
              ? { direction: 'pos', text: 'Plan stays positive' }
              : { direction: 'neg', text: 'Increase savings or reduce cost' }
          }
          rightSlot={
            <Badge tone={projection.onTrack ? 'pos' : 'neg'} dot>
              {projection.onTrack ? 'OK' : 'Gap'}
            </Badge>
          }
        />
        <Kpi
          label="Balance before college"
          value={
            projection.balanceBeforeCollege == null
              ? '—'
              : privUsd(projection.balanceBeforeCollege)
          }
          subtitle={
            projection.balanceBeforeCollege == null
              ? 'College start is before this projection window'
              : `Projected at start of ${projection.startYear}`
          }
        />
        <Kpi
          label="First year of college"
          value={privUsd(projection.firstYearCollegeCost)}
          subtitle={`Modeled total for year 1 (${projection.startYear})`}
        />
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-navy-100 p-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex items-center justify-between gap-3 md:col-span-2 lg:col-span-3">
          <label className="shrink-0 text-sm text-gray-700">Linked account</label>
          <select
            value={kid.bs_item_id ?? ''}
            onChange={(e) => {
              const itemId = e.target.value || null;
              const patch: Parameters<typeof onPatch>[0] = { bs_item_id: itemId };
              if (itemId) {
                const now = new Date();
                const iso = periodToBsMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
                const eff = effectiveValuesAt(bsValues.filter((v) => v.item_id === itemId), iso);
                const balance = eff.get(itemId);
                if (balance != null) patch.current_balance = balance;
              }
              onPatch(patch);
            }}
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            <option value="">— none —</option>
            {bsItems
              .filter((i) => i.is_active && i.equity_group === 'College')
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </div>
        {linkedBalance != null ? (
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-gray-700">Current balance</label>
            <div className="flex items-center gap-1">
              <span className="w-32 rounded-md border border-gray-100 bg-gray-50 px-2 py-1 text-right text-sm tabular-nums text-navy-800">
                {privUsd(linkedBalance)}
              </span>
              <span className="w-3" />
            </div>
          </div>
        ) : (
          <KidInput
            label="Current balance"
            value={kid.current_balance}
            kind="dollars"
            onCommit={(v) => onPatch({ current_balance: v ?? 0 })}
          />
        )}
        <KidInput
          label="Monthly contribution"
          value={kid.monthly_contrib}
          kind="dollars"
          onCommit={(v) => onPatch({ monthly_contrib: v ?? 0 })}
        />
        <KidInput
          label="Return rate"
          value={kid.return_rate}
          kind="rate"
          onCommit={(v) => onPatch({ return_rate: v ?? 0 })}
        />
        <KidInput
          label="Annual cost (yr 1)"
          value={resolvedAnnualCost(kid)}
          kind="dollars"
          onCommit={(v) => onPatch({ annual_cost: v })}
        />
        <KidInput
          label="Cost inflation"
          value={resolvedCostInflation(kid)}
          kind="rate"
          onCommit={(v) => onPatch({ cost_inflation: v })}
        />
        <KidInput
          label="Duration (years)"
          value={kid.duration_years}
          kind="int"
          onCommit={(v) =>
            onPatch({ duration_years: Math.max(1, Math.round(v ?? 4)) })
          }
        />
        <KidInput
          label="Start year (override)"
          value={kid.start_year ?? kid.birth_year + 18}
          kind="int"
          onCommit={(v) => onPatch({ start_year: v == null ? null : Math.round(v) })}
        />
        <KidInput
          label="Birth year"
          value={kid.birth_year}
          kind="int"
          onCommit={(v) =>
            onPatch({ birth_year: Math.round(v ?? kid.birth_year) })
          }
        />
      </div>

      <div className={`grid border-b border-navy-100 ${linkedItem && historicalPoints.length > 0 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {linkedItem && historicalPoints.length > 0 && (
          <div className="border-b border-navy-100 p-4 md:border-b-0 md:border-r">
            <LineChart
              points={historicalPoints}
              title={`${linkedItem.name} — historical balance`}
              subtitle="Actual recorded values from the balance sheet"
              color="#6366f1"
              formatX={(x) => {
                const pt = historicalPoints.find((p) => p.x === x);
                return pt?.label ?? String(x);
              }}
            />
          </div>
        )}
        <div className="p-4">
          <LineChart
            points={linePoints}
            title="Balance trajectory"
            subtitle={`Through graduation (${projection.graduationYear})`}
          />
        </div>
      </div>

      <KidTable projection={projection} />

      <div className="border-t border-navy-100 bg-gray-50 px-4 py-2 text-caption text-gray-600">
        Total tuition cost (nominal, across {kid.duration_years} years):{' '}
        <span className="font-semibold text-navy-800">
          {privUsd(projection.totalCost)}
        </span>
        {' · '}
        Final balance after graduation:{' '}
        <span
          className={`font-semibold ${
            projection.finalBalance >= 0 ? 'text-pos' : 'text-neg'
          }`}
        >
          {privUsd(projection.finalBalance)}
        </span>
      </div>
    </Card>
  );
}

type InputKind = 'dollars' | 'rate' | 'int';

function KidInput({
  label,
  value,
  kind,
  onCommit,
}: {
  label: string;
  value: number;
  kind: InputKind;
  onCommit: (v: number | null) => void;
}) {
  const display =
    kind === 'rate'
      ? (value * 100).toFixed(2)
      : kind === 'int'
        ? String(Math.round(value))
        : String(value);
  const [local, setLocal] = useState(display);
  useEffect(() => setLocal(display), [display]);

  function commit() {
    if (local.trim() === '') {
      onCommit(null);
      return;
    }
    const cleaned = local.replace(/[$,%\s]/g, '').trim();
    const n = Number(cleaned);
    if (!Number.isFinite(n)) {
      setLocal(display);
      return;
    }
    let parsed = n;
    if (kind === 'rate' && n > 1) parsed = n / 100;
    if (parsed === value) return;
    onCommit(parsed);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm text-gray-700">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setLocal(display);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
        />
        <span className="w-3 text-xs text-gray-400">
          {kind === 'rate' ? '%' : ''}
        </span>
      </div>
    </div>
  );
}

function KidTable({ projection }: { projection: CollegeProjection }) {
  const { sensitive: privUsd } = usePrivacyUsdFormatters();
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className={RT.head}>
          <tr>
            <th className={`${RT.th} ${RT.thLeft}`}>Year</th>
            <th className={`${RT.th} ${RT.thRight}`}>Age</th>
            <th className={`${RT.th} ${RT.thRight}`}>Start</th>
            <th className={`${RT.th} ${RT.thRight}`}>Contrib</th>
            <th className={`${RT.th} ${RT.thRight}`}>Interest</th>
            <th className={`${RT.th} ${RT.thRight}`}>Cost</th>
            <th className={`${RT.th} ${RT.thRight}`}>End</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-100">
          {projection.rows.map((r) => {
            const isNeg = r.endBalance < 0;
            return (
              <tr
                key={r.year}
                className={
                  r.inCollege
                    ? 'bg-info-soft/40'
                    : isNeg
                      ? 'bg-neg-soft'
                      : 'hover:bg-navy-50/40'
                }
              >
                <td className="px-3 py-1 font-semibold tabular-nums text-navy-800">
                  {r.year}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">{r.age}</td>
                <td className="px-3 py-1 text-right tabular-nums text-gray-500">
                  {privUsd(r.startBalance, { decimals: 0 })}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {r.contrib === 0 ? '' : privUsd(r.contrib, { decimals: 0 })}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {r.interest === 0 ? '' : privUsd(r.interest, { decimals: 0 })}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {r.cost === 0 ? '' : (
                    <span className="text-neg">
                      {privUsd(r.cost, { decimals: 0 })}
                    </span>
                  )}
                </td>
                <td
                  className={`px-3 py-1 text-right font-semibold tabular-nums ${
                    isNeg ? 'text-neg' : 'text-navy-900'
                  }`}
                >
                  {privUsd(r.endBalance, { decimals: 0 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
