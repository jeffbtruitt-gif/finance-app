-- =============================================================================
-- 10_phase7_long_term.sql
-- Phase 7 — Long-term Planning (Retire + College)
--
-- Both tables (tf_retire_inputs and tf_college_kids) were created in
-- 00_schema.sql and got RLS in 01_rls.sql. This migration:
--
--   1. Adds two columns to tf_college_kids (annual_cost, cost_inflation) so
--      each kid's projected per-year cost can be entered as a base-year
--      number and inflated forward — matches how the spreadsheet's "College"
--      tab does cost projection (year-cost × (1+inflation)^years_out).
--   2. Backfills sensible defaults for the new columns so existing rows
--      (none yet — table is empty in the household) keep working.
--   3. Adds an index on (household_id) for tf_college_kids so the page can
--      load every kid for a household in one round trip.
--   4. Documents both tables with comments so future migrations and the
--      Supabase UI explain the model.
--
-- The retire_inputs table stays exactly as-is — it's already the right shape
-- for the pinned-key model the Retire page uses (see PINNED_RETIRE_KEYS in
-- src/api/retire.ts). The page reads ALL rows for a household at once and
-- pivots client-side, so no extra index is needed beyond the (household_id,
-- key) unique already in place.
--
-- Safe to re-run: every change uses `add column if not exists`, `create
-- index if not exists`, and `comment on` (which is idempotent by definition).
-- =============================================================================

-- 1. Extend tf_college_kids ----------------------------------------------------

alter table tf_college_kids
  add column if not exists annual_cost numeric(12,2);

alter table tf_college_kids
  add column if not exists cost_inflation numeric(6,4);

-- Backfill defaults for any rows that exist before this migration runs. The
-- table is empty in the live household so the update is a no-op there, but
-- this keeps the migration idempotent for environments where it's not.
update tf_college_kids
  set annual_cost = coalesce(annual_cost, 30000),
      cost_inflation = coalesce(cost_inflation, 0.05);

comment on column tf_college_kids.annual_cost is
  'Projected first-year cost in today''s dollars. Inflated forward by cost_inflation each year of attendance. Spreadsheet equivalent: the College!AB:AC year-cost lookup the spreadsheet uses, but reduced to a single base number per kid.';
comment on column tf_college_kids.cost_inflation is
  'Annual cost inflation rate (decimal, e.g. 0.05 = 5%/year). Defaults to 5%/yr per Schwab/MEFA college-cost projector typical assumption. Used as: cost_year_n = annual_cost * (1 + cost_inflation)^(year_n - start_year).';

-- 2. Index for the per-household kid fetch -------------------------------------

create index if not exists idx_tf_college_kids_household
  on tf_college_kids(household_id);

-- 3. Table-level comments ------------------------------------------------------

comment on table tf_retire_inputs is
  'Free key/value pairs that drive the Retire page projection. Phase 7 pins a known set (jeff_yearly_contrib, brit_yearly_contrib, return_rate, starting_balance, jeff_ss, brit_ss, jeff_retire_age, brit_retire_age, retire_spend, retire_tax_rate, plus optional birth_year fields) but the schema is open to custom keys for future model refinements. Values are stored as text and parsed at the page; lets the same column hold rates (0.078), ages (60), and dollar amounts (180000).';

comment on table tf_college_kids is
  'One row per dependent kid the household is funding for college. The Phase 7 College page projects each kid year-by-year from current_balance forward through duration_years (default 4) of attendance starting at start_year (or birth_year + 18 if start_year is null), applying monthly_contrib × 12 per year and return_rate compound interest, then deducting the inflated annual cost during attendance years. The "on track / X behind" indicator compares ending balance at graduation against zero (we want to land at zero, not over-saved).';

-- =============================================================================
-- End migration 10
-- =============================================================================
