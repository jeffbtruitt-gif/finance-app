interface Props {
  months: string[];
  returns: number[];
  portfolioName: string;
}

function chartScaler(values: number[], height: number, padTop: number, padBottom: number) {
  let yMin = Math.min(0, ...values);
  let yMax = Math.max(0, ...values);
  const span = Math.max(0.1, yMax - yMin);
  yMin -= span * 0.08;
  yMax += span * 0.08;
  const yRange = yMax - yMin;
  const yToPx = (y: number) => padTop + ((yMax - y) / yRange) * (height - padTop - padBottom);
  return { yMin, yMax, yToPx };
}

export function PortfolioReturnsBarLine({ months, returns, portfolioName }: Props) {
  const W = 760;
  const H = 240;
  const PL = 44;
  const PR = 16;
  const PT = 16;
  const PB = 36;
  const innerW = W - PL - PR;
  const sc = chartScaler(returns, H, PT, PB);
  const xToPx = (i: number) => PL + (i / (returns.length - 1)) * innerW;
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => sc.yMax - ((sc.yMax - sc.yMin) * i) / ticks);
  const barW = (innerW / returns.length) * 0.62;
  const zeroY = sc.yToPx(0);

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
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="font-sans">
          {tickVals.map((tv, i) => {
            const y = sc.yToPx(tv);
            return (
              <g key={i}>
                <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="#e8ecf5" strokeWidth="1" />
                <text x={PL - 6} y={y + 3} fontSize="10" textAnchor="end" fill="#717889" className="tabular-nums">
                  {tv.toFixed(1)}%
                </text>
              </g>
            );
          })}
          <line x1={PL} x2={W - PR} y1={zeroY} y2={zeroY} stroke="#9aa0af" strokeWidth="1" />
          {returns.map((v, i) => {
            const x = xToPx(i) - barW / 2;
            const y = v >= 0 ? sc.yToPx(v) : zeroY;
            const h = Math.abs(sc.yToPx(v) - zeroY);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={h}
                fill={v >= 0 ? '#1e7e5a' : '#c0392b'}
                opacity="0.18"
                rx="1.5"
              />
            );
          })}
          {months.map(
            (m, i) =>
              (i % 4 === 0 || i === months.length - 1) && (
                <text key={i} x={xToPx(i)} y={H - PB + 16} fontSize="8" textAnchor="middle" fill="#717889">
                  {m}
                </text>
              ),
          )}
        </svg>
      </div>
    </div>
  );
}
