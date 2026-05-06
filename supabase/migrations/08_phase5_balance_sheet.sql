-- =============================================================================
-- 08_phase5_balance_sheet.sql
-- Phase 5 — Balance Sheet & Dashboard
--
-- Adds:
--   1. tf_balance_sheet_items.equity_group  (optional bucket for dashboard
--      "Equity" rollups: House / Car / Retirement / Investments / Savings /
--      Credit Union — same buckets as the Main 2 tab in the spreadsheet).
--   2. tf_household_settings — single-row-per-household JSONB blob for
--      free-text things that don't deserve their own table yet (Phase 5 only
--      uses it for the dashboard goals list, but it's the right home for any
--      future "preferences" stuff too).
--   3. RLS for the new table.
--   4. Helper indices on tf_balance_sheet_values for the per-item-monthly
--      query that powers the trend chart.
--
-- The "perpetuate-forward" effective-value lookup is intentionally NOT a
-- database view. The full set of balance-sheet values for one household is
-- small (a few hundred rows lifetime) and the dashboard needs an arbitrary
-- 24-month series anyway, so we fetch the raw rows once per page load and
-- compute effective values client-side. See src/features/balance-sheet/
-- effective.ts. This keeps PostgREST trivial and avoids a parameterised view.
-- =============================================================================

-- 1. equity_group on items -------------------------------------------------
alter table tf_balance_sheet_items
  add column if not exists equity_group text;

-- The set is open (free text) but in practice we'll only display rollups for
-- items whose equity_group falls in the dashboard's known set. Items with
-- null equity_group still contribute to the raw asset/liability totals; they
-- just don't show up in the equity breakdown.
comment on column tf_balance_sheet_items.equity_group is
  'Optional bucket for dashboard equity rollups (e.g. House / Retirement / Investments / Savings / Credit Union / Car). NULL is fine — item still counts toward asset/liability totals.';

-- 2. household_settings ----------------------------------------------------
create table if not exists tf_household_settings (
  household_id uuid primary key references tf_households(id) on delete cascade,
  -- Single JSONB blob. Today: { goals: [string, ...] }. Tomorrow: anything else
  -- that would otherwise need a tiny one-off table.
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz default now()
);

alter table tf_household_settings enable row level security;
drop policy if exists "tf members rw household_settings" on tf_household_settings;
create policy "tf members rw household_settings" on tf_household_settings
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- 3. Index covering "values for one item, ordered by month desc" ----------
-- Already created in 00_schema.sql as idx_tf_bs_values_item_month — re-stated
-- here defensively for households who set up before the index existed.
create index if not exists idx_tf_bs_values_item_month
  on tf_balance_sheet_values(item_id, as_of_month desc);

-- And a household-scoped index on items so the items list query is fast.
create index if not exists idx_tf_bs_items_household
  on tf_balance_sheet_items(household_id, sort_order);

-- =============================================================================
-- End migration 08
-- =============================================================================
