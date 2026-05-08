import { useMemo } from 'react';
import { type RegressionRow } from '@/api/performance';
import { MONTH_NAMES_SHORT } from '@/lib/period';
import { ExcessReturnsChart } from '@/components/ExcessReturnsChart';
import { PortfolioReturnsBarLine } from '@/components/PortfolioReturnsBarLine';
import { RegressionDetailHeader } from './RegressionDetailHeader';
import { RegressionDetailKpis } from './RegressionDetailKpis';
import { RegressionCoefficientTable, buildSingleRows, buildMultiRows } from './RegressionCoefficientTable';
import { RegressionDecisionSummary } from './RegressionDecisionSummary';

export interface MonthlyRate {
  month: string;
  portfolio: number;
  mktRf: number;
  rf: number;
}

interface Props {
  single?: RegressionRow;
  multi?: RegressionRow;
  accountName: string;
  monthlyRates: MonthlyRate[];
  onBack: () => void;
}

function formatMonthShort(iso: string): string {
  const [y, m] = iso.split('-');
  return `${MONTH_NAMES_SHORT[Number(m) - 1]} ${y.slice(2)}`;
}

export function RegressionDetailTab({ single, multi, accountName, monthlyRates, onBack }: Props) {
  const ref = multi ?? single;

  if (!ref) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-navy-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Select a regression on the Results tab to see its detail.</p>
          <button
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-gray-50"
          >
            ← Back to results
          </button>
        </div>
      </div>
    );
  }

  const months = useMemo(() => monthlyRates.map((r) => formatMonthShort(r.month)), [monthlyRates]);
  const portfolioReturns = useMemo(() => monthlyRates.map((r) => r.portfolio), [monthlyRates]);
  const mktRf = useMemo(() => monthlyRates.map((r) => r.mktRf), [monthlyRates]);
  const portRf = useMemo(
    () => monthlyRates.map((r) => +(r.portfolio - r.rf).toFixed(4)),
    [monthlyRates],
  );

  const alpha = ref.alpha;
  const betaMkt = ref.beta_mkt;
  const rSquared = ref.r_squared;
  const periodMonths = ref.period_months;
  const alphaP = ref.alpha_pvalue;

  const startMonth = useMemo(() => {
    const d = new Date(ref.period_end);
    d.setMonth(d.getMonth() - ref.period_months + 1);
    return `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }, [ref]);

  const endMonth = useMemo(() => {
    const [y, m] = ref.period_end.split('-');
    return `${MONTH_NAMES_SHORT[Number(m) - 1]} ${y}`;
  }, [ref]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb / back */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="text-navy-600 hover:underline">
            Results
          </button>
          <span className="text-gray-300">/</span>
          <span className="font-semibold text-navy-800">
            {accountName} · {periodMonths}mo
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-gray-50"
          >
            <span>←</span> Back to results
          </button>
          <button className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-gray-50 opacity-50 cursor-not-allowed">
            Export CSV
          </button>
        </div>
      </div>

      {/* Header card */}
      <RegressionDetailHeader accountName={accountName} row={ref} />

      {/* KPI strip */}
      <RegressionDetailKpis multi={multi} single={single} />

      {/* Plain-English summary */}
      <div className="rounded-lg border border-gold-300 bg-gold-100/40 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold-500 text-white text-xs font-bold">
            i
          </div>
          <div className="text-[14px] leading-relaxed text-navy-800">
            <span className="font-bold">Plain-English summary.</span>{' '}
            Over the {periodMonths}-month window {startMonth}–{endMonth},{' '}
            <b>{accountName}</b> moved with about <b>{betaMkt.toFixed(2)}×</b> of the market's swings
            {betaMkt < 1 ? ' — slightly defensive' : ' — slightly aggressive'}. After accounting for that
            market exposure{multi ? ' plus size and value tilts' : ''}, the portfolio{' '}
            {alpha >= 0 ? 'added' : 'lost'}{' '}
            <b className={alpha >= 0 ? 'text-pos' : 'text-neg'}>
              {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}% annualized alpha
            </b>.
            With a p-value of <b className="tabular-nums">{alphaP.toFixed(2)}</b>,{' '}
            {alphaP < 0.05
              ? 'that excess is statistically significant at conventional thresholds.'
              : "that excess can't yet be distinguished from luck at conventional thresholds."}{' '}
            The {multi ? 'three factors' : 'market factor'} explain{multi ? '' : 's'}{' '}
            <b>{(rSquared * 100).toFixed(1)}%</b> of the portfolio's monthly return variance
            {rSquared >= 0.75 ? ' — well above the 75% bar for active equity, so this model fits.' : '.'}
          </div>
        </div>
      </div>

      {/* Charts */}
      {monthlyRates.length > 1 && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-7">
            <ExcessReturnsChart months={months} mktRf={mktRf} portRf={portRf} />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <div className="flex h-full flex-col rounded-lg border border-navy-100 bg-white shadow-sm">
              <div className="border-b border-navy-100 px-5 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">How to read this</div>
                <h3 className="mt-0.5 text-[15px] font-bold text-navy-800">Excess return relationship</h3>
              </div>
              <div className="flex-1 px-5 py-4 text-[13px] leading-relaxed text-navy-800 space-y-3">
                <p>
                  Each line tracks the monthly return <i>above the risk-free rate</i>. The portfolio moves with the
                  market — when the gold dashed line rises, the navy line typically rises too — but at a{' '}
                  {betaMkt < 1 ? 'slightly smaller' : 'slightly larger'} amplitude (β = {betaMkt.toFixed(2)}).
                </p>
                <p>
                  Vertical gaps where the navy line sits above the gold dashed line are months where the portfolio
                  outperformed pure market exposure. Persistent positive gaps drive alpha; mixed or noisy gaps mean
                  alpha is hard to distinguish from luck.
                </p>
                <div className="rounded-md border border-navy-100 bg-navy-50/50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">In this run</div>
                  <div className="text-sm text-navy-800">
                    Portfolio tracks market closely with mild {betaMkt < 1 ? 'defensive lag' : 'aggressive lead'} —
                    consistent with β ={' '}
                    <b className="tabular-nums">{betaMkt.toFixed(2)}</b> and R² ={' '}
                    <b className="tabular-nums">{(rSquared * 100).toFixed(1)}%</b>.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12">
            <PortfolioReturnsBarLine months={months} returns={portfolioReturns} portfolioName={accountName} />
          </div>
        </div>
      )}

      {/* Coefficient tables, side-by-side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {single && (
          <RegressionCoefficientTable
            title={{ kicker: 'Single Factor', label: 'CAPM (Market only)' }}
            rows={buildSingleRows(single)}
            r2={single.r_squared}
            adjR2={single.adj_r_squared}
            n={single.n_observations}
          />
        )}
        {multi && (
          <RegressionCoefficientTable
            title={{ kicker: 'Multi Factor', label: 'Fama-French 3-Factor' }}
            rows={buildMultiRows(multi)}
            r2={multi.r_squared}
            adjR2={multi.adj_r_squared}
            n={multi.n_observations}
          />
        )}
      </div>

      {/* Decision summary */}
      <RegressionDecisionSummary multi={multi} single={single} />
    </div>
  );
}
