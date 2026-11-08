/**
 * Per-group Spend Treemap cards (Highcharts treemap): title + "Area =
 * proportion of spend", squarified tiles in category colors with name +
 * amount, click a tile to drill to Detail. Double-click the group label to
 * drill to the whole group.
 */

import { useMemo } from 'react';
import type { ReportMonthGroup } from '@/features/reports/monthlyReportModel';
import { CHART, HChart, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';

function GroupTreemapCard({
  group,
  onDrillItem,
  onDrillGroup,
}: {
  group: ReportMonthGroup;
  onDrillItem: (id: string, name: string) => void;
  onDrillGroup: (drillKey: string, displayLabel: string) => void;
}) {
  const items = useMemo(() => group.items.filter((i) => i.actual > 0), [group]);
  const total = items.reduce((s, i) => s + i.actual, 0);

  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: { height: 260, spacing: [0, 0, 0, 0] },
      tooltip: {
        formatter() {
          const it = items[Number(this.index)];
          if (!it) return '';
          return tipHtml(it.name, [
            { label: 'Spend', value: fmtUsd(it.actual), color: it.color },
            { label: 'Share of group', value: `${((it.actual / total) * 100).toFixed(1)}%` },
          ]);
        },
      },
      series: [
        {
          type: 'treemap',
          layoutAlgorithm: 'squarified',
          borderColor: '#ffffff',
          borderWidth: 2,
          borderRadius: 4,
          cursor: 'pointer',
          data: items.map((it) => ({ id: it.id, name: it.name, value: it.actual, color: it.color })),
          dataLabels: {
            enabled: true,
            useHTML: true,
            align: 'center',
            verticalAlign: 'middle',
            formatter() {
              const p = this as unknown as { point: Highcharts.Point & { value: number; shapeArgs?: { width: number; height: number } } };
              const pt = p.point;
              const w = pt.shapeArgs?.width ?? 0;
              const h = pt.shapeArgs?.height ?? 0;
              if (w < 56 || h < 40) return '';
              return (
                `<div style="text-align:center;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35);max-width:${w - 8}px">` +
                `<div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pt.name}</div>` +
                `<div style="font-size:11px;font-weight:600;font-family:${CHART.numFont};opacity:.92">${fmtUsd(pt.value)}</div>` +
                `</div>`
              );
            },
          },
          point: {
            events: {
              click() {
                const it = items[this.index];
                if (it) onDrillItem(it.id, it.name);
              },
            },
          },
          states: { hover: { brightness: 0.06, borderColor: '#ffffff' } },
        },
      ],
    }),
    [items, total, onDrillItem],
  );

  return (
    <div className="rounded-lg border border-navy-100 bg-white p-5 shadow-sm">
      <h3 className="text-h4 font-bold tracking-tight text-navy-900">Spend Treemap</h3>
      <p className="mt-1 text-caption text-gray-500">Area = proportion of spend</p>

      <button
        type="button"
        className="mt-4 block w-full text-left text-[11px] font-bold uppercase tracking-wider text-navy-700 hover:text-gold-600"
        onDoubleClick={() => onDrillGroup(group.drillKey, group.name)}
        title="Double-click to open Detail for this group"
      >
        {group.name}
      </button>

      <div className="mt-4 overflow-hidden rounded-xl border border-navy-100 bg-gray-50">
        {items.length > 0 ? (
          <HChart options={options} />
        ) : (
          <div className="flex h-[200px] items-center justify-center text-sm text-gray-500">
            No spending in this group this month
          </div>
        )}
      </div>
    </div>
  );
}

export function ReportsTreemap(props: {
  groups: ReportMonthGroup[];
  onDrillItem: (id: string, name: string) => void;
  onDrillGroup: (drillKey: string, displayLabel: string) => void;
}) {
  const anySpend = useMemo(
    () => props.groups.some((g) => g.items.some((i) => i.actual > 0)),
    [props.groups],
  );

  if (!anySpend) {
    return (
      <div className="rounded-lg border border-navy-100 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-600">No spending in this month yet</p>
        <p className="mt-1 text-caption text-gray-500">
          Import transactions or pick another month to see treemaps by group.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {props.groups.map((g) => (
        <GroupTreemapCard
          key={g.drillKey}
          group={g}
          onDrillItem={props.onDrillItem}
          onDrillGroup={props.onDrillGroup}
        />
      ))}
    </div>
  );
}
