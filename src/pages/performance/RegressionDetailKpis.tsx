import { type ReactNode } from 'react';
import { type RegressionRow } from '@/api/performance';
import { Badge } from '@/components/ds';
import { alphaVerdict, betaVerdict, r2Verdict } from './verdicts';

interface Props {
  multi?: RegressionRow;
  single?: RegressionRow;
}

function KpiTile({
  label,
  value,
  valueClass = 'text-navy-900',
  sub,
  verdict,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub: ReactNode;
  verdict: { tone: string; text: string };
}) {
  return (
    <div className="flex flex-1 flex-col rounded-lg border border-navy-100 bg-white p-5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">{label}</div>
      <div className={`mt-2 text-[34px] font-extrabold leading-none tabular-nums tracking-tight ${valueClass}`}>
        {value}
      </div>
      <div className="mt-1.5 text-xs text-gray-500">{sub}</div>
      <div className="mt-3 border-t border-gray-100 pt-3">
        <Badge tone={verdict.tone as any}>{verdict.text}</Badge>
      </div>
    </div>
  );
}

export function RegressionDetailKpis({ multi, single }: Props) {
  const ref = multi ?? single;
  if (!ref) return null;

  const alpha = ref.alpha;
  const alphaP = ref.alpha_pvalue;
  const betaMkt = ref.beta_mkt;
  const rSquared = ref.r_squared;
  const adjR2 = ref.adj_r_squared;

  const aVerdict = alphaVerdict(alpha, alphaP);
  const bVerdict = betaVerdict(betaMkt);
  const rVerdict = r2Verdict(rSquared);

  const modelLabel = multi ? 'FF3 model' : 'CAPM model';

  return (
    <div className="flex gap-4">
      <KpiTile
        label="Alpha (Annualized)"
        value={`${alpha >= 0 ? '+' : ''}${alpha.toFixed(2)}%`}
        valueClass={alpha > 0 ? 'text-pos' : alpha < 0 ? 'text-neg' : 'text-navy-900'}
        sub={
          <>
            {modelLabel} · p-value <span className="font-semibold tabular-nums">{alphaP.toFixed(2)}</span>
          </>
        }
        verdict={aVerdict}
      />
      <KpiTile
        label="Market Beta"
        value={betaMkt.toFixed(3)}
        sub={`${modelLabel} · 1.00 = moves with market`}
        verdict={bVerdict}
      />
      <KpiTile
        label="R²"
        value={`${(rSquared * 100).toFixed(1)}%`}
        sub={
          <>
            Adj R² <span className="font-semibold tabular-nums">{(adjR2 * 100).toFixed(1)}%</span> · {multi ? '3 factors' : '1 factor'}
          </>
        }
        verdict={rVerdict}
      />
    </div>
  );
}
