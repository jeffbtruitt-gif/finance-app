/**
 * Small SVG helpers shared by Budget / Reforecast / Budget matrix report pages.
 */

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
  const vals = values.map((v) => (v == null ? 0 : Number(v)));

  if (signed) {
    const maxAbs = Math.max(...vals.map(Math.abs), 1);
    const mid = h / 2;
    return (
      <svg width={w} height={h} className="block shrink-0">
        <line x1={0} y1={mid} x2={w} y2={mid} stroke={GRAY} strokeWidth={1} />
        {vals.map((v, i) => {
          const x = (i / Math.max(vals.length - 1, 1)) * w;
          const barH = (Math.abs(v) / maxAbs) * (h / 2 - 2);
          const y = v >= 0 ? mid - barH : mid;
          const fill = v > 0 ? NEG : v < 0 ? POS : '#c5cad4';
          return (
            <rect key={i} x={x - 2.5} y={y} width={5} height={Math.max(barH, 1)} fill={fill} rx={1} />
          );
        })}
      </svg>
    );
  }

  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const points = vals
    .map((v, i) => {
      const x = (i / Math.max(vals.length - 1, 1)) * w;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const areaPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg width={w} height={h} className="block shrink-0">
      <polygon points={areaPoints} fill={NAVY} opacity={0.12} />
      <polyline
        points={points}
        fill="none"
        stroke={NAVY}
        strokeWidth={bold ? 1.8 : 1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
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
