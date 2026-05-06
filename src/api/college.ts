/**
 * College API — Phase 7.
 *
 * Wraps tf_college_kids (one row per dependent kid being saved for).
 *
 * Schema (set in 00_schema.sql, extended in migration 10):
 *   - name, birth_year, current_balance, monthly_contrib, return_rate
 *   - start_year (null = derive as birth_year + 18)
 *   - duration_years (default 4)
 *   - annual_cost, cost_inflation (Phase 7 additions, see migration 10)
 *
 * Why these columns and not the spreadsheet's full grade/age lookup model:
 * the spreadsheet uses a per-grade cost lookup table that's two rows wide
 * (Grade → year-cost) and inflated forward. That's overkill for "I want to
 * see if my 529 stays positive through graduation". We simplify to a single
 * base-year cost per kid + an inflation rate. The page can show the cost
 * grow each year; user can override per-kid if needed.
 */

import { supabase } from './supabase';

export interface CollegeKid {
  id: string;
  name: string;
  birth_year: number;
  current_balance: number;
  monthly_contrib: number;
  /** Return rate as a decimal (0.06 = 6%/yr). */
  return_rate: number;
  /** Year college starts. Null = derive as birth_year + 18. */
  start_year: number | null;
  /** Length of attendance in years. Default 4 (undergrad). */
  duration_years: number;
  /** First-year cost in today's dollars. Null = unknown / use default. */
  annual_cost: number | null;
  /** Annual cost inflation as a decimal. Null = use default (5%). */
  cost_inflation: number | null;
}

export const DEFAULT_ANNUAL_COST = 30000;
export const DEFAULT_COST_INFLATION = 0.05;
export const DEFAULT_RETURN_RATE = 0.06;
export const DEFAULT_DURATION_YEARS = 4;
export const DEFAULT_MONTHLY_CONTRIB = 0;

export async function fetchCollegeKids(
  household_id: string,
): Promise<CollegeKid[]> {
  const { data, error } = await supabase
    .from('tf_college_kids')
    .select(
      'id, name, birth_year, current_balance, monthly_contrib, return_rate, start_year, duration_years, annual_cost, cost_inflation',
    )
    .eq('household_id', household_id)
    .order('birth_year', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    birth_year: r.birth_year,
    current_balance: Number(r.current_balance),
    monthly_contrib: Number(r.monthly_contrib),
    return_rate: Number(r.return_rate),
    start_year: r.start_year,
    duration_years: r.duration_years,
    annual_cost: r.annual_cost == null ? null : Number(r.annual_cost),
    cost_inflation: r.cost_inflation == null ? null : Number(r.cost_inflation),
  }));
}

export async function createCollegeKid(args: {
  household_id: string;
  name: string;
  birth_year: number;
}): Promise<CollegeKid> {
  const { data, error } = await supabase
    .from('tf_college_kids')
    .insert({
      household_id: args.household_id,
      name: args.name,
      birth_year: args.birth_year,
      current_balance: 0,
      monthly_contrib: DEFAULT_MONTHLY_CONTRIB,
      return_rate: DEFAULT_RETURN_RATE,
      duration_years: DEFAULT_DURATION_YEARS,
      annual_cost: DEFAULT_ANNUAL_COST,
      cost_inflation: DEFAULT_COST_INFLATION,
    })
    .select(
      'id, name, birth_year, current_balance, monthly_contrib, return_rate, start_year, duration_years, annual_cost, cost_inflation',
    )
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    birth_year: data.birth_year,
    current_balance: Number(data.current_balance),
    monthly_contrib: Number(data.monthly_contrib),
    return_rate: Number(data.return_rate),
    start_year: data.start_year,
    duration_years: data.duration_years,
    annual_cost: data.annual_cost == null ? null : Number(data.annual_cost),
    cost_inflation:
      data.cost_inflation == null ? null : Number(data.cost_inflation),
  };
}

export async function updateCollegeKid(args: {
  id: string;
  patch: Partial<{
    name: string;
    birth_year: number;
    current_balance: number;
    monthly_contrib: number;
    return_rate: number;
    start_year: number | null;
    duration_years: number;
    annual_cost: number | null;
    cost_inflation: number | null;
  }>;
}): Promise<void> {
  const { error } = await supabase
    .from('tf_college_kids')
    .update(args.patch)
    .eq('id', args.id);
  if (error) throw error;
}

export async function deleteCollegeKid(id: string): Promise<void> {
  const { error } = await supabase.from('tf_college_kids').delete().eq('id', id);
  if (error) throw error;
}

/** Resolve start_year, falling back to birth_year + 18. */
export function resolvedStartYear(kid: CollegeKid): number {
  return kid.start_year ?? kid.birth_year + 18;
}

/** Resolve annual_cost, falling back to DEFAULT_ANNUAL_COST. */
export function resolvedAnnualCost(kid: CollegeKid): number {
  return kid.annual_cost ?? DEFAULT_ANNUAL_COST;
}

/** Resolve cost_inflation, falling back to DEFAULT_COST_INFLATION. */
export function resolvedCostInflation(kid: CollegeKid): number {
  return kid.cost_inflation ?? DEFAULT_COST_INFLATION;
}
