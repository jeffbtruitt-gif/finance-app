import { useMemo } from 'react';
import { Card, Kpi } from '@/components/ds';
import { CHART, HChart, compactUsd, tipHtml, type Highcharts } from '@/lib/highcharts';
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
          <div className="mt-3">
            <TrendColumns trend={props.trend} />
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
        <div className="mt-3">
          <CompositionStrip items={composition} total={compTotal} onDrillCategory={props.onDrillCategory} />
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
  height = 200,
}: {
  rows: VarianceBarDatum[];
  ariaLabel: string;
  minWidth?: number;
  height?: number;
  padBottom?: number;
}) {
  const options = useMemo<Highcharts.Options>(() => {
    const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.varAmt)));
    const lim = maxAbs * 1.3;
    const color = (v: number) => (v > 0 ? VARIANCE_CHART_NEG : v < 0 ? VARIANCE_CHART_POS : '#9aa0af');
    return {
      chart: { type: 'column', height },
      legend: { enabled: false },
      xAxis: {
        categories: rows.map((r) => r.axisLabel),
        lineWidth: 0,
        labels: {
          style: { color: '#243460', fontSize: '10.5px', fontWeight: '600', textOverflow: 'ellipsis' },
        },
      },
      yAxis: {
        min: -lim,
        max: lim,
        tickAmount: 5,
        gridLineWidth: 0,
        labels: { enabled: false },
        plotLines: [{ value: 0, color: VARIANCE_CHART_BASELINE, width: 1.5, zIndex: 3 }],
      },
      tooltip: {
        formatter() {
          const r = rows[Number(this.index)];
          if (!r) return '';
          return tipHtml(r.axisLabel, [
            { label: r.varAmt > 0 ? 'Over budget' : 'Under budget', value: varianceBarValueLabel(r.varAmt), color: color(r.varAmt) },
          ]) + (r.onBarClick ? '<div style="margin-top:6px;color:#717889;font-size:10.5px">Click to see transactions</div>' : '');
        },
      },
      plotOptions: {
        column: {
          borderRadius: 3,
          borderWidth: 0,
          maxPointWidth: 52,
          minPointLength: 3,
          cursor: 'pointer',
          point: {
            events: {
              click() {
                rows[this.index]?.onBarClick?.();
              },
            },
          },
          dataLabels: {
            enabled: true,
            crop: false,
            overflow: 'allow',
            formatter() {
              return varianceBarValueLabel(Number(this.y));
            },
            style: { fontFamily: CHART.numFont, fontSize: '12px', fontWeight: '600', textOutline: 'none' },
          },
        },
      },
      series: [
        {
          type: 'column',
          name: 'Variance',
          data: rows.map((r) => ({
            y: r.varAmt,
            color: color(r.varAmt),
            dataLabels: { style: { color: r.varAmt === 0 ? '#717889' : color(r.varAmt) } },
          })),
        },
      ],
    };
  }, [rows, height]);

  return <HChart options={options} />;
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

function TrendColumns({ trend }: { trend: TrendMonthPoint[] }) {
  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: { type: 'column', height: 200 },
      legend: { enabled: true, align: 'left', verticalAlign: 'bottom', margin: 4, itemStyle: { fontSize: '10.5px' } },
      xAxis: { categories: trend.map((t) => t.month), labels: { style: { fontSize: '10px', fontWeight: '600' } } },
      yAxis: {
        min: 0,
        tickAmount: 4,
        labels: { formatter() { return compactUsd(Number(this.value)); } },
      },
      tooltip: {
        shared: true,
        formatter() {
          const t = trend[Number(this.points?.[0]?.index ?? 0)];
          if (!t) return '';
          const diff = t.actual - t.budget;
          return tipHtml(t.month, [
            { label: 'Actual', value: fmtUsd(t.actual), color: CHART.navy400 },
            { label: 'Budget', value: fmtUsd(t.budget), color: '#d4b96a' },
            { label: diff > 0 ? 'Over' : 'Under', value: fmtUsd(Math.abs(diff)) },
          ]);
        },
      },
      plotOptions: {
        column: { borderRadius: 3, borderWidth: 0, maxPointWidth: 14, pointPadding: 0.04, groupPadding: 0.14 },
      },
      series: [
        { type: 'column', name: 'Actual', color: CHART.navy400, data: trend.map((t) => t.actual) },
        { type: 'column', name: 'Budget', color: '#d4b96a', data: trend.map((t) => t.budget) },
      ],
    }),
    [trend],
  );
  return <HChart options={options} />;
}

function CompositionStrip({
  items,
  total,
  onDrillCategory,
}: {
  items: ReportMonthGroup['items'];
  total: number;
  onDrillCategory: (id: string, name: string) => void;
}) {
  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: { type: 'bar', height: 52, spacing: [0, 0, 0, 0] },
      legend: { enabled: false },
      xAxis: { categories: ['Spend'], visible: false },
      yAxis: { min: 0, max: 100, visible: false },
      tooltip: {
        formatter() {
          const c = items.find((x) => x.id === (this as unknown as { series: { userOptions: { id?: string } } }).series.userOptions.id);
          if (!c) return '';
          return tipHtml(c.name, [
            { label: 'Spend', value: fmtUsd(c.actual), color: c.color },
            { label: 'Share', value: `${((c.actual / total) * 100).toFixed(1)}%` },
          ]) + '<div style="margin-top:6px;color:#717889;font-size:10.5px">Click to see transactions</div>';
        },
      },
      plotOptions: {
        bar: {
          stacking: 'percent',
          borderColor: '#ffffff',
          borderWidth: 1,
          pointWidth: 32,
          cursor: 'pointer',
          states: { inactive: { opacity: 0.6 } },
        },
      },
      // One series per category so each segment gets its own color and click.
      series: [...items].reverse().map((c) => ({
        type: 'bar' as const,
        id: c.id,
        name: c.name,
        color: c.color,
        data: [c.actual],
        events: { click: () => onDrillCategory(c.id, c.name) },
      })),
    }),
    [items, total, onDrillCategory],
  );
  return <HChart options={options} />;
}
