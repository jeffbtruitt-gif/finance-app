import { Card, Kpi } from '@/components/ds';
import type { ReportMonthGroup } from '@/features/reports/monthlyReportModel';
import type { TrendMonthPoint, MoverRow } from '@/features/reports/monthlyReportModel';
import { budgetHealthCounts, topMovers } from '@/features/reports/monthlyReportModel';
import { fmtUsd, fmtMoney, variance, varianceClass, fmtPct, variancePct } from '@/lib/money';

export function ReportsDashboard(props: {
  label: string;
  monthlyActual: number;
  monthlyBudget: number;
  groups: ReportMonthGroup[];
  trend: TrendMonthPoint[];
  onDrillCategory: (id: string, name: string) => void;
  onDrillGroup: (drillKey: string, displayLabel: string) => void;
}) {
  const v = variance(props.monthlyActual, props.monthlyBudget);
  const vp = variancePct(props.monthlyActual, props.monthlyBudget);
  const budgetUsedPct =
    props.monthlyBudget > 0 ? (props.monthlyActual / props.monthlyBudget) * 100 : null;
  const budgetUsedLabel =
    budgetUsedPct != null && Number.isFinite(budgetUsedPct)
      ? `${budgetUsedPct.toFixed(0)}%`
      : '—';
  const spendProgress =
    props.monthlyBudget > 0 ? Math.min(100, (props.monthlyActual / props.monthlyBudget) * 100) : 0;
  const movers = topMovers({ groups: props.groups, limit: 5 });
  const health = budgetHealthCounts(props.groups);
  const maxTrend = Math.max(
    1,
    ...props.trend.map((t) => Math.max(t.actual, t.budget)),
  );

  const composition = props.groups
    .flatMap((g) => g.items)
    .filter((i) => i.actual > 0)
    .sort((a, b) => b.actual - a.actual);
  const compTotal = composition.reduce((s, i) => s + i.actual, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Actual spend"
          value={fmtUsd(props.monthlyActual)}
          subtitle={props.label}
          rightSlot={
            <div className="mt-6 w-24">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
                <div
                  className="h-full rounded-full bg-navy-500"
                  style={{ width: `${spendProgress}%` }}
                />
              </div>
            </div>
          }
        />
        <Kpi label="Budget" value={fmtUsd(props.monthlyBudget)} subtitle="Monthly cadence" />
        <Kpi
          label="Budget used"
          value={budgetUsedLabel}
          subtitle={
            props.monthlyBudget > 0
              ? `${fmtUsd(props.monthlyActual)} of ${fmtUsd(props.monthlyBudget)}`
              : 'No monthly budget set'
          }
          trend={
            budgetUsedPct == null
              ? undefined
              : budgetUsedPct > 100
                ? { direction: 'neg', text: 'Over 100% of budget' }
                : budgetUsedPct < 100
                  ? { direction: 'pos', text: 'Below full budget' }
                  : { direction: 'neutral', text: 'Matches monthly budget' }
          }
        />
        <Kpi
          label="Variance"
          value={<span className={varianceClass(v)}>{fmtUsd(v)}</span>}
          subtitle={fmtPct(vp)}
          trend={{
            direction: v < 0 ? 'pos' : v > 0 ? 'neg' : 'neutral',
            text: v === 0 ? 'On budget' : v < 0 ? 'Under budget' : 'Over budget',
          }}
        />
      </div>

      <Card>
        <div className="text-label uppercase text-gray-500">Actual vs budget</div>
        <p className="mt-1 text-caption text-gray-500">
          Group variance vs monthly budget — bars extend up when over, down when under. Click a bar to open the
          Detail tab for that group.
        </p>
        <GroupVarianceBarChart groups={props.groups} onDrillGroup={props.onDrillGroup} />
      </Card>

      <Card>
        <div className="text-label uppercase text-gray-500">By category</div>
        <p className="mt-1 text-caption text-gray-500">
          Variance vs monthly budget within each group — green under, red over. Click a bar to drill to that
          category. Double-click the group title to filter the whole group.
        </p>
        <div className="mt-6 space-y-10">
          {props.groups.map((g, gi) => (
            <div key={g.drillKey} className={gi > 0 ? 'border-t border-navy-100 pt-10' : ''}>
              <button
                type="button"
                className="mb-4 block text-left text-xs font-bold uppercase tracking-wider text-navy-800 hover:text-gold-600"
                onDoubleClick={() => props.onDrillGroup(g.drillKey, g.name)}
                title="Double-click to open Detail for this group"
              >
                {g.name}
              </button>
              {g.items.length === 0 ? (
                <p className="text-caption text-gray-500">No categories in this group.</p>
              ) : (
                <CategoryVarianceBarChart items={g.items} onDrillCategory={props.onDrillCategory} />
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <div className="text-label uppercase text-gray-500">12-month trend</div>
          <p className="mt-1 text-caption text-gray-500">Monthly spend vs budget (rolling).</p>
          <div className="mt-4 flex h-40 items-end gap-1">
            {props.trend.map((t) => {
              const ah = (t.actual / maxTrend) * 100;
              const bh = (t.budget / maxTrend) * 100;
              return (
                <div key={t.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex h-32 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 max-w-[14px] rounded-t bg-navy-400"
                      style={{ height: `${Math.max(ah, 2)}%` }}
                      title={`Actual ${t.month}: ${fmtUsd(t.actual)}`}
                    />
                    <div
                      className="w-1/2 max-w-[14px] rounded-t bg-gold-400/90"
                      style={{ height: `${Math.max(bh, 2)}%` }}
                      title={`Budget ${t.month}: ${fmtUsd(t.budget)}`}
                    />
                  </div>
                  <span className="truncate text-[9px] font-semibold text-gray-500">{t.month}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-4 text-[10px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-navy-400" /> Actual
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-gold-400" /> Budget
            </span>
          </div>
        </Card>

        <Card className="lg:col-span-5">
          <div className="text-label uppercase text-gray-500">Top movers</div>
          <p className="mt-1 text-caption text-gray-500">Largest variance vs monthly budget.</p>
          <MoversList title="Over budget" rows={movers.up} />
          <MoversList title="Under budget" rows={movers.down} />
        </Card>
      </div>

      <Card>
        <div className="text-label uppercase text-gray-500">Composition</div>
        <p className="mt-1 text-caption text-gray-500">Share of monthly spend by category.</p>
        <div className="mt-4 flex h-8 w-full overflow-hidden rounded-md border border-navy-100">
          {composition.map((c) => (
            <button
              key={c.id}
              type="button"
              title={`${c.name} ${fmtUsd(c.actual)}`}
              className="h-full min-w-[2px] transition-opacity hover:opacity-85"
              style={{
                width: `${(c.actual / compTotal) * 100}%`,
                backgroundColor: c.color,
              }}
              onClick={() => props.onDrillCategory(c.id, c.name)}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
          {composition.slice(0, 10).map((c) => (
            <button
              key={c.id}
              type="button"
              className="inline-flex items-center gap-1 hover:text-navy-900"
              onClick={() => props.onDrillCategory(c.id, c.name)}
            >
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <HealthPill label={`${health.under} under`} tone="pos" />
        <HealthPill label={`${health.on} on budget`} tone="info" />
        <HealthPill label={`${health.over} over`} tone="neg" />
      </div>
    </div>
  );
}

/** Design-system semantic fills (matches `tailwind.config.ts` pos / neg DEFAULT). */
const VARIANCE_CHART_POS = '#1e7e5a';
const VARIANCE_CHART_NEG = '#c0392b';
const VARIANCE_CHART_BASELINE = '#bfcae3';

function groupVarianceAxisLabel(g: ReportMonthGroup): string {
  const base =
    g.drillKey === 'Rent & House Maintenance' ? 'Rent & Utilities' : g.drillKey;
  return `Total ${base}`;
}

/** Spreadsheet-style labels: under budget in parentheses, over budget as currency. */
function varianceBarValueLabel(v: number): string {
  if (v === 0) return fmtUsd(0);
  if (v < 0) return `($${fmtMoney(Math.abs(v))})`;
  return fmtUsd(v);
}

interface VarianceBarDatum {
  key: string;
  axisLabel: string;
  varAmt: number;
  onBarClick?: () => void;
  /** Native tooltip on hover */
  title?: string;
}

function VarianceDivergingChart({
  rows,
  ariaLabel,
  minWidth = 560,
  height = 168,
  padBottom = 44,
}: {
  rows: VarianceBarDatum[];
  ariaLabel: string;
  minWidth?: number;
  height?: number;
  padBottom?: number;
}) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.varAmt)));
  const n = rows.length;
  const W = Math.max(minWidth, 56 + n * 76);
  const H = height;
  const padX = 36;
  const padTop = 16;
  const midY = padTop + (H - padTop - padBottom) / 2;
  const maxBarHalf = midY - padTop - 8;
  const plotW = W - padX * 2;
  const slot = plotW / Math.max(n, 1);
  const barW = Math.min(52, slot * 0.52);

  return (
    <div className="overflow-x-auto">
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto max-w-full select-none"
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1={padX}
          x2={W - padX}
          y1={midY}
          y2={midY}
          stroke={VARIANCE_CHART_BASELINE}
          strokeWidth={1.5}
        />
        {rows.map((r, i) => {
          const cx = padX + (i + 0.5) * slot;
          const x = cx - barW / 2;
          const mag = (Math.abs(r.varAmt) / maxAbs) * maxBarHalf;
          const fill = r.varAmt > 0 ? VARIANCE_CHART_NEG : r.varAmt < 0 ? VARIANCE_CHART_POS : '#9aa0af';
          const label = varianceBarValueLabel(r.varAmt);
          let barY: number;
          let barH: number;
          if (r.varAmt >= 0) {
            barH = Math.max(r.varAmt === 0 ? 0 : mag, r.varAmt === 0 ? 0 : 3);
            barY = midY - barH;
          } else {
            barH = Math.max(mag, 3);
            barY = midY;
          }
          const ty = r.varAmt > 0 ? barY - 6 : r.varAmt < 0 ? barY + barH + 14 : midY - 14;
          const truncated =
            r.axisLabel.length > 18 ? `${r.axisLabel.slice(0, 16)}…` : r.axisLabel;
          return (
            <g key={r.key}>
              {r.title ? <title>{r.title}</title> : null}
              <rect
                x={x}
                y={barY}
                width={barW}
                height={barH}
                rx={3}
                fill={fill}
                className={r.onBarClick ? 'cursor-pointer transition-opacity hover:opacity-90' : ''}
                onClick={r.onBarClick}
              />
              <text
                x={cx}
                y={ty}
                textAnchor="middle"
                style={{
                  fontFamily: "'Space Grotesk', Figtree, system-ui, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  fill: r.varAmt > 0 ? VARIANCE_CHART_NEG : r.varAmt < 0 ? VARIANCE_CHART_POS : '#717889',
                }}
              >
                {label}
              </text>
              <text
                x={cx}
                y={H - 14}
                textAnchor="middle"
                style={{
                  fontFamily: 'Figtree, Inter, system-ui, sans-serif',
                  fontSize: 10,
                  fontWeight: 600,
                  fill: '#243460',
                }}
              >
                {truncated}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function GroupVarianceBarChart({
  groups,
  onDrillGroup,
}: {
  groups: ReportMonthGroup[];
  onDrillGroup: (drillKey: string, displayLabel: string) => void;
}) {
  const rows: VarianceBarDatum[] = groups.map((g) => {
    const actual = g.items.reduce((s, i) => s + i.actual, 0);
    const budget = g.items.reduce((s, i) => s + i.budget, 0);
    const varAmt = variance(actual, budget);
    return {
      key: g.drillKey,
      axisLabel: groupVarianceAxisLabel(g),
      varAmt,
      title: `${groupVarianceAxisLabel(g)} — variance ${varianceBarValueLabel(varAmt)}`,
      onBarClick: () => onDrillGroup(g.drillKey, g.name),
    };
  });

  return (
    <div className="mt-5">
      <VarianceDivergingChart rows={rows} ariaLabel="Variance vs budget by spend group" />
    </div>
  );
}

function CategoryVarianceBarChart({
  items,
  onDrillCategory,
}: {
  items: ReportMonthGroup['items'];
  onDrillCategory: (id: string, name: string) => void;
}) {
  const rows: VarianceBarDatum[] = items.map((it) => {
    const varAmt = variance(it.actual, it.budget);
    return {
      key: it.id,
      axisLabel: it.name,
      varAmt,
      title: `${it.name} — actual ${fmtUsd(it.actual)}, budget ${fmtUsd(it.budget)}, variance ${varianceBarValueLabel(varAmt)}`,
      onBarClick: () => onDrillCategory(it.id, it.name),
    };
  });

  return (
    <VarianceDivergingChart
      rows={rows}
      ariaLabel="Variance vs budget by category"
      padBottom={48}
      minWidth={480}
    />
  );
}

function HealthPill({ label, tone }: { label: string; tone: 'pos' | 'info' | 'neg' }) {
  const bg =
    tone === 'pos' ? 'bg-pos-soft text-pos' : tone === 'neg' ? 'bg-neg-soft text-neg' : 'bg-info-soft text-info';
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${bg}`}>
      {label}
    </span>
  );
}

function MoversList({ title, rows }: { title: string; rows: MoverRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</div>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium text-navy-900">{r.name}</span>
            <span className={`shrink-0 font-semibold tabular-nums ${r.delta > 0 ? 'text-neg' : 'text-pos'}`}>
              {fmtUsd(r.delta)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
