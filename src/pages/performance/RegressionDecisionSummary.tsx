import { type RegressionRow } from '@/api/performance';
import { Badge } from '@/components/ds';

interface Props {
  multi?: RegressionRow;
  single?: RegressionRow;
}

interface DecisionRow {
  output: string;
  want: string;
  value: string;
  tone: string;
  label: string;
}

export function RegressionDecisionSummary({ multi, single }: Props) {
  const ref = multi ?? single;
  if (!ref) return null;

  const rows: DecisionRow[] = [];

  // Alpha
  const alphaVal = ref.alpha;
  const alphaP = ref.alpha_pvalue;
  rows.push({
    output: 'Alpha',
    want: 'Positive, p < 0.05',
    value: `${alphaVal >= 0 ? '+' : ''}${alphaVal.toFixed(2)}% · p=${alphaP.toFixed(2)}`,
    tone: alphaVal > 0 && alphaP < 0.05 ? 'pos' : alphaVal > 0 ? 'warn' : 'neg',
    label: alphaVal > 0 && alphaP < 0.05 ? 'Pass' : alphaVal > 0 ? 'Positive but not significant' : 'Negative',
  });

  // Market Beta
  const beta = ref.beta_mkt;
  rows.push({
    output: 'Market Beta',
    want: 'Near 1.0 unless intentionally tilted',
    value: beta.toFixed(3),
    tone: beta >= 0.7 && beta <= 1.3 ? 'pos' : 'warn',
    label: beta >= 0.7 && beta <= 1.3 ? 'In typical range' : 'Outside typical range',
  });

  // SMB Beta
  if (multi && multi.beta_smb != null && multi.beta_smb_pvalue != null) {
    rows.push({
      output: 'SMB Beta',
      want: 'Consistent with stated strategy',
      value: multi.beta_smb.toFixed(3),
      tone: 'neutral',
      label: multi.beta_smb_pvalue < 0.05 ? 'Significant size tilt' : 'Size-neutral · not significant',
    });
  }

  // HML Beta
  if (multi && multi.beta_hml != null && multi.beta_hml_pvalue != null) {
    rows.push({
      output: 'HML Beta',
      want: 'Consistent with stated strategy',
      value: `${multi.beta_hml >= 0 ? '+' : ''}${multi.beta_hml.toFixed(3)}`,
      tone: 'neutral',
      label: multi.beta_hml_pvalue < 0.05 ? 'Significant value/growth tilt' : 'No meaningful tilt',
    });
  }

  // R²
  const r2 = ref.r_squared;
  rows.push({
    output: 'R²',
    want: '> 0.75 for equity portfolios',
    value: `${(r2 * 100).toFixed(1)}%`,
    tone: r2 >= 0.75 ? 'pos' : r2 >= 0.70 ? 'warn' : 'neg',
    label: r2 >= 0.75 ? 'Pass' : 'Below threshold',
  });

  // p-values summary
  let sigCount = 0;
  let totalCoeffs = 2;
  if (ref.beta_mkt_pvalue < 0.05) sigCount++;
  if (ref.alpha_pvalue < 0.05) sigCount++;
  if (multi) {
    if (multi.beta_smb_pvalue != null) {
      totalCoeffs++;
      if (multi.beta_smb_pvalue < 0.05) sigCount++;
    }
    if (multi.beta_hml_pvalue != null) {
      totalCoeffs++;
      if (multi.beta_hml_pvalue < 0.05) sigCount++;
    }
  }
  rows.push({
    output: 'p-values',
    want: '< 0.05 ideally · flag > 0.10',
    value: `${sigCount} of ${totalCoeffs} sig.`,
    tone: sigCount === totalCoeffs ? 'pos' : sigCount > 0 ? 'warn' : 'neg',
    label: sigCount === totalCoeffs ? 'All significant' : sigCount > 0 ? 'Partial significance' : 'None significant',
  });

  // Standard errors
  const betaSE = ref.beta_mkt_se;
  const seOk = betaSE < 0.5 * Math.abs(ref.beta_mkt);
  rows.push({
    output: 'Standard errors',
    want: 'Small relative to coefficient',
    value: seOk ? 'OK' : 'High',
    tone: seOk ? 'pos' : 'warn',
    label: seOk ? 'All within 0.5× of estimate for sig. terms' : 'Some SE are large relative to estimates',
  });

  return (
    <div className="rounded-lg border border-navy-100 bg-white shadow-sm">
      <div className="border-b border-navy-100 px-5 py-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">Quick Decision Summary</div>
        <h3 className="mt-0.5 text-[15px] font-bold text-navy-800">How this regression measures up</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
            <th className="px-5 py-2 text-left font-bold w-[24%]">Output</th>
            <th className="px-3 py-2 text-left font-bold w-[34%]">What you want to see</th>
            <th className="px-3 py-2 text-right font-bold w-[16%]">This run</th>
            <th className="px-5 py-2 text-right font-bold w-[26%]">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.output} className="border-b border-gray-100 last:border-b-0">
              <td className="px-5 py-2.5 font-semibold text-navy-800">{row.output}</td>
              <td className="px-3 py-2.5 text-gray-600">{row.want}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-navy-800">{row.value}</td>
              <td className="px-5 py-2.5 text-right">
                <Badge tone={row.tone as any}>{row.label}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
