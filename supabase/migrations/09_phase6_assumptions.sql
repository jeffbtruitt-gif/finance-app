-- =============================================================================
-- 09_phase6_assumptions.sql
-- Phase 6 — Assumptions & Projections
--
-- All three tables (tf_income_plan, tf_savings_plan, tf_tax_assumptions) were
-- created in 00_schema.sql and got RLS in 01_rls.sql. This migration adapts
-- them for the Assumptions page UX:
--
--   1. Relax the month check so projections can use month=0 to mean "annual
--      total — not allocated to a specific month". Per-month actuals still
--      use 1..12. The Assumptions page renders projection rows as a single
--      annual cell and actual rows as a 12-month grid; this matches the
--      "Main Detail" tab in the spreadsheet exactly.
--   2. Helper indices for the per-(household, year) fetch pattern that the
--      Assumptions page uses on every load.
--   3. An optional `notes` column on income_plan / savings_plan rows for
--      one-off context like "Brit Bonus moved to March on reorg".
--   4. Table-level comments documenting the projection/actual model.
--
-- The "expenses projection" leg of the waterfall (a single number per year)
-- is intentionally NOT a column anywhere — it lives in tf_household_settings
-- under data->expenses_projection->{year}. We already have a JSONB blob, no
-- need for a one-cell-per-year table.
-- =============================================================================

-- 0. Relax the month check ------------------------------------------------
-- Projections store an annual total at month=0. Actuals continue to use 1..12.
-- The original check was inline on the table (month between 1 and 12). It
-- gets an auto-generated name; we drop by name pattern and recreate as a
-- named constraint we can manage explicitly going forward.

-- Income plan: drop & recreate the month check
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'tf_income_plan'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%month%between 1 and 12%';
  if c_name is not null then
    execute format('alter table tf_income_plan drop constraint %I', c_name);
  end if;
end$$;

alter table tf_income_plan
  drop constraint if exists tf_income_plan_month_check;
alter table tf_income_plan
  add constraint tf_income_plan_month_check
    check (month between 0 and 12);

-- Savings plan: same
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'tf_savings_plan'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%month%between 1 and 12%';
  if c_name is not null then
    execute format('alter table tf_savings_plan drop constraint %I', c_name);
  end if;
end$$;

alter table tf_savings_plan
  drop constraint if exists tf_savings_plan_month_check;
alter table tf_savings_plan
  add constraint tf_savings_plan_month_check
    check (month between 0 and 12);


-- 1. Indices ---------------------------------------------------------------
-- The Assumptions page fetches all rows for one (household, year) in one go
-- and pivots client-side. With ~10 sources × 12 months × 2 (proj+actual) per
-- household-year that's ~240 rows — small, but the index keeps it instant
-- even when several years of data accumulate.

create index if not exists idx_tf_income_plan_household_year
  on tf_income_plan(household_id, year);

create index if not exists idx_tf_savings_plan_household_year
  on tf_savings_plan(household_id, year);

create index if not exists idx_tf_tax_assumptions_household_year
  on tf_tax_assumptions(household_id, year);

-- 2. Optional notes column -------------------------------------------------
alter table tf_income_plan
  add column if not exists notes text;
comment on column tf_income_plan.notes is
  'Optional free-text annotation for a single (source, month) cell. E.g. "moved to March on reorg". Nullable.';

alter table tf_savings_plan
  add column if not exists notes text;
comment on column tf_savings_plan.notes is
  'Optional free-text annotation for a single (account, month) cell. Nullable.';

-- 3. Table-level comments documenting the projection/actual model -------
-- We use comment on table (not on constraint) to dodge fragility around the
-- auto-generated unique constraint name truncation on long table names.

comment on table tf_income_plan is
  'Per (household, year, source, month, is_actual). is_actual is part of the natural key so the projection (false) and the actual (true) for the same source/month coexist as separate rows. Phase 6 stores annual projections at month=0 (one row per source) and actuals as month=1..12 (twelve rows per source).';

comment on table tf_savings_plan is
  'Per (household, year, account, month, is_actual). Same pattern as tf_income_plan: annual projection at month=0, monthly actuals at 1..12.';

comment on table tf_tax_assumptions is
  'Per (household, year, key). Phase 6 pins a known set of keys (fed_rate, state_rate, ss_rate, medicare_rate, prev_total_income, prev_taxable_fed, prev_tax_paid_fed, prev_taxable_state, prev_tax_paid_state) but the schema is open to custom keys.';

-- =============================================================================
-- End migration 09
-- =============================================================================
