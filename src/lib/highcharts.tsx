/**
 * Shared Highcharts setup for every chart in the app.
 *
 * - Loads the extra modules we use (waterfall via highcharts-more, treemap).
 * - Applies the Truitt Finance design-system theme once (Figtree, navy/gold
 *   palette, light dashed grid, white tooltip with navy border).
 * - Exports <HChart>, a thin wrapper around highcharts-react, plus small
 *   formatting helpers so individual charts stay short.
 *
 * Import Highcharts from here (not from 'highcharts' directly) so the theme
 * and modules are guaranteed to be registered first.
 */

import Highcharts from 'highcharts';
import 'highcharts/highcharts-more';
import 'highcharts/modules/treemap';
import HighchartsReact from 'highcharts-react-official';
import { fmtMoney, fmtUsd } from '@/lib/money';

/** Design-system colors used across charts (match tailwind.config.ts). */
export const CHART = {
  navy900: '#0d1527',
  navy800: '#1a2744',
  navy700: '#243460',
  navy500: '#3b559a',
  navy400: '#6278b8',
  navy300: '#8fa1cc',
  navy200: '#bfcae3',
  navy100: '#e8ecf5',
  gold500: '#c9a84c',
  gold600: '#a07830',
  pos: '#1e7e5a',
  neg: '#c0392b',
  warn: '#d97706',
  gray: '#717889',
  grayLight: '#9aa0af',
  grid: '#e8ecf5',
  axis: '#e2e5ec',
  font: "Figtree, Inter, system-ui, sans-serif",
  numFont: "'Space Grotesk', Figtree, system-ui, sans-serif",
} as const;

Highcharts.setOptions({
  lang: { thousandsSep: ',' },
  colors: [
    CHART.navy700,
    CHART.gold500,
    CHART.navy400,
    CHART.pos,
    '#3884c2',
    '#e08750',
    CHART.navy300,
    '#3a9e6f',
    CHART.navy500,
    '#7a8aa8',
    '#22a39f',
    '#c98c3b',
  ],
  chart: {
    backgroundColor: 'transparent',
    style: { fontFamily: CHART.font },
    spacing: [10, 8, 6, 8],
  },
  title: { text: undefined },
  subtitle: { text: undefined },
  credits: { enabled: false },
  accessibility: { enabled: false },
  exporting: { enabled: false },
  legend: {
    itemStyle: { color: '#545b6e', fontSize: '11px', fontWeight: '500' },
    itemHoverStyle: { color: CHART.navy900 },
    symbolRadius: 2,
  },
  xAxis: {
    lineColor: CHART.axis,
    tickColor: CHART.axis,
    tickLength: 0,
    labels: { style: { color: CHART.gray, fontSize: '11px' } },
    title: { text: undefined },
  },
  yAxis: {
    gridLineColor: CHART.grid,
    gridLineDashStyle: 'Dash',
    labels: { style: { color: CHART.gray, fontSize: '11px' } },
    title: { text: undefined },
  },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: CHART.navy200,
    borderRadius: 6,
    borderWidth: 1,
    shadow: { color: 'rgba(13,21,39,0.12)', offsetX: 0, offsetY: 2, width: 6 },
    padding: 10,
    useHTML: true,
    style: { color: CHART.navy900, fontSize: '12px' },
  },
  plotOptions: {
    series: {
      animation: { duration: 350 },
      states: { inactive: { opacity: 0.55 } },
    },
  },
});

export { Highcharts };

/** Thin wrapper so every chart renders the same way. */
export function HChart({
  options,
  className,
  style,
}: {
  options: Highcharts.Options;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <HighchartsReact
      highcharts={Highcharts}
      options={options}
      containerProps={{ className, style: { width: '100%', ...style } }}
    />
  );
}

/** "$1.2M", "$960K", "$85" — for axis labels. */
export function compactUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${fmtMoney(abs / 1_000_000, { decimals: abs >= 10_000_000 ? 1 : 2 })}M`;
  if (abs >= 1_000) return `${sign}$${fmtMoney(abs / 1_000)}K`;
  return `${sign}$${fmtMoney(abs)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Tooltip body in the same layout as the app's ChartTooltip:
 * bold headline, divider, then label → value rows.
 */
export function tipHtml(
  headline: string,
  rows: ReadonlyArray<{ label: string; value: string; color?: string }>,
): string {
  const body = rows
    .map(
      (r) =>
        `<div style="display:flex;justify-content:space-between;gap:20px;align-items:baseline;margin-top:5px">` +
        `<span style="color:#545b6e;font-size:11px;font-weight:500">` +
        (r.color
          ? `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${r.color};margin-right:6px"></span>`
          : '') +
        `${esc(r.label)}</span>` +
        `<span style="font-weight:600;font-variant-numeric:tabular-nums;color:${CHART.navy900}">${esc(r.value)}</span>` +
        `</div>`,
    )
    .join('');
  return (
    `<div style="min-width:140px">` +
    `<div style="font-weight:600;font-size:13px;color:${CHART.navy900}">${esc(headline)}</div>` +
    (rows.length
      ? `<div style="margin-top:6px;padding-top:2px;border-top:1px solid ${CHART.navy100}">${body}</div>`
      : '') +
    `</div>`
  );
}

export { fmtUsd };
