interface Props {
  months: string[];
  mktRf: number[];
  portRf: number[];
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

export function ExcessReturnsChart({ months, mktRf, portRf }: Props) {
  const W = 760;
  const H = 280;
  const PL = 44;
  const PR = 16;
  const PT = 16;
  const PB = 36;
  const innerW = W - PL - PR;
  const all = [...mktRf, ...portRf];
  const sc = chartScaler(all, H, PT, PB);
  const xToPx = (i: number) => PL + (i / (months.length - 1)) * innerW;
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${xToPx(i).toFixed(1)},${sc.yToPx(v).toFixed(1)}`).join(' ');

  const ticks = 5;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => sc.yMax - ((sc.yMax - sc.yMin) * i) / ticks);

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
          <line x1={PL} x2={W - PR} y1={sc.yToPx(0)} y2={sc.yToPx(0)} stroke="#9aa0af" strokeWidth="1" />
          {months.map(
            (m, i) =>
              (i % 4 === 0 || i === months.length - 1) && (
                <text key={i} x={xToPx(i)} y={H - PB + 16} fontSize="10" textAnchor="middle" fill="#717889">
                  {m}
                </text>
              ),
          )}
          <path d={path(mktRf)} fill="none" stroke="#a07830" strokeWidth="1.6" strokeDasharray="4 3" strokeLinecap="round" />
          <path d={path(portRf)} fill="none" stroke="#243460" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {portRf.map((v, i) => (
            <circle key={i} cx={xToPx(i)} cy={sc.yToPx(v)} r="2.4" fill="#243460" />
          ))}
        </svg>
      </div>
    </div>
  );
}
