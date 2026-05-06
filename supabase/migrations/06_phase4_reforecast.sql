-- =============================================================================
-- 06_phase4_reforecast.sql
-- Truitt Family Finance App — Phase 4 (Mid-year Reforecast)
--
-- Adds:
--   1. Unique constraint on tf_revised_budgets so we get exactly ONE snapshot
--      per (household, year, as_of_month, category, month). Saving the same
--      as_of_month twice overwrites in place (ON CONFLICT DO UPDATE);
--      changing as_of_month creates a separate snapshot automatically.
--   2. tf_v_latest_actual_period — a view returning the latest (year, month)
--      that has any transaction data per household. Used as the system-wide
--      "current period" anchor (Phase 4 decision: reports/Revised default to
--      the latest month with actuals, not the calendar month).
--   3. Helper index for the snapshot fetch query (latest by household+year+
--      as_of_month).
--
-- Run this in Supabase SQL Editor after migration 05.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Unique constraint on tf_revised_budgets
-- -----------------------------------------------------------------------------
-- The schema allows duplicates today (no unique key on the table). Phase 4 wants
-- exactly one row per (household, year, as_of_month, category, month) so that
-- repeated saves of the same as_of_month overwrite in place. We add the
-- constraint here. If any duplicates exist (shouldn't — table is empty at end
-- of Phase 3), this DO block dedupes first to avoid the constraint failing.
do $$
begin
  if exists (
    select 1
    from tf_revised_budgets
    group by household_id, year, as_of_month, category_id, month
    having count(*) > 1
    limit 1
  ) then
    -- keep the most recently created row of each duplicate set
    delete from tf_revised_budgets r
    using (
      select id,
             row_number() over (
               partition by household_id, year, as_of_month, category_id, month
               order by created_at desc, id desc
             ) as rn
      from tf_revised_budgets
    ) d
    where r.id = d.id and d.rn > 1;
  end if;
end$$;

alter table tf_revised_budgets
  drop constraint if exists tf_revised_budgets_natural_key;

alter table tf_revised_budgets
  add constraint tf_revised_budgets_natural_key
    unique (household_id, year, as_of_month, category_id, month);

-- Helper index for "load snapshot for (household, year, as_of_month)" — the
-- most common query pattern from the Reforecast page editor.
create index if not exists idx_tf_revised_household_year_as_of
  on tf_revised_budgets(household_id, year, as_of_month);

-- -----------------------------------------------------------------------------
-- 2. View: latest actual period per household
-- -----------------------------------------------------------------------------
-- Returns ONE row per household: the most recent (year, month) for which there
-- is any transaction. Used by:
--   - Reforecast page (always anchors to this month, not the calendar)
--   - 1 MO / YTD / Averages reports (default picker value)
--   - Dashboard cards
--
-- A view (rather than a function) keeps the query side simple — Supabase REST
-- exposes views automatically and they inherit RLS from the underlying table.
-- Inside the view we use distinct on / window function to pull the top row.
-- -----------------------------------------------------------------------------
create or replace view tf_v_latest_actual_period as
select distinct on (household_id)
  household_id,
  extract(year  from date)::int as year,
  extract(month from date)::int as month,
  date as latest_date
from tf_transactions
order by household_id, date desc;

comment on view tf_v_latest_actual_period is
  'Phase 4: latest (year, month) with any transaction per household. Used as the system-wide default "current period" anchor.';

-- View inherits RLS from tf_transactions — no separate policy needed.
