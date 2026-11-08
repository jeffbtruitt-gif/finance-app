import type Highcharts from 'highcharts';

/**
 * Bare-bones Highcharts options for inline sparklines: fixed size, no axes,
 * no legend, compact tooltip that escapes the tiny chart box (outside: true).
 */
export function sparklineBase(width: number, height: number): Highcharts.Options {
  return {
    chart: {
      width,
      height,
      margin: [2, 2, 2, 2],
      spacing: [0, 0, 0, 0],
      backgroundColor: 'transparent',
      animation: false,
      style: { overflow: 'visible' },
    },
    legend: { enabled: false },
    xAxis: { visible: false, startOnTick: false, endOnTick: false, minPadding: 0.02, maxPadding: 0.02 },
    yAxis: { visible: false, startOnTick: false, endOnTick: false },
    tooltip: { outside: true, hideDelay: 0, padding: 8 },
    plotOptions: {
      series: {
        animation: false,
        marker: { enabled: false, radius: 2, states: { hover: { enabled: true, radius: 3 } } },
        states: { hover: { lineWidthPlus: 0 } },
      },
      column: { borderWidth: 0, borderRadius: 1, pointPadding: 0.12, groupPadding: 0 },
    },
  };
}
