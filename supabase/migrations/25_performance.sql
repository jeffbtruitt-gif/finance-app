-- Performance tracking — monthly return rates per portfolio/account.
-- Two tables: accounts (which portfolios to track) and rates (monthly return %).

-- 1. Performance accounts — user picks which BS accounts to track returns for.
create table if not exists tf_performance_accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references tf_households(id) on delete cascade,
  item_id       uuid not null references tf_balance_sheet_items(id) on delete cascade,
  created_at    timestamptz not null default now(),

  unique (household_id, item_id)
);

create index idx_tf_perf_acct_household on tf_performance_accounts(household_id);

alter table tf_performance_accounts enable row level security;

create policy "perf_acct_select" on tf_performance_accounts for select
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));
create policy "perf_acct_insert" on tf_performance_accounts for insert
  with check (household_id in (select household_id from tf_household_members where user_id = auth.uid()));
create policy "perf_acct_delete" on tf_performance_accounts for delete
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

-- 2. Monthly return rates per performance account.
create table if not exists tf_performance_rates (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references tf_performance_accounts(id) on delete cascade,
  month         date not null,  -- always YYYY-MM-01
  rate          numeric not null default 0,  -- monthly return as a percentage, e.g. 2.5 = +2.5%

  unique (account_id, month)
);

create index idx_tf_perf_rates_account on tf_performance_rates(account_id);

alter table tf_performance_rates enable row level security;

create policy "perf_rate_select" on tf_performance_rates for select
  using (account_id in (
    select id from tf_performance_accounts
    where household_id in (select household_id from tf_household_members where user_id = auth.uid())
  ));
create policy "perf_rate_insert" on tf_performance_rates for insert
  with check (account_id in (
    select id from tf_performance_accounts
    where household_id in (select household_id from tf_household_members where user_id = auth.uid())
  ));
create policy "perf_rate_update" on tf_performance_rates for update
  using (account_id in (
    select id from tf_performance_accounts
    where household_id in (select household_id from tf_household_members where user_id = auth.uid())
  ));
create policy "perf_rate_delete" on tf_performance_rates for delete
  using (account_id in (
    select id from tf_performance_accounts
    where household_id in (select household_id from tf_household_members where user_id = auth.uid())
  ));
