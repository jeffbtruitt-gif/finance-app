-- Extend performance accounts to support Fama-French factor series.
-- Factor accounts have item_id = NULL and a non-null factor_key instead.

-- Make item_id nullable so factor accounts don't need a BS item.
alter table tf_performance_accounts
  alter column item_id drop not null;

-- Add factor_key for identifying Fama-French factors.
alter table tf_performance_accounts
  add column if not exists factor_key text,
  add column if not exists label text;

-- Add a display label so we can name factors nicely.
comment on column tf_performance_accounts.factor_key is
  'Non-null for imported factor series (e.g. mkt_rf, smb, hml, rf). NULL for user portfolio accounts.';
comment on column tf_performance_accounts.label is
  'Display name for factor accounts. NULL for BS-linked accounts (use item.name instead).';

-- Ensure at most one row per factor per household.
create unique index if not exists idx_tf_perf_acct_factor
  on tf_performance_accounts(household_id, factor_key)
  where factor_key is not null;
