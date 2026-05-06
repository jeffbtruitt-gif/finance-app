/**
 * Retire fan chart series — Phase 7.
 *
 * Mirrors the "Retire Graph" sheet (Retire Graph!B11:H45). The spreadsheet
 * runs a side-by-side "what if growth was 2% vs 4% vs 6% vs 8% vs 10% vs 12%"
 * projection from "today" to retire age, using a simpler accumulation-only
 * formula (no spending, no SS):
 *
 *   year-zero (current calendar year):
 *     beg_y = current_balance
 *     contrib_y = retire_contrib × (months_left_in_year / 12)
 *     end_y = beg_y × (1 + rate × months_left/12) + contrib_y
 *
 *   year n >= 1:
 *     beg_y = end_{y-1}
 *     contrib_y = retire_contrib (full year)
 *     end_y = (beg_y × (1 + rate)) + (contrib_y / 2 × rate) + contrib_y
 *
 *     The "contrib/2 × rate" half-year-on-half-the-contribution convention is
 *     the same averaging trick as the main projection module — assumes
 *     contributions land evenly through the year.
 *
 * No retirement spending is modeled here — this chart is a pre-retirement
 * accumulation comparison. The full sequence-of-returns projection lives
 * in projection.ts and uses ONE rate (the user's chosen return_rate).
 */

/** Default rate set the spreadsheet uses on the Retire Graph tab. */
export const DEFAULT_FAN_RATES = [0.02, 0.04, 0.06, 0.08, 0.1, 0.12] as const;

export interface FanChartInputs {
  /** Today's investable balance (Retire Graph!C4 + C5). */
  startingBalance: number;
  /** Annual retirement contributions (Retire Graph!C7). */
  yearlyContrib: number;
  /** Months remaining in the start year. Spreadsheet hardcodes 2 (December
   *  start typical), but we expose it. 12 = "start of year". */
  monthsLeftInFirstYear: number;
  /** First year of the chart (e.g. 2026). */
  startYear: number;
  /** Last year (inclusive) — typically the retire year. */
  endYear: number;
  /** Rate set to plot. Defaults to DEFAULT_FAN_RATES. */
  rates?: readonly number[];
}

export interface FanChartPoint {
  year: number;
  /** Map of rate → end-balance for that year. Keys match the rates array. */
  byRate: Map<number, number>;
}

export interface FanChartSeries {
  /** Rates that were projected, in the order requested. */
  rates: number[];
  /** One point per year from startYear to endYear inclusive. */
  points: FanChartPoint[];
}

export function buildFanChart(inputs: FanChartInputs): FanChartSeries {
  const rates = [...(inputs.rates ?? DEFAULT_FAN_RATES)];
  const monthsRatio = clamp(inputs.monthsLeftInFirstYear, 0, 12) / 12;
  const yearCount = Math.max(0, inputs.endYear - inputs.startYear + 1);

  // Run an independent accumulation per rate.
  const balances = new Map<number, number>();
  for (const r of rates) balances.set(r, inputs.startingBalance);

  const points: FanChartPoint[] = [];
  for (let i = 0; i < yearCount; i++) {
    const year = inputs.startYear + i;
    const byRate = new Map<number, number>();
    for (const r of rates) {
      const beg = balances.get(r) ?? inputs.startingBalance;
      let end: number;
      if (i === 0) {
        const contrib = inputs.yearlyContrib * monthsRatio;
        end = beg * (1 + r * monthsRatio) + contrib;
      } else {
        const contrib = inputs.yearlyContrib;
        end = beg * (1 + r) + (contrib / 2) * r + contrib;
      }
      byRate.set(r, end);
      balances.set(r, end);
    }
    points.push({ year, byRate });
  }

  return { rates, points };
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
