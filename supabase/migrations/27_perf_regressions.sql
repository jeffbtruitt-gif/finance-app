-- Fama-French regression results — persisted output of single- and multi-factor
-- OLS regressions run from the Performance > Regressions tab.

create table if not exists tf_performance_regressions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references tf_households(id) on delete cascade,
  account_id      uuid not null references tf_performance_accounts(id) on delete cascade,
  run_date        date not null,
  regression_type text not null check (regression_type in ('single', 'multi')),
  period_months   int not null check (period_months in (6, 12, 18, 24)),
  period_end      date not null,
  -- Coefficients
  alpha           numeric not null,
  alpha_se        numeric not null,
  alpha_pvalue    numeric not null,
  beta_mkt        numeric not null,
  beta_mkt_se     numeric not null,
  beta_mkt_pvalue numeric not null,
  beta_smb        numeric,
  beta_smb_se     numeric,
  beta_smb_pvalue numeric,
  beta_hml        numeric,
  beta_hml_se     numeric,
  beta_hml_pvalue numeric,
  r_squared       numeric not null,
  adj_r_squared   numeric not null,
  n_observations  int not null,
  created_at      timestamptz not null default now(),

  unique (household_id, run_date, regression_type, period_months, account_id)
);

create index if not exists idx_tf_perf_reg_household on tf_performance_regressions(household_id);
create index if not exists idx_tf_perf_reg_account on tf_performance_regressions(account_id);

alter table tf_performance_regressions enable row level security;

create policy "perf_reg_select" on tf_performance_regressions for select
  using (household_id in (
    select household_id from tf_household_members where user_id = auth.uid()
  ));
create policy "perf_reg_insert" on tf_performance_regressions for insert
  with check (household_id in (
    select household_id from tf_household_members where user_id = auth.uid()
  ));
create policy "perf_reg_update" on tf_performance_regressions for update
  using (household_id in (
    select household_id from tf_household_members where user_id = auth.uid()
  ));
create policy "perf_reg_delete" on tf_performance_regressions for delete
  using (household_id in (
    select household_id from tf_household_members where user_id = auth.uid()
  ));
