/**
 * Retirement projection — Phase 7.
 *
 * Pure year-by-year balance projection mirroring the spreadsheet's "Retire"
 * tab logic (Retire!D15:O80).
 *
 * Per-year columns the spreadsheet tracks:
 *   #, Year, Jeff Age, Brit Age, Jeff Contrib, Brit Contrib,
 *   Jeff SS, Brit SS, Retire Spend, Taxes, Beg Balance,
 *   Interest/Gains, End Balance.
 *
 * Spreadsheet formulas (translated):
 *
 *   contrib_jeff_y  = age_jeff_y < jeff_retire_age ? jeff_yearly_contrib : 0
 *   contrib_brit_y  = age_brit_y < brit_retire_age ? brit_yearly_contrib : 0
 *
 *     The spreadsheet's row 16 (year 0) multiplies contrib by the
 *     remaining-months-in-year ratio (D13/12). We honor that for the
 *     first year if `monthsLeftInFirstYear` is provided; subsequent years
 *     get a full year of contributions.
 *
 *   ss_jeff_y       = (age_jeff_y > 72 AND age_jeff_y < 85.5) ? jeff_ss : 0
 *   ss_brit_y       = (age_brit_y > 72 AND age_brit_y < 88.8) ? brit_ss : 0
 *
 *     The spreadsheet bounds SS payment between two ages — SS doesn't pay
 *     to a corpse and stops contributing after a "long-life" cutoff. The
 *     numeric bounds are direct from the spreadsheet (E16/F16 logic).
 *
 *   spend_y         = age_jeff_y >= jeff_retire_age
 *                       ? retire_spend × (1.02 ^ (year_index))
 *                       : 0
 *
 *     Retire spend is in today's dollars; the spreadsheet inflates 2%/yr
 *     by raising 1.02 to the row index `B16` (which is 1, 2, 3, …). We
 *     apply the same compounding starting from year 0.
 *
 *   taxes_y         = spend_y / (1 - retire_tax_rate) - spend_y
 *
 *     Gross-up: net spend / (1 - tax) = pre-tax withdrawal; pre-tax minus
 *     net = taxes paid. Direct from the spreadsheet's K/(1-D12)-K formula.
 *
 *   gains_y (year 0):
 *     = ((contrib_jeff + contrib_brit) / 2) × (return_rate × monthsLeftRatio)
 *       + (begBal × (return_rate × monthsLeftRatio))
 *
 *   gains_y (year n>=1):
 *     = (begBal + max(0, contribs + ss - spend - taxes)/2) × return_rate
 *
 *     The "+ inflow/2" half-year convention: when you contribute mid-year,
 *     the spreadsheet credits half a year of growth on the average inflow.
 *     Same idea for outflows in retirement (the spend is averaged across
 *     the year). We replicate this exactly to match spreadsheet figures.
 *
 *   endBal_y        = begBal + gains + contribs + ss - spend - taxes
 *   begBal_{y+1}    = endBal_y
 *
 * Outputs we expose for the page:
 *   - rows: full year-by-year detail
 *   - summary:
 *       moneyAtRetireAge: end balance at end of calendar year before the *later*
 *       of the two retirement start years (max of Jeff/Brit retire calendar years).
 *       firstNegativeYear: first year endBal < 0 (null if never)
 *       moneyLastsYears: full calendar years from that later retirement year until
 *           first negative balance ("Forever" if never).
 *       jeffRunsOutAge / britRunsOutAge: each person's age in that first negative year
 *           ("Never" if balance never goes negative).
 */

export interface RetireInputs {
  jeff_yearly_contrib: number;
  brit_yearly_contrib: number;
  return_rate: number;
  starting_balance: number;
  jeff_ss: number;
  brit_ss: number;
  jeff_retire_age: number;
  brit_retire_age: number;
  jeff_birth_year: number;
  brit_birth_year: number;
  retire_spend: number;
  retire_tax_rate: number;
}

export interface RetireProjectionRow {
  /** 0-indexed row number — year 0 is the start year. */
  index: number;
  year: number;
  jeffAge: number;
  britAge: number;
  jeffContrib: number;
  britContrib: number;
  jeffSs: number;
  britSs: number;
  spend: number;
  taxes: number;
  begBalance: number;
  interestGains: number;
  endBalance: number;
}

export interface RetireSummary {
  /** Calendar year when the second spouse reaches their retire age (later of the two). */
  laterRetireStartYear: number;
  /** Balance at end of the calendar year before `laterRetireStartYear`. */
  moneyAtRetireAge: number | null;
  /** Index into rows[] of the first year where endBalance < 0; null if
   *  never goes negative within the projection horizon. */
  firstNegativeIndex: number | null;
  /** Full years from `laterRetireStartYear` until first negative end balance.
   *  "Forever" if never negative within the horizon. */
  moneyLasts: number | 'Forever';
  /** Jeff's age when balance first goes negative; "Never" if never. */
  jeffRunsOutAge: number | 'Never';
  /** Brit's age when balance first goes negative; "Never" if never. */
  britRunsOutAge: number | 'Never';
}

export interface RetireProjection {
  rows: RetireProjectionRow[];
  summary: RetireSummary;
}

export interface RetireProjectionOptions {
  /** Year to start the projection in (e.g. 2026). The spreadsheet uses
   *  YEAR(TODAY()). Caller passes the latest-actuals year for consistency
   *  with every other Phase 4+ page. */
  startYear: number;
  /** Number of years to project forward. Spreadsheet projects 65 rows from
   *  the start year. We default to 65 too — covers Jeff and Brit through
   *  age ~100 from a 2026 start. */
  horizonYears?: number;
  /** Months remaining in the first year. The spreadsheet uses
   *  =12-MONTH(TODAY()) which is the months-left-after-the-current-month
   *  count. If you start mid-year (latestActualMonth = 5), there are 7
   *  months left to contribute and earn growth, so monthsLeftInFirstYear=7.
   *  Default 12 = "start of year, full year ahead". */
  monthsLeftInFirstYear?: number;
  /** Inflation rate applied to retire_spend each year. The spreadsheet
   *  hardcodes 1.02 (2%). Exposed here so the user could override later. */
  spendInflation?: number;
}

/** Default horizon: 65 years forward. Matches the spreadsheet (Retire!R16:R80
 *  is rows 1..65). */
const DEFAULT_HORIZON = 65;

/** SS payment age band — Jeff. (age > 72 AND age < 85.5). Direct from
 *  spreadsheet I16 formula. We treat this as "starts paying the year you
 *  turn 73, stops the year you'd turn 86". */
const JEFF_SS_MIN_AGE = 72;
const JEFF_SS_MAX_AGE = 85.5;

/** SS payment age band — Brit. (age > 72 AND age < 88.8). Brit's expected
 *  longevity per the spreadsheet's lifespan assumption is higher. */
const BRIT_SS_MIN_AGE = 72;
const BRIT_SS_MAX_AGE = 88.8;

export function buildRetireProjection(
  inputs: RetireInputs,
  options: RetireProjectionOptions,
): RetireProjection {
  const horizon = options.horizonYears ?? DEFAULT_HORIZON;
  const monthsLeft = clamp(options.monthsLeftInFirstYear ?? 12, 0, 12);
  const spendInflation = options.spendInflation ?? 0.02;

  const rows: RetireProjectionRow[] = [];
  let begBalance = inputs.starting_balance;

  for (let i = 0; i < horizon; i++) {
    const year = options.startYear + i;
    const jeffAge = year - inputs.jeff_birth_year;
    const britAge = year - inputs.brit_birth_year;

    const monthsRatio = i === 0 ? monthsLeft / 12 : 1;

    const jeffContrib =
      jeffAge < inputs.jeff_retire_age
        ? inputs.jeff_yearly_contrib * monthsRatio
        : 0;
    const britContrib =
      britAge < inputs.brit_retire_age
        ? inputs.brit_yearly_contrib * monthsRatio
        : 0;

    const jeffSs =
      jeffAge > JEFF_SS_MIN_AGE && jeffAge < JEFF_SS_MAX_AGE
        ? inputs.jeff_ss
        : 0;
    const britSs =
      britAge > BRIT_SS_MIN_AGE && britAge < BRIT_SS_MAX_AGE
        ? inputs.brit_ss
        : 0;

    const spend =
      jeffAge >= inputs.jeff_retire_age
        ? inputs.retire_spend * Math.pow(1 + spendInflation, i)
        : 0;

    const taxes =
      inputs.retire_tax_rate >= 1 || inputs.retire_tax_rate < 0
        ? 0 // guard against pathological inputs (no division by zero or negatives)
        : spend / (1 - inputs.retire_tax_rate) - spend;

    let interestGains: number;
    if (i === 0) {
      // Year 0 (partial year): apply rate × monthsRatio to begBalance and to
      // half of contributions. Mirrors row 16 of the spreadsheet.
      const partialRate = inputs.return_rate * monthsRatio;
      interestGains =
        ((jeffContrib + britContrib) / 2) * partialRate +
        begBalance * partialRate;
    } else {
      // Years 1+: full year. Add half of net inflow to begBalance for the
      // average-balance growth, but only if net inflow is positive (in
      // retirement years, withdrawals exceed contribs and we just grow on
      // begBalance). Mirrors the spreadsheet's IF((G+H+I+J-K-L)<0, 0, /2).
      const netInflow = jeffContrib + britContrib + jeffSs + britSs - spend - taxes;
      const adjustedBase = begBalance + (netInflow > 0 ? netInflow / 2 : 0);
      interestGains = adjustedBase * inputs.return_rate;
    }

    const endBalance =
      begBalance + interestGains + jeffContrib + britContrib + jeffSs + britSs - spend - taxes;

    rows.push({
      index: i,
      year,
      jeffAge,
      britAge,
      jeffContrib,
      britContrib,
      jeffSs,
      britSs,
      spend,
      taxes,
      begBalance,
      interestGains,
      endBalance,
    });

    begBalance = endBalance;
  }

  return { rows, summary: buildSummary(rows, inputs) };
}

function laterRetireStartYear(inputs: RetireInputs): number {
  return Math.max(
    inputs.jeff_birth_year + inputs.jeff_retire_age,
    inputs.brit_birth_year + inputs.brit_retire_age,
  );
}

function buildSummary(
  rows: RetireProjectionRow[],
  inputs: RetireInputs,
): RetireSummary {
  const L = laterRetireStartYear(inputs);
  const targetYear = L - 1;
  const yearBeforeLaterRetire = rows.find((r) => r.year === targetYear);
  const moneyAtRetireAge = yearBeforeLaterRetire?.endBalance ?? null;

  const firstNegativeIndex = rows.findIndex((r) => r.endBalance < 0);
  const negIdx = firstNegativeIndex >= 0 ? firstNegativeIndex : null;

  let moneyLasts: number | 'Forever' = 'Forever';
  let jeffRunsOutAge: number | 'Never' = 'Never';
  let britRunsOutAge: number | 'Never' = 'Never';
  if (negIdx != null) {
    const negRow = rows[negIdx];
    jeffRunsOutAge = negRow.jeffAge;
    britRunsOutAge = negRow.britAge;
    moneyLasts = Math.max(0, negRow.year - L);
  }

  return {
    laterRetireStartYear: L,
    moneyAtRetireAge,
    firstNegativeIndex: negIdx,
    moneyLasts,
    jeffRunsOutAge,
    britRunsOutAge,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
