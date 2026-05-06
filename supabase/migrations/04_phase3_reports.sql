-- =============================================================================
-- 04_phase3_reports.sql
-- Truitt Family Finance App — Phase 3 (Reports + Budget)
--
-- Adds:
--   1. tf_v_monthly_category_actuals  — view of total $ per (year, month,
--      scheme, category). Reports/averages query this directly so we don't
--      have to GROUP BY in every page.
--   2. Helper index on tf_budgets for the budget editor's full-year fetch.
--   3. Helper index on tf_transactions for fast monthly aggregation.
--
-- Run this in the Supabase SQL Editor after 03_phase2_imports_and_hints.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- View: monthly actuals per category, per scheme
-- -----------------------------------------------------------------------------
-- Sign convention: storage is `out = positive, in = negative` (matches Actuals).
-- Reports flip signs at the display layer; the view stays raw.
--
-- Uncategorized rows do NOT appear here — they have no row in
-- tf_transaction_categories. Reports surface "uncategorized" totals via a
-- separate query (see src/api/reports.ts → fetchUncategorizedMonthlyTotal).
-- -----------------------------------------------------------------------------
create or replace view tf_v_monthly_category_actuals as
select
  t.household_id,
  tc.scheme_id,
  tc.category_id,
  extract(year  from t.date)::int as year,
  extract(month from t.date)::int as month,
  sum(t.amount)::numeric(14,2)    as total,
  count(*)::int                   as txn_count
from tf_transactions t
join tf_transaction_categories tc
  on tc.transaction_id = t.id
group by
  t.household_id,
  tc.scheme_id,
  tc.category_id,
  extract(year  from t.date),
  extract(month from t.date);

comment on view tf_v_monthly_category_actuals is
  'Phase 3: monthly $ totals per (household, scheme, category). Sign = storage convention (out positive). Excludes uncategorized.';

-- Views inherit RLS from the underlying tables (tf_transactions and
-- tf_transaction_categories already have household-scoped policies from
-- migration 01), so no separate policy is needed.

-- -----------------------------------------------------------------------------
-- Index: budget editor loads a full year of (category × month) cells in one
-- query. The existing idx_tf_budgets_household_year covers household + year;
-- we add a covering index that also includes category_id so the planner can
-- do an index-only scan when the editor pivots cells into the grid.
-- -----------------------------------------------------------------------------
create index if not exists idx_tf_budgets_household_year_cat
  on tf_budgets(household_id, year, category_id, month);

-- -----------------------------------------------------------------------------
-- Index: monthly aggregation. We already have idx_tf_transactions_date but the
-- view groups by household_id + date; this composite helps the planner when
-- transaction volume grows past a few thousand rows.
-- -----------------------------------------------------------------------------
create index if not exists idx_tf_transactions_household_date
  on tf_transactions(household_id, date);
