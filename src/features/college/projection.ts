/**
 * College projection — Phase 7.
 *
 * Per-kid year-by-year balance projection. Mirrors the spreadsheet's
 * "College" sheet (College!B36:I58 / L36:S60).
 *
 * Spreadsheet formulas (translated):
 *
 *   start_y       = ending_{y-1}   (or current_balance for year 0)
 *   contrib_y     = monthly_contrib × 12   (or × months_left for year 0)
 *   interest_y    = (start_y - cost_y) × IR  +  (contrib_y / 2) × IR
 *
 *     Half-year-on-half-the-contribution convention. Same as retirement.
 *     Note the spreadsheet subtracts cost from the principal earning interest
 *     — money paid out for tuition doesn't earn for the rest of the year.
 *
 *   cost_y        = annual_cost × (1 + cost_inflation)^(y - start_year)
 *                   when start_year ≤ year < start_year + duration_years
 *                 = 0 otherwise
 *
 *     The spreadsheet uses a per-grade cost lookup; we simplify to a single
 *     base-year cost inflated forward (decision in api/college.ts and the
 *     migration 10 docs).
 *
 *   ending_y      = start_y + contrib_y + interest_y - cost_y
 *
 * The projection runs from the current year through the end of attendance
 * (start_year + duration_years - 1). After the last attendance year, the
 * balance is the leftover — positive = "saved more than needed", negative =
 * "shortfall".
 */

import {
  resolvedAnnualCost,
  resolvedCostInflation,
  resolvedStartYear,
  type CollegeKid,
} from '@/api/college';

export interface CollegeProjectionRow {
  year: number;
  /** Age at the START of the year (year - birth_year). */
  age: number;
  /** Whether the kid is in college this year. */
  inCollege: boolean;
  startBalance: number;
  contrib: number;
  interest: number;
  cost: number;
  endBalance: number;
}

export interface CollegeProjection {
  kid: CollegeKid;
  startYear: number;
  graduationYear: number;
  rows: CollegeProjectionRow[];
  /** Final balance after the last attendance year. Positive = surplus,
   *  negative = shortfall. */
  finalBalance: number;
  /** "On track" rule: finalBalance >= 0. */
  onTrack: boolean;
  /** Total tuition cost in nominal dollars across attendance years. */
  totalCost: number;
  /** Projected 529 balance at the start of the first college year (before
   *  that year’s contributions, growth, and tuition). Null when college
   *  already began before the projection start year (no forward-only estimate). */
  balanceBeforeCollege: number | null;
  /** Modeled tuition + expenses for the first year of college (year offset 0). */
  firstYearCollegeCost: number;
}

export interface CollegeProjectionOptions {
  /** Year to start the projection in. */
  currentYear: number;
  /** Months left in the current year (1..12). Defaults to 12. */
  monthsLeftInCurrentYear?: number;
}

/** Balance at the beginning of `targetYear`, using the same rules as the main
 *  projection (forward-only from `currentYear`). */
function balanceAtStartOfYear(
  kid: CollegeKid,
  options: CollegeProjectionOptions,
  ctx: {
    collegeStart: number;
    collegeEnd: number;
    annualCost: number;
    costInflation: number;
  },
  targetYear: number,
): number | null {
  if (targetYear < options.currentYear) return null;
  const monthsLeft = clamp(options.monthsLeftInCurrentYear ?? 12, 0, 12);
  let balance = kid.current_balance;
  for (let y = options.currentYear; y < targetYear; y++) {
    balance = simulateCollegeYear(
      kid,
      {
        year: y,
        currentYear: options.currentYear,
        monthsLeftFirstYear: monthsLeft,
        collegeStart: ctx.collegeStart,
        collegeEnd: ctx.collegeEnd,
        annualCost: ctx.annualCost,
        costInflation: ctx.costInflation,
      },
      balance,
    ).endBalance;
  }
  return balance;
}

function simulateCollegeYear(
  kid: CollegeKid,
  ctx: {
    year: number;
    currentYear: number;
    monthsLeftFirstYear: number;
    collegeStart: number;
    collegeEnd: number;
    annualCost: number;
    costInflation: number;
  },
  startBalance: number,
): {
  endBalance: number;
  contrib: number;
  interest: number;
  cost: number;
  inCollege: boolean;
} {
  const monthsRatio =
    ctx.year === ctx.currentYear ? ctx.monthsLeftFirstYear / 12 : 1;
  const contrib = kid.monthly_contrib * 12 * monthsRatio;

  const inCollege =
    ctx.year >= ctx.collegeStart && ctx.year <= ctx.collegeEnd;
  const cost = inCollege
    ? ctx.annualCost *
      Math.pow(1 + ctx.costInflation, ctx.year - ctx.collegeStart)
    : 0;

  const principal = Math.max(0, startBalance - cost);
  const interest =
    principal * kid.return_rate * monthsRatio +
    (contrib / 2) * kid.return_rate * monthsRatio;

  const endBalance = startBalance + contrib + interest - cost;
  return { endBalance, contrib, interest, cost, inCollege };
}

export function buildCollegeProjection(
  kid: CollegeKid,
  options: CollegeProjectionOptions,
): CollegeProjection {
  const monthsLeft = clamp(options.monthsLeftInCurrentYear ?? 12, 0, 12);

  const collegeStart = resolvedStartYear(kid);
  const collegeEnd = collegeStart + kid.duration_years - 1;
  // Project from current year through last attendance year.
  // If the kid is already past attendance, return one synthetic row for
  // current year showing the balance with no cost.
  const projEnd = Math.max(collegeEnd, options.currentYear);

  const rows: CollegeProjectionRow[] = [];
  let balance = kid.current_balance;
  const annualCost = resolvedAnnualCost(kid);
  const costInflation = resolvedCostInflation(kid);

  const stepCtx = {
    collegeStart,
    collegeEnd,
    annualCost,
    costInflation,
  };

  const simCtx = {
    currentYear: options.currentYear,
    monthsLeftFirstYear: monthsLeft,
    collegeStart,
    collegeEnd,
    annualCost,
    costInflation,
  };

  for (let year = options.currentYear; year <= projEnd; year++) {
    const age = year - kid.birth_year;
    const { endBalance, contrib, interest, cost, inCollege } =
      simulateCollegeYear(kid, { ...simCtx, year }, balance);

    rows.push({
      year,
      age,
      inCollege,
      startBalance: balance,
      contrib,
      interest,
      cost,
      endBalance,
    });

    balance = endBalance;
  }

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const finalBalance = balance;

  const balanceBeforeCollege =
    collegeStart < options.currentYear
      ? null
      : balanceAtStartOfYear(kid, options, stepCtx, collegeStart);

  const firstYearCollegeCost = annualCost;

  return {
    kid,
    startYear: collegeStart,
    graduationYear: collegeEnd,
    rows,
    finalBalance,
    onTrack: finalBalance >= 0,
    totalCost,
    balanceBeforeCollege,
    firstYearCollegeCost,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
