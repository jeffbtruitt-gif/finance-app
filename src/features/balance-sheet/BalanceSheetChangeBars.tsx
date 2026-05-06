import { fmtPct, fmtUsd } from '@/lib/money';
import type { AccountChangeRow, EquityGroupChangeRow } from './change';

const POS = '#1e7e5a';
const NEG = '#c0392b';
const NEU = '#94a3b8';

const TRACK_W = 220;
const MID = TRACK_W / 2;
const HALF = MID - 4;

function barFill(kind: 'asset' | 'liability' | 'equity', delta: number): string {
  if (delta === 0) return NEU;
  if (kind === 'asset') return delta > 0 ? POS : NEG;
  if (kind === 'liability') return delta > 0 ? NEG : POS;
  return delta > 0 ? POS : NEG;
}

function HorizonBars(props: {
  title: string;
  caption?: string;
  maxAbs: number;
  rows: { key: string; label: string; sub?: string; delta: number | null; pct: number | null; kind: 'asset' | 'liability' | 'equity' }[];
}) {
  const { title, caption, maxAbs, rows } = props;
  const scale = maxAbs > 0 ? HALF / maxAbs : 0;

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-navy-700">{title}</h3>
        {caption ? <p className="mt-0.5 text-xs text-gray-500">{caption}</p> : null}
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const d = r.delta;
          const hasBar = d != null && scale > 0;
          let x = MID;
          let w = 0;
          if (hasBar && d !== 0) {
            const len = Math.min(HALF, Math.abs(d) * scale);
            if (d > 0) {
              x = MID;
              w = len;
            } else {
              x = MID - len;
              w = len;
            }
          }

          return (
            <div key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="min-w-0 flex-[1_1_140px]">
                <div className="truncate text-sm font-medium text-navy-900">{r.label}</div>
                {r.sub ? <div className="truncate text-xs text-gray-500">{r.sub}</div> : null}
              </div>
              <svg
                width={TRACK_W}
                height={22}
                className="shrink-0 overflow-visible"
                aria-hidden
              >
                <line x1={MID} y1={4} x2={MID} y2={18} stroke="#cbd5e1" strokeWidth={1} />
                {hasBar && d !== 0 && (
                  <rect
                    x={x}
                    y={6}
                    width={Math.max(w, 1)}
                    height={10}
                    rx={2}
                    fill={barFill(r.kind, d)}
                  />
                )}
                {hasBar && d === 0 && (
                  <circle cx={MID} cy={11} r={2} fill={NEU} />
                )}
              </svg>
              <div className="flex min-w-[120px] shrink-0 flex-col items-end tabular-nums sm:flex-row sm:items-baseline sm:gap-2">
                <span className={`text-sm font-semibold ${d == null ? 'text-gray-400' : 'text-navy-900'}`}>
                  {d == null ? '—' : fmtUsd(d)}
                </span>
                <span className="text-xs text-gray-600">{fmtPct(r.pct, { decimals: 1 })}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function maxAbsAccount(rows: AccountChangeRow[]): number {
  let m = 0;
  for (const r of rows) {
    if (r.delta != null) m = Math.max(m, Math.abs(r.delta));
  }
  return m;
}

function maxAbsEquity(rows: EquityGroupChangeRow[]): number {
  let m = 0;
  for (const r of rows) {
    m = Math.max(m, Math.abs(r.delta));
  }
  return m;
}

export function BalanceSheetChangeBars(props: {
  assets: AccountChangeRow[];
  liabilities: AccountChangeRow[];
  equity: EquityGroupChangeRow[];
}) {
  const { assets, liabilities, equity } = props;

  const assetRows = assets.map((r) => ({
    key: r.id,
    label: r.name,
    sub: r.groupLabel,
    delta: r.delta,
    pct: r.pct,
    kind: 'asset' as const,
  }));

  const liabilityRows = liabilities.map((r) => ({
    key: r.id,
    label: r.name,
    sub: r.groupLabel,
    delta: r.delta,
    pct: r.pct,
    kind: 'liability' as const,
  }));

  const equityRows = equity.map((r) => ({
    key: r.groupLabel,
    label: r.groupLabel,
    sub: undefined as string | undefined,
    delta: r.delta,
    pct: r.pct,
    kind: 'equity' as const,
  }));

  const mA = maxAbsAccount(assets);
  const mL = maxAbsAccount(liabilities);
  const mE = maxAbsEquity(equity);
  const globalMax = Math.max(mA, mL, mE, 1);

  return (
    <div className="space-y-8">
      <p className="text-xs text-gray-500">
        Bars extend right for increases and left for decreases (scale matches the largest change in this view).
        Dollar change is effective balance at the report month minus the comparison month; % is relative to the
        comparison balance when it&apos;s non-zero.
      </p>
      <HorizonBars
        title="Assets"
        caption="Increase is shown in green; decrease in red."
        maxAbs={globalMax}
        rows={assetRows}
      />
      <HorizonBars
        title="Liabilities"
        caption="Increase in what you owe is red; pay-down is green."
        maxAbs={globalMax}
        rows={liabilityRows}
      />
      <HorizonBars
        title="Equity by group"
        caption="Net (assets − liabilities) in each group vs the comparison month."
        maxAbs={globalMax}
        rows={equityRows}
      />
    </div>
  );
}
