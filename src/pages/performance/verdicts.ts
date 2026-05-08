import { type BadgeTone } from '@/components/ds';

export interface Verdict {
  tone: BadgeTone;
  text: string;
}

export function alphaVerdict(alpha: number, p: number): Verdict {
  if (alpha > 0 && p < 0.05) return { tone: 'pos', text: 'Positive · statistically significant' };
  if (alpha > 0 && p < 0.10) return { tone: 'warn', text: 'Positive but only marginally significant' };
  if (alpha > 0) return { tone: 'neutral', text: 'Positive but not statistically significant' };
  if (alpha < 0 && p < 0.05) return { tone: 'neg', text: 'Negative · statistically significant' };
  return { tone: 'neutral', text: 'Negative but not statistically significant' };
}

export function betaVerdict(beta: number): Verdict {
  const inRange = beta >= 0.7 && beta <= 1.3;
  return {
    tone: inRange ? 'navy' : 'warn',
    text: beta < 1 ? 'Defensive — moves less than market' : 'Aggressive — moves more than market',
  };
}

export function r2Verdict(r2: number): Verdict {
  if (r2 >= 0.75) return { tone: 'pos', text: 'Three factors explain returns well' };
  if (r2 >= 0.70) return { tone: 'warn', text: 'Marginal — consider adding momentum' };
  return { tone: 'neg', text: "Three factors don't explain returns well" };
}
