-- =============================================================================
-- 01_rls.sql
-- Row Level Security — every tf_ table is locked down so users only see their
-- household's data. Run this after 00_schema.sql.
-- =============================================================================

-- Helper function: is the current user a member of this household?
-- SECURITY DEFINER + STABLE so it doesn't recurse through RLS on tf_household_members.
create or replace function tf_is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tf_household_members
    where household_id = target_household
      and user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- households + household_members
-- -----------------------------------------------------------------------------
alter table tf_households enable row level security;

drop policy if exists "tf members can read their households" on tf_households;
create policy "tf members can read their households" on tf_households
for select using (tf_is_household_member(id));

drop policy if exists "tf members can update their households" on tf_households;
create policy "tf members can update their households" on tf_households
for update using (tf_is_household_member(id));

alter table tf_household_members enable row level security;

drop policy if exists "tf users see their own memberships" on tf_household_members;
create policy "tf users see their own memberships" on tf_household_members
for select using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Per-table policies. Each tf_ table with a household_id gets the same shape.
-- -----------------------------------------------------------------------------

-- accounts
alter table tf_accounts enable row level security;
drop policy if exists "tf members rw accounts" on tf_accounts;
create policy "tf members rw accounts" on tf_accounts
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- category_schemes
alter table tf_category_schemes enable row level security;
drop policy if exists "tf members rw category_schemes" on tf_category_schemes;
create policy "tf members rw category_schemes" on tf_category_schemes
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- categories
alter table tf_categories enable row level security;
drop policy if exists "tf members rw categories" on tf_categories;
create policy "tf members rw categories" on tf_categories
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- trips
alter table tf_trips enable row level security;
drop policy if exists "tf members rw trips" on tf_trips;
create policy "tf members rw trips" on tf_trips
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- rules
alter table tf_rules enable row level security;
drop policy if exists "tf members rw rules" on tf_rules;
create policy "tf members rw rules" on tf_rules
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- transactions
alter table tf_transactions enable row level security;
drop policy if exists "tf members rw transactions" on tf_transactions;
create policy "tf members rw transactions" on tf_transactions
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- transaction_categories — household via parent transaction
alter table tf_transaction_categories enable row level security;
drop policy if exists "tf members rw transaction_categories" on tf_transaction_categories;
create policy "tf members rw transaction_categories" on tf_transaction_categories
for all
using (
  exists (
    select 1 from tf_transactions t
    where t.id = tf_transaction_categories.transaction_id
      and tf_is_household_member(t.household_id)
  )
)
with check (
  exists (
    select 1 from tf_transactions t
    where t.id = tf_transaction_categories.transaction_id
      and tf_is_household_member(t.household_id)
  )
);

-- budgets
alter table tf_budgets enable row level security;
drop policy if exists "tf members rw budgets" on tf_budgets;
create policy "tf members rw budgets" on tf_budgets
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- revised_budgets
alter table tf_revised_budgets enable row level security;
drop policy if exists "tf members rw revised_budgets" on tf_revised_budgets;
create policy "tf members rw revised_budgets" on tf_revised_budgets
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- balance_sheet_items
alter table tf_balance_sheet_items enable row level security;
drop policy if exists "tf members rw balance_sheet_items" on tf_balance_sheet_items;
create policy "tf members rw balance_sheet_items" on tf_balance_sheet_items
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- balance_sheet_values — household via parent item
alter table tf_balance_sheet_values enable row level security;
drop policy if exists "tf members rw balance_sheet_values" on tf_balance_sheet_values;
create policy "tf members rw balance_sheet_values" on tf_balance_sheet_values
for all
using (
  exists (
    select 1 from tf_balance_sheet_items i
    where i.id = tf_balance_sheet_values.item_id
      and tf_is_household_member(i.household_id)
  )
)
with check (
  exists (
    select 1 from tf_balance_sheet_items i
    where i.id = tf_balance_sheet_values.item_id
      and tf_is_household_member(i.household_id)
  )
);

-- income_plan
alter table tf_income_plan enable row level security;
drop policy if exists "tf members rw income_plan" on tf_income_plan;
create policy "tf members rw income_plan" on tf_income_plan
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- savings_plan
alter table tf_savings_plan enable row level security;
drop policy if exists "tf members rw savings_plan" on tf_savings_plan;
create policy "tf members rw savings_plan" on tf_savings_plan
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- tax_assumptions
alter table tf_tax_assumptions enable row level security;
drop policy if exists "tf members rw tax_assumptions" on tf_tax_assumptions;
create policy "tf members rw tax_assumptions" on tf_tax_assumptions
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- retire_inputs
alter table tf_retire_inputs enable row level security;
drop policy if exists "tf members rw retire_inputs" on tf_retire_inputs;
create policy "tf members rw retire_inputs" on tf_retire_inputs
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- college_kids
alter table tf_college_kids enable row level security;
drop policy if exists "tf members rw college_kids" on tf_college_kids;
create policy "tf members rw college_kids" on tf_college_kids
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));

-- import_batches
alter table tf_import_batches enable row level security;
drop policy if exists "tf members rw import_batches" on tf_import_batches;
create policy "tf members rw import_batches" on tf_import_batches
for all using (tf_is_household_member(household_id))
with check (tf_is_household_member(household_id));
