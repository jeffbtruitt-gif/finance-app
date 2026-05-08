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

import { useEffect, useState } from 'react';
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
import {
  buildCollegeProjection,
  type CollegeProjection,
} from '@/features/college/projection';
import { LineChart } from '@/components/LineChart';
import { StatusPanel } from '@/components/StatusPanel';
import { usePrivacyUsdFormatters } from '@/lib/usePrivacyUsdFormatters';
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

  const [newName, setNewName] = useState('');
  const [newBirthYear, setNewBirthYear] = useState('');

  async function addKid() {
    if (!household) return;
    const name = newName.trim();
    const by = parseInt(newBirthYear, 10);
    if (!name || !Number.isFinite(by) || by < 1900 || by > 2100) return;
    await createCollegeKid({
      household_id: household.id,
      name,
      birth_year: by,
    });
    setNewName('');
    setNewBirthYear('');
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
  const projections = kids.map((k) =>
    buildCollegeProjection(k, {
      currentYear,
      monthsLeftInCurrentYear: monthsLeft,
    }),
  );

  // Summary across kids: combined surplus / shortfall after each kid graduates.
  const surplusByKid = projections.map((p) => p.finalBalance);
  const totalSurplus = surplusByKid.reduce((s, v) => s + v, 0);
  const allOnTrack = projections.length > 0 && projections.every((p) => p.onTrack);

  const inputCls =
    'rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';

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
        {projections.length > 0 && (
          <CollegeSummaryBadge totalSurplus={totalSurplus} allOnTrack={allOnTrack} />
        )}
      </div>

      <Card>
        <div className="text-h4 text-navy-800">Add a kid</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className={`w-48 ${inputCls}`}
          />
          <input
            value={newBirthYear}
            onChange={(e) => setNewBirthYear(e.target.value)}
            placeholder="Birth year (e.g. 2018)"
            inputMode="numeric"
            className={`w-40 ${inputCls}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addKid();
            }}
          />
          <Button size="sm" onClick={addKid}>
            Add
          </Button>
          <div className="text-caption text-gray-500">
            Defaults: ${DEFAULT_ANNUAL_COST.toLocaleString()}/yr cost,{' '}
            {(DEFAULT_COST_INFLATION * 100).toFixed(0)}% inflation, 6% return,
            4-yr undergrad starting at age 18.
          </div>
        </div>
      </Card>

      {/* Per-kid sections */}
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
        />
      ))}
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

function KidSection({
  projection,
  onPatch,
  onRemove,
}: {
  projection: CollegeProjection;
  onPatch: (patch: Parameters<typeof updateCollegeKid>[0]['patch']) => Promise<void>;
  onRemove: () => void;
}) {
  const { sensitive: privUsd } = usePrivacyUsdFormatters();
  const { kid } = projection;
  const linePoints = projection.rows.map((r) => ({
    x: r.year,
    y: r.endBalance,
  }));

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
        <KidInput
          label="Current balance"
          value={kid.current_balance}
          kind="dollars"
          onCommit={(v) => onPatch({ current_balance: v ?? 0 })}
        />
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

      <div className="border-b border-navy-100 p-4">
        <LineChart
          points={linePoints}
          title="Balance trajectory"
          subtitle={`Through graduation (${projection.graduationYear})`}
        />
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
