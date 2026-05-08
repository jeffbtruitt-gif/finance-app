import { type ReactNode, useState } from 'react';
import { type RegressionRow } from '@/api/performance';
import { Badge } from '@/components/ds';
import { alphaVerdict } from './verdicts';

export interface CoefficientRow {
  label: string;
  subtitle: string;
  estimate: number;
  se: number;
  p: number;
  explainer: ReactNode;
  verdict: { tone: string; text: string };
  benchmark: string;
}

function pColor(p: number): string {
  if (p < 0.05) return 'text-navy-700 font-semibold';
  if (p < 0.10) return 'text-warn font-semibold';
  return 'text-gray-400';
}

function pLabel(p: number): string {
  if (p < 0.001) return '<0.001';
  return p.toFixed(3);
}

export function buildSingleRows(row: RegressionRow): CoefficientRow[] {
  return [
    {
      label: 'Alpha (annualized)',
      subtitle: 'Return beyond what market beta explains',
      estimate: row.alpha,
      se: row.alpha_se,
      p: row.alpha_pvalue,
      explainer: (
        <>
          A positive alpha means the portfolio earned more than its market exposure alone would predict.
          Annualized, this run shows about{' '}
          <b className={row.alpha > 0 ? 'text-pos' : 'text-neg'}>
            {row.alpha >= 0 ? '+' : ''}{row.alpha.toFixed(2)}%
          </b>{' '}
          per year of unexplained return — but the p-value of{' '}
          <b>{row.alpha_pvalue.toFixed(2)}</b> means we{' '}
          {row.alpha_pvalue < 0.05 ? 'can confidently say this is real.' : "can't rule out that this is just random noise."}
        </>
      ),
      verdict: alphaVerdict(row.alpha, row.alpha_pvalue),
      benchmark: 'Good: > 0% · Great: > 2% with p < 0.05',
    },
    {
      label: 'Mkt-RF Beta',
      subtitle: 'Sensitivity to overall market moves',
      estimate: row.beta_mkt,
      se: row.beta_mkt_se,
      p: row.beta_mkt_pvalue,
      explainer: (
        <>
          A market beta of <b>{row.beta_mkt.toFixed(2)}</b> means when the market moves 1%, this portfolio
          moves about {row.beta_mkt.toFixed(2)}% in the same direction
          {row.beta_mkt < 1 ? ' — somewhat defensive' : ' — more aggressive than the market'}.
          {row.beta_mkt_pvalue < 0.05 && ' The p-value below 0.05 confirms this exposure is real, not random.'}
        </>
      ),
      verdict: {
        tone: row.beta_mkt >= 0.7 && row.beta_mkt <= 1.3 ? 'navy' : 'warn',
        text: row.beta_mkt < 1 ? 'Defensive tilt vs. market' : 'Aggressive tilt vs. market',
      },
      benchmark: 'Typical equity range: 0.7 – 1.3',
    },
  ];
}

export function buildMultiRows(row: RegressionRow): CoefficientRow[] {
  const rows: CoefficientRow[] = [
    {
      label: 'Alpha (annualized)',
      subtitle: 'Return beyond market + size + value',
      estimate: row.alpha,
      se: row.alpha_se,
      p: row.alpha_pvalue,
      explainer: (
        <>
          Once size and value tilts are accounted for, the unexplained excess return is{' '}
          <b className={row.alpha > 0 ? 'text-pos' : 'text-neg'}>
            {row.alpha >= 0 ? '+' : ''}{row.alpha.toFixed(2)}%
          </b>{' '}
          annualized. This is the cleanest measure of "did the manager add value?" — and at p ={' '}
          {row.alpha_pvalue.toFixed(2)} we{' '}
          {row.alpha_pvalue < 0.05
            ? 'can say this is statistically significant.'
            : "can't say it's distinguishable from luck."}
        </>
      ),
      verdict: alphaVerdict(row.alpha, row.alpha_pvalue),
      benchmark: 'Most important number on the page',
    },
    {
      label: 'Mkt-RF Beta',
      subtitle: 'Market sensitivity (β₁)',
      estimate: row.beta_mkt,
      se: row.beta_mkt_se,
      p: row.beta_mkt_pvalue,
      explainer: (
        <>
          After controlling for size and value tilts, market beta is <b>{row.beta_mkt.toFixed(2)}</b>
          {row.beta_mkt < 1 ? ' — slightly defensive' : ' — more aggressive'}.
          {row.beta_mkt_pvalue < 0.001 && ' p < 0.001 confirms this exposure is statistically rock-solid.'}
        </>
      ),
      verdict: {
        tone: 'navy',
        text: row.beta_mkt < 1 ? 'Mild defensive tilt' : 'Mild aggressive tilt',
      },
      benchmark: 'Typical equity range: 0.7 – 1.3',
    },
  ];

  if (row.beta_smb != null && row.beta_smb_se != null && row.beta_smb_pvalue != null) {
    rows.push({
      label: 'SMB Beta',
      subtitle: 'Size tilt: small-cap (+) vs large-cap (−) (β₂)',
      estimate: row.beta_smb,
      se: row.beta_smb_se,
      p: row.beta_smb_pvalue,
      explainer: (
        <>
          The SMB coefficient of <b>{row.beta_smb.toFixed(2)}</b>{' '}
          {Math.abs(row.beta_smb) < 0.1
            ? 'is essentially zero — the portfolio is size-neutral.'
            : row.beta_smb > 0
              ? 'indicates a slight small-cap tilt.'
              : 'indicates a slight large-cap tilt.'}
          {' '}With p = {row.beta_smb_pvalue.toFixed(2)},{' '}
          {row.beta_smb_pvalue < 0.05
            ? 'this tilt is statistically meaningful.'
            : "there's no statistically meaningful tilt to report."}
        </>
      ),
      verdict: {
        tone: row.beta_smb_pvalue < 0.05 ? 'navy' : 'neutral',
        text:
          Math.abs(row.beta_smb) < 0.1
            ? 'No meaningful size tilt'
            : row.beta_smb > 0
              ? 'Small-cap tilt'
              : 'Large-cap tilt',
      },
      benchmark: 'Typical range: −0.3 to +0.5',
    });
  }

  if (row.beta_hml != null && row.beta_hml_se != null && row.beta_hml_pvalue != null) {
    rows.push({
      label: 'HML Beta',
      subtitle: 'Value tilt: value (+) vs growth (−) (β₃)',
      estimate: row.beta_hml,
      se: row.beta_hml_se,
      p: row.beta_hml_pvalue,
      explainer: (
        <>
          HML of <b>{row.beta_hml.toFixed(2)}</b>{' '}
          {row.beta_hml > 0 ? 'hints at a slight value tilt' : 'hints at a slight growth tilt'}, but with p ={' '}
          {row.beta_hml_pvalue.toFixed(2)}{' '}
          {row.beta_hml_pvalue < 0.05
            ? 'this is statistically significant.'
            : "the data isn't strong enough to conclude the portfolio is meaningfully tilted toward value or growth."}
        </>
      ),
      verdict: {
        tone: row.beta_hml_pvalue < 0.05 ? 'navy' : 'neutral',
        text:
          row.beta_hml_pvalue < 0.05
            ? row.beta_hml > 0
              ? 'Value tilt — significant'
              : 'Growth tilt — significant'
            : 'Slight lean — not significant',
      },
      benchmark: 'Typical range: −0.4 to +0.6',
    });
  }

  return rows;
}

interface Props {
  title: { kicker: string; label: string };
  rows: CoefficientRow[];
  r2: number;
  adjR2: number;
  n: number;
}

export function RegressionCoefficientTable({ title, rows, r2, adjR2, n }: Props) {
  const [expanded, setExpanded] = useState<number>(0); // alpha open by default

  return (
    <div className="rounded-lg border border-navy-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-navy-100 px-5 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">{title.kicker}</div>
          <h3 className="mt-0.5 text-[15px] font-bold text-navy-800">{title.label}</h3>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>
            R² <span className="font-semibold text-navy-700">{(r2 * 100).toFixed(2)}%</span>
          </span>
          <span>
            Adj R² <span className="font-semibold text-navy-700">{(adjR2 * 100).toFixed(2)}%</span>
          </span>
          <span>
            n <span className="font-semibold text-navy-700">{n}</span>
          </span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
            <th className="px-5 py-2 text-left font-bold w-[40%]">Coefficient</th>
            <th className="px-3 py-2 text-right font-bold">Estimate</th>
            <th className="px-3 py-2 text-right font-bold">Std Err</th>
            <th className="px-3 py-2 text-right font-bold">t-Stat</th>
            <th className="px-3 py-2 text-right font-bold">p-Value</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const tStat = c.se > 0 ? c.estimate / c.se : 0;
            const sig = c.p < 0.05;
            const isOpen = expanded === i;
            const isAlpha = c.label.startsWith('Alpha');

            return (
              <TableRow
                key={c.label}
                row={c}
                tStat={tStat}
                sig={sig}
                isOpen={isOpen}
                isAlpha={isAlpha}
                onToggle={() => setExpanded(expanded === i ? -1 : i)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  row: c,
  tStat,
  sig,
  isOpen,
  isAlpha,
  onToggle,
}: {
  row: CoefficientRow;
  tStat: number;
  sig: boolean;
  isOpen: boolean;
  isAlpha: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-gray-100 cursor-pointer ${isOpen ? 'bg-navy-50/30' : 'hover:bg-gray-50/60'}`}
        onClick={onToggle}
      >
        <td className="px-5 py-2.5">
          <div className="font-medium text-navy-800">{c.label}</div>
          <div className="text-[11px] text-gray-500">{c.subtitle}</div>
        </td>
        <td
          className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
            isAlpha
              ? c.estimate > 0
                ? 'text-pos'
                : c.estimate < 0
                  ? 'text-neg'
                  : 'text-navy-800'
              : 'text-navy-800'
          }`}
        >
          {c.estimate >= 0 && isAlpha ? '+' : ''}
          {c.estimate.toFixed(4)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{c.se.toFixed(4)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{tStat.toFixed(3)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums ${pColor(c.p)}`}>
          {pLabel(c.p)}
          {sig && <span className="ml-1 text-pos">*</span>}
        </td>
        <td className="pr-3 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="text-gray-400 hover:text-navy-700"
            aria-label="Explain"
          >
            <svg
              className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-navy-50/40">
          <td colSpan={6} className="px-5 py-4">
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-7 text-[13px] leading-relaxed text-navy-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-navy-600 mb-1">
                  What this number means
                </div>
                {c.explainer}
              </div>
              <div className="col-span-5 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Verdict for this run
                </div>
                <Badge tone={c.verdict.tone as any}>{c.verdict.text}</Badge>
                <div className="text-[11px] text-gray-500">
                  <span className="font-semibold text-navy-700">95% CI:</span>{' '}
                  <span className="tabular-nums">
                    [{(c.estimate - 1.96 * c.se).toFixed(4)}, {(c.estimate + 1.96 * c.se).toFixed(4)}]
                  </span>
                </div>
                <div className="text-[11px] text-gray-500">{c.benchmark}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
