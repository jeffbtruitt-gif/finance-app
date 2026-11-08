/**
 * Balance sheet change bars (Highcharts diverging bars): one chart per
 * section (assets, liabilities, equity by group). Bars go right for increases
 * and left for decreases; all three share one scale. Green = good change,
 * red = bad (for liabilities an increase is red).
 */

import { useMemo } from 'react';
import { CHART, HChart, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';
import { fmtPct } from '@/lib/money';
import type { AccountChangeRow, EquityGroupChangeRow } from './change';

const NEU = '#94a3b8';
const ROW_PX = 46;

type Kind = 'asset' | 'liability' | 'equity';
type Row = { key: string; label: string; sub?: string; delta: number | null; pct: number | null; kind: Kind };

function barFill(kind: Kind, delta: number): string {
  if (delta === 0) return NEU;
  if (kind === 'liability') return delta > 0 ? CHART.neg : CHART.pos;
  return delta > 0 ? CHART.pos : CHART.neg;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function HorizonBars(props: { title: string; caption?: string; maxAbs: number; rows: Row[] }) {
  const { title, caption, maxAbs, rows } = props;

  const options = useMemo<Highcharts.Options>(() => {
    const lim = maxAbs * 1.6; // headroom for the value labels
    return {
      chart: { type: 'bar', height: Math.max(80, rows.length * ROW_PX + 30), spacingLeft: 4 },
      legend: { enabled: false },
      xAxis: {
        categories: rows.map((r) => r.key),
        lineWidth: 0,
        labels: {
          useHTML: true,
          align: 'left',
          reserveSpace: true,
          formatter() {
            const r = rows[Number(this.pos)];
            if (!r) return '';
            return (
              `<div style="width:170px;line-height:1.25">` +
              `<div style="color:${CHART.navy900};font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.label)}</div>` +
              (r.sub ? `<div style="color:#6b7280;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.sub)}</div>` : '') +
              `</div>`
            );
          },
        },
      },
      yAxis: {
        min: -lim,
        max: lim,
        tickAmount: 5,
        gridLineWidth: 0,
        plotLines: [{ value: 0, color: '#cbd5e1', width: 1, zIndex: 3 }],
        labels: { enabled: false },
      },
      tooltip: {
        formatter() {
          const r = rows[Number(this.index)];
          if (!r) return '';
          return tipHtml(r.label, [
            { label: 'Change', value: r.delta == null ? '—' : fmtUsd(r.delta), color: r.delta == null ? undefined : barFill(r.kind, r.delta) },
            { label: '% change', value: fmtPct(r.pct, { decimals: 1 }) },
          ]);
        },
      },
      plotOptions: {
        bar: {
          borderRadius: 2,
          borderWidth: 0,
          pointWidth: 12,
          minPointLength: 2,
          dataLabels: {
            enabled: true,
            crop: false,
            overflow: 'allow',
            formatter() {
              const r = rows[Number(this.index)];
              if (!r || r.delta == null) return '—';
              return `<b>${fmtUsd(r.delta)}</b> <span style="color:#6b7280;font-weight:400">${fmtPct(r.pct, { decimals: 1 })}</span>`;
            },
            style: { color: CHART.navy900, fontSize: '11px', textOutline: 'none' },
          },
        },
      },
      series: [
        {
          type: 'bar',
          name: 'Change',
          data: rows.map((r) => ({ y: r.delta ?? 0, color: r.delta == null ? NEU : barFill(r.kind, r.delta) })),
        },
      ],
    };
  }, [rows, maxAbs]);

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-navy-700">{title}</h3>
        {caption ? <p className="mt-0.5 text-xs text-gray-500">{caption}</p> : null}
      </div>
      {rows.length > 0 ? <HChart options={options} /> : <p className="text-sm text-gray-400">Nothing to compare.</p>}
    </section>
  );
}

function maxAbsAccount(rows: AccountChangeRow[]): number {
  let m = 0;
  for (const r of rows) if (r.delta != null) m = Math.max(m, Math.abs(r.delta));
  return m;
}

function maxAbsEquity(rows: EquityGroupChangeRow[]): number {
  let m = 0;
  for (const r of rows) m = Math.max(m, Math.abs(r.delta));
  return m;
}

export function BalanceSheetChangeBars(props: {
  assets: AccountChangeRow[];
  liabilities: AccountChangeRow[];
  equity: EquityGroupChangeRow[];
}) {
  const { assets, liabilities, equity } = props;

  const assetRows: Row[] = assets.map((r) => ({
    key: r.id, label: r.name, sub: r.groupLabel, delta: r.delta, pct: r.pct, kind: 'asset',
  }));
  const liabilityRows: Row[] = liabilities.map((r) => ({
    key: r.id, label: r.name, sub: r.groupLabel, delta: r.delta, pct: r.pct, kind: 'liability',
  }));
  const equityRows: Row[] = equity.map((r) => ({
    key: r.groupLabel, label: r.groupLabel, delta: r.delta, pct: r.pct, kind: 'equity',
  }));

  const globalMax = Math.max(maxAbsAccount(assets), maxAbsAccount(liabilities), maxAbsEquity(equity), 1);

  return (
    <div className="space-y-8">
      <p className="text-xs text-gray-500">
        Bars extend right for increases and left for decreases (scale matches the largest change in this view).
        Dollar change is effective balance at the report month minus the comparison month; % is relative to the
        comparison balance when it&apos;s non-zero.
      </p>
      <HorizonBars title="Assets" caption="Increase is shown in green; decrease in red." maxAbs={globalMax} rows={assetRows} />
      <HorizonBars title="Liabilities" caption="Increase in what you owe is red; pay-down is green." maxAbs={globalMax} rows={liabilityRows} />
      <HorizonBars
        title="Equity by group"
        caption="Net (assets − liabilities) in each group vs the comparison month."
        maxAbs={globalMax}
        rows={equityRows}
      />
    </div>
  );
}
