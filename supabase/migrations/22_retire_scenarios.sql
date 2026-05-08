-- =============================================================================
-- 22_retire_scenarios.sql
-- Retirement Scenarios — add a scenario layer to tf_retire_inputs.
--
-- Each household can have multiple named scenarios (e.g. "Main", "Bad Returns",
-- "High Expenses"). Each scenario carries its own set of retirement inputs
-- (return rate, contributions, spend, etc.) while sharing a single starting
-- balance. The existing rows become the household's default "Main Scenario".
--
-- Changes:
--   1. Create tf_retire_scenarios table.
--   2. Add scenario_id column to tf_retire_inputs.
--   3. Migrate existing rows: create a default scenario per household, link
--      non-shared keys to it.
--   4. Update constraints.
--
-- Safe to re-run: uses IF NOT EXISTS / conditional DML.
-- =============================================================================

-- 1. Scenarios table ---------------------------------------------------------

create table if not exists tf_retire_scenarios (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references tf_households(id) on delete cascade,
  name          text not null default 'Main Scenario',
  is_default    boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tf_retire_scenarios_household
  on tf_retire_scenarios(household_id);

-- Only one default scenario per household.
create unique index if not exists idx_retire_scenarios_household_default
  on tf_retire_scenarios (household_id) where is_default = true;

-- 2. Add scenario_id to tf_retire_inputs ------------------------------------

alter table tf_retire_inputs
  add column if not exists scenario_id uuid references tf_retire_scenarios(id) on delete cascade;

-- 3. Migrate existing data ---------------------------------------------------

-- Keys that are shared across scenarios (starting balance). These stay
-- scenario_id = NULL.
-- All other keys get linked to the household's default scenario.

-- 3a. Create a default scenario for every household that has retire inputs
--     but doesn't yet have a scenario.
insert into tf_retire_scenarios (household_id, name, is_default, sort_order)
select distinct ri.household_id, 'Main Scenario', true, 0
from tf_retire_inputs ri
where not exists (
  select 1 from tf_retire_scenarios s
  where s.household_id = ri.household_id
);

-- 3b. Link non-shared-key rows to the default scenario.
update tf_retire_inputs ri
set scenario_id = s.id
from tf_retire_scenarios s
where s.household_id = ri.household_id
  and s.is_default = true
  and ri.scenario_id is null
  and ri.key not in (
    'starting_balance',
    'retire_start_bs_item_ids',
    'retire_start_extra'
  );

-- 4. Update constraints ------------------------------------------------------

-- Drop the old unique constraint (household_id, key).
alter table tf_retire_inputs
  drop constraint if exists tf_retire_inputs_household_id_key_key;

-- Scenario-scoped keys: unique per (scenario_id, key) when scenario_id is set.
create unique index if not exists idx_retire_inputs_scenario_key
  on tf_retire_inputs (scenario_id, key) where scenario_id is not null;

-- Shared keys: unique per (household_id, key) when scenario_id is null.
create unique index if not exists idx_retire_inputs_shared_key
  on tf_retire_inputs (household_id, key) where scenario_id is null;

-- Index for fast lookups by scenario.
create index if not exists idx_retire_inputs_scenario
  on tf_retire_inputs(scenario_id);

-- 5. RLS for the new table ---------------------------------------------------

alter table tf_retire_scenarios enable row level security;

create policy "Household members can read scenarios"
  on tf_retire_scenarios for select
  using (
    household_id in (
      select household_id from tf_household_members
      where user_id = auth.uid()
    )
  );

create policy "Household members can insert scenarios"
  on tf_retire_scenarios for insert
  with check (
    household_id in (
      select household_id from tf_household_members
      where user_id = auth.uid()
    )
  );

create policy "Household members can update scenarios"
  on tf_retire_scenarios for update
  using (
    household_id in (
      select household_id from tf_household_members
      where user_id = auth.uid()
    )
  );

create policy "Household members can delete scenarios"
  on tf_retire_scenarios for delete
  using (
    household_id in (
      select household_id from tf_household_members
      where user_id = auth.uid()
    )
  );

comment on table tf_retire_scenarios is
  'Named retirement scenarios per household. Each scenario carries its own set of retirement assumptions (return rate, contributions, spend, etc.) while sharing a single starting balance. The default scenario (is_default=true) represents the main/most-likely case. Users create additional scenarios to stress-test different assumptions.';

-- =============================================================================
-- End migration 22
-- =============================================================================
