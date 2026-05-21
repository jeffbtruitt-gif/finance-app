-- =============================================================================
-- 30_rebalances.sql
-- Track when a portfolio account was rebalanced. Shown as highlights on the
-- Performance → Rates grid.
-- =============================================================================

create table if not exists tf_rebalances (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references tf_households(id) on delete cascade,
  account_id    uuid not null references tf_performance_accounts(id) on delete cascade,
  month         date not null,  -- always YYYY-MM-01
  notes         text,
  created_at    timestamptz not null default now(),

  unique (household_id, account_id, month)
);

create index idx_tf_rebalances_household on tf_rebalances(household_id);

alter table tf_rebalances enable row level security;

create policy "rebalance_select" on tf_rebalances for select
  using (household_id in (
    select household_id from tf_household_members where user_id = auth.uid()
  ));
create policy "rebalance_insert" on tf_rebalances for insert
  with check (household_id in (
    select household_id from tf_household_members where user_id = auth.uid()
  ));
create policy "rebalance_delete" on tf_rebalances for delete
  using (household_id in (
    select household_id from tf_household_members where user_id = auth.uid()
  ));

-- =============================================================================
-- End migration 30
-- =============================================================================
