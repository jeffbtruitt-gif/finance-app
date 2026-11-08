import { useMemo } from 'react';
import { CHART, HChart, tipHtml, type Highcharts } from '@/lib/highcharts';

interface Props {
  months: string[];
  returns: number[];
  portfolioName: string;
}

export function PortfolioReturnsBarLine({ months, returns, portfolioName }: Props) {
  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: { type: 'column', height: 240 },
      legend: { enabled: false },
      xAxis: { categories: months, tickInterval: 4, labels: { style: { fontSize: '10px' } } },
      yAxis: {
        tickAmount: 5,
        labels: { formatter() { return `${Number(this.value).toFixed(1)}%`; } },
        plotLines: [{ value: 0, color: CHART.grayLight, width: 1, zIndex: 3 }],
      },
      tooltip: {
        formatter() {
          const v = Number(this.y);
          return tipHtml(months[Number(this.index)] ?? '', [
            { label: 'Return', value: `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, color: v >= 0 ? CHART.pos : CHART.neg },
          ]);
        },
      },
      plotOptions: { column: { borderWidth: 0, borderRadius: 2, pointPadding: 0.12, groupPadding: 0.04 } },
      series: [
        {
          type: 'column',
          name: 'Return',
          data: returns.map((v) => ({ y: v, color: v >= 0 ? 'rgba(30,126,90,0.55)' : 'rgba(192,57,43,0.55)' })),
        },
      ],
    }),
    [months, returns],
  );

  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const best = Math.max(...returns);
  const worst = Math.min(...returns);

  return (
    <div className="rounded-lg border border-navy-100 bg-white shadow-sm">
      <div className="flex items-start justify-between border-b border-navy-100 px-5 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">Realized Returns</div>
          <h3 className="mt-0.5 text-[15px] font-bold text-navy-800">{portfolioName} — monthly return rate</h3>
        </div>
        <div className="flex items-center gap-5 text-[11px] text-gray-500">
          <span>
            Avg{' '}
            <span className="ml-1 font-semibold text-navy-700 tabular-nums">{avg.toFixed(2)}%</span>
          </span>
          <span>
            Best{' '}
            <span className="ml-1 font-semibold text-pos tabular-nums">+{best.toFixed(2)}%</span>
          </span>
          <span>
            Worst{' '}
            <span className="ml-1 font-semibold text-neg tabular-nums">{worst.toFixed(2)}%</span>
          </span>
        </div>
      </div>
      <div className="px-3 pb-3 pt-1">
        <HChart options={options} />
      </div>
    </div>
  );
}
