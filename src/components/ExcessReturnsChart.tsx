import { useMemo } from 'react';
import { CHART, HChart, tipHtml, type Highcharts } from '@/lib/highcharts';

interface Props {
  months: string[];
  mktRf: number[];
  portRf: number[];
}

export function ExcessReturnsChart({ months, mktRf, portRf }: Props) {
  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: { type: 'line', height: 280 },
      legend: { enabled: false },
      xAxis: {
        categories: months,
        tickInterval: 4,
        labels: { style: { fontSize: '10px' } },
        crosshair: { color: '#cbd5e1', dashStyle: 'Dash', width: 1 },
      },
      yAxis: {
        tickAmount: 6,
        labels: { formatter() { return `${Number(this.value).toFixed(1)}%`; } },
        plotLines: [{ value: 0, color: CHART.grayLight, width: 1, zIndex: 3 }],
      },
      tooltip: {
        shared: true,
        formatter() {
          const i = Number(this.points?.[0]?.index ?? 0);
          const f = (v: number | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
          return tipHtml(months[i] ?? '', [
            { label: 'Portfolio − RF', value: f(portRf[i]), color: CHART.navy700 },
            { label: 'Market − RF', value: f(mktRf[i]), color: CHART.gold600 },
          ]);
        },
      },
      plotOptions: { line: { marker: { enabled: false, states: { hover: { enabled: true } } } } },
      series: [
        { type: 'line', name: 'Market − RF', color: CHART.gold600, dashStyle: 'ShortDash', lineWidth: 1.6, data: mktRf },
        {
          type: 'line',
          name: 'Portfolio − RF',
          color: CHART.navy700,
          lineWidth: 2.2,
          zIndex: 2,
          marker: { enabled: true, radius: 2.4, symbol: 'circle' },
          data: portRf,
        },
      ],
    }),
    [months, mktRf, portRf],
  );

  return (
    <div className="rounded-lg border border-navy-100 bg-white shadow-sm">
      <div className="flex items-start justify-between border-b border-navy-100 px-5 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">Excess Returns</div>
          <h3 className="mt-0.5 text-[15px] font-bold text-navy-800">Portfolio − RF vs. Market − RF</h3>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-navy-700">
            <span className="inline-block h-[3px] w-5 rounded bg-navy-700" />
            Portfolio − RF
          </span>
          <span className="inline-flex items-center gap-1.5 text-gold-600">
            <span
              className="inline-block h-[3px] w-5 rounded"
              style={{ background: 'repeating-linear-gradient(90deg,#a07830 0 4px,transparent 4px 7px)' }}
            />
            Market − RF
          </span>
        </div>
      </div>
      <div className="px-3 pb-3 pt-1">
        <HChart options={options} />
      </div>
    </div>
  );
}
