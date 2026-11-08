/**
 * Small SVG helpers shared by Budget / Reforecast / Budget matrix report pages.
 */

import { useMemo } from 'react';
import { HChart, fmtUsd, tipHtml, type Highcharts } from '@/lib/highcharts';
import { sparklineBase } from '@/lib/sparklineBase';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NAVY = '#3b559a';
const NEG = '#c0392b';
const POS = '#1e7e5a';
const GRAY = '#e2e5ec';

export function BudgetMatrixSparkline({
  values,
  signed,
  bold,
}: {
  values: Array<number | null | undefined>;
  signed: boolean;
  bold?: boolean;
}) {
  const w = 80;
  const h = 22;
  const options = useMemo<Highcharts.Options>(() => {
    const base = sparklineBase(w, h);
    const vals = values.map((v) => (v == null ? 0 : Number(v)));
    // Line view: months with no value yet are gaps, not drops to zero.
    const lineVals = values.map((v) => (v == null ? null : Number(v)));
    const tip = (i: number, v: number) =>
      tipHtml(MONTHS[i] ?? `Month ${i + 1}`, [
        { label: signed ? 'Variance' : 'Amount', value: `${signed && v > 0 ? '+' : ''}${fmtUsd(v)}` },
      ]);
    if (signed) {
      return {
        ...base,
        yAxis: { ...(base.yAxis as Highcharts.YAxisOptions), plotLines: [{ value: 0, color: GRAY, width: 1 }] },
        tooltip: { ...base.tooltip, formatter() { return tip(Number(this.index), Number(this.y)); } },
        series: [
          {
            type: 'column',
            pointWidth: 5,
            data: vals.map((v) => ({ y: v, color: v > 0 ? NEG : v < 0 ? POS : '#c5cad4' })),
          },
        ],
      };
    }
    return {
      ...base,
      tooltip: { ...base.tooltip, formatter() { return tip(Number(this.index), Number(this.y)); } },
      series: [
        {
          type: 'area',
          color: NAVY,
          fillOpacity: 0.12,
          lineWidth: bold ? 1.8 : 1.4,
          threshold: Math.min(0, ...vals),
          data: lineVals,
        },
      ],
    };
  }, [values, signed, bold]);

  return <HChart options={options} style={{ width: w, height: h }} className="shrink-0" />;
}

export function VarianceMiniBar({
  projected,
  budget,
}: {
  projected: number;
  budget: number;
}) {
  const cap = Math.max(budget, projected, 1);
  const budgetPct = (budget / cap) * 100;
  const projPct = (projected / cap) * 100;
  const over = projected > budget;
  return (
    <div
      className="relative h-[5px] w-[86px] overflow-hidden rounded-sm bg-gray-100"
      aria-hidden
    >
      <div
        className="absolute bottom-0 left-0 top-0 opacity-85"
        style={{
          width: `${projPct}%`,
          backgroundColor: over ? NEG : POS,
        }}
      />
      <div
        className="absolute bottom-[-1px] top-[-1px] w-[1.5px] bg-navy-700"
        style={{ left: `${budgetPct}%` }}
      />
    </div>
  );
}
