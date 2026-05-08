-- BS Allocations — asset class split per balance-sheet item.
-- Each row stores one (item_id, category) → percentage mapping.
-- Categories: us_stocks, intl_stocks, fixed_income, real_estate, cash.

create table if not exists tf_bs_allocations (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references tf_balance_sheet_items(id) on delete cascade,
  household_id uuid not null references tf_households(id) on delete cascade,
  category    text not null check (category in ('us_stocks','intl_stocks','fixed_income','real_estate','cash')),
  percentage  numeric not null default 0 check (percentage >= 0 and percentage <= 100),
  created_at  timestamptz not null default now(),

  unique (item_id, category)
);

create index idx_tf_bs_allocations_household on tf_bs_allocations(household_id);
create index idx_tf_bs_allocations_item on tf_bs_allocations(item_id);

-- RLS
alter table tf_bs_allocations enable row level security;

create policy "bs_alloc_select" on tf_bs_allocations for select
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

create policy "bs_alloc_insert" on tf_bs_allocations for insert
  with check (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

create policy "bs_alloc_update" on tf_bs_allocations for update
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

create policy "bs_alloc_delete" on tf_bs_allocations for delete
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));
