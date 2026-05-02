-- =============================================================================
-- 00_schema.sql
-- Truitt Family Finance App — full schema
-- All tables prefixed `tf_` so they don't collide with anything else in this
-- Supabase project.
-- Run this first in the Supabase SQL Editor.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists pg_trgm;      -- trigram index for ILIKE search

-- -----------------------------------------------------------------------------
-- Households + members
-- -----------------------------------------------------------------------------
create table if not exists tf_households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_at   timestamptz default now()
);

create table if not exists tf_household_members (
  household_id uuid references tf_households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  role         text default 'member',  -- 'owner' | 'member'
  primary key (household_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------
create table if not exists tf_accounts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references tf_households(id) on delete cascade,
  name         text not null,
  source_type  text not null,
    -- 'discover' | 'amex' | 'bcu_visa' | 'bcu_powerplus' | 'manual'
  is_active    boolean default true,
  created_at   timestamptz default now()
);

create index if not exists idx_tf_accounts_household on tf_accounts(household_id);

-- -----------------------------------------------------------------------------
-- Category schemes + categories
-- -----------------------------------------------------------------------------
create table if not exists tf_category_schemes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references tf_households(id) on delete cascade,
  name         text not null,
  is_default   boolean default false,
  sort_order   int default 0,
  created_at   timestamptz default now()
);

create index if not exists idx_tf_category_schemes_household on tf_category_schemes(household_id);

create table if not exists tf_categories (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references tf_households(id) on delete cascade,
  scheme_id       uuid not null references tf_category_schemes(id) on delete cascade,
  name            text not null,
  group_name      text,
  sort_order      int default 0,
  is_yearly       boolean default false,
  status          text default 'active',  -- 'active' | 'archived' | 'merged'
  merged_into_id  uuid references tf_categories(id),
  archived_at     timestamptz,
  created_at      timestamptz default now(),
  unique (scheme_id, name)
);

create index if not exists idx_tf_categories_household on tf_categories(household_id);
create index if not exists idx_tf_categories_scheme on tf_categories(scheme_id);

-- -----------------------------------------------------------------------------
-- Trips
-- -----------------------------------------------------------------------------
create table if not exists tf_trips (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references tf_households(id) on delete cascade,
  name         text not null,
  start_date   date not null,
  end_date     date not null,
  is_work      boolean default true,
  notes        text,
  created_at   timestamptz default now()
);

create index if not exists idx_tf_trips_household on tf_trips(household_id);
create index if not exists idx_tf_trips_dates on tf_trips(start_date, end_date);

-- -----------------------------------------------------------------------------
-- Rules
-- -----------------------------------------------------------------------------
create table if not exists tf_rules (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references tf_households(id) on delete cascade,
  scheme_id           uuid not null references tf_category_schemes(id) on delete cascade,
  priority            int not null,
  name                text not null,
  conditions          jsonb not null,
  action_category_id  uuid not null references tf_categories(id),
  is_active           boolean default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists idx_tf_rules_household on tf_rules(household_id);
create index if not exists idx_tf_rules_scheme_priority on tf_rules(scheme_id, priority);

-- -----------------------------------------------------------------------------
-- Transactions + transaction_categories
-- -----------------------------------------------------------------------------
create table if not exists tf_transactions (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references tf_households(id) on delete cascade,
  account_id        uuid not null references tf_accounts(id),
  date              date not null,
  description       text not null,
  amount            numeric(12,2) not null,    -- out = positive, in = negative
  source_category   text,
  card_member       text,
  external_id       text,
  dedupe_hash       text not null,
  notes             text,
  tag               text,
  trip_id           uuid references tf_trips(id),
  imported_at       timestamptz default now(),
  unique (household_id, dedupe_hash)
);

create index if not exists idx_tf_transactions_household on tf_transactions(household_id);
create index if not exists idx_tf_transactions_date on tf_transactions(date desc);
create index if not exists idx_tf_transactions_account on tf_transactions(account_id);
create index if not exists idx_tf_transactions_trip on tf_transactions(trip_id);
create index if not exists idx_tf_transactions_description_trgm
  on tf_transactions using gin (description gin_trgm_ops);

create table if not exists tf_transaction_categories (
  transaction_id   uuid references tf_transactions(id) on delete cascade,
  scheme_id        uuid references tf_category_schemes(id) on delete cascade,
  category_id      uuid references tf_categories(id),
  source           text,    -- 'rule' | 'manual' | 'import_hint'
  rule_id          uuid references tf_rules(id),
  updated_at       timestamptz default now(),
  primary key (transaction_id, scheme_id)
);

create index if not exists idx_tf_txn_cat_category on tf_transaction_categories(category_id);

-- -----------------------------------------------------------------------------
-- Budgets
-- -----------------------------------------------------------------------------
create table if not exists tf_budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references tf_households(id) on delete cascade,
  year         int not null,
  month        int not null check (month between 1 and 12),
  category_id  uuid not null references tf_categories(id),
  amount       numeric(12,2) not null,
  unique (household_id, year, month, category_id)
);

create index if not exists idx_tf_budgets_household_year on tf_budgets(household_id, year);

create table if not exists tf_revised_budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references tf_households(id) on delete cascade,
  year          int not null,
  as_of_month   int not null check (as_of_month between 1 and 12),
  category_id   uuid not null references tf_categories(id),
  month         int not null check (month between 1 and 12),
  amount        numeric(12,2) not null,
  created_at    timestamptz default now()
);

create index if not exists idx_tf_revised_household_year on tf_revised_budgets(household_id, year);

-- -----------------------------------------------------------------------------
-- Balance sheet
-- -----------------------------------------------------------------------------
create table if not exists tf_balance_sheet_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references tf_households(id) on delete cascade,
  name         text not null,
  type         text not null check (type in ('asset', 'liability')),
  sort_order   int default 0,
  is_active    boolean default true,
  created_at   timestamptz default now()
);

create table if not exists tf_balance_sheet_values (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references tf_balance_sheet_items(id) on delete cascade,
  as_of_month  date not null,    -- always YYYY-MM-01
  value        numeric(14,2) not null,
  notes        text,
  unique (item_id, as_of_month)
);

create index if not exists idx_tf_bs_values_item_month on tf_balance_sheet_values(item_id, as_of_month desc);

-- -----------------------------------------------------------------------------
-- Assumptions / planning
-- -----------------------------------------------------------------------------
create table if not exists tf_income_plan (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references tf_households(id) on delete cascade,
  year          int not null,
  source_name   text not null,
  month         int not null check (month between 1 and 12),
  amount        numeric(12,2),
  is_actual     boolean default false,
  unique (household_id, year, source_name, month, is_actual)
);

create table if not exists tf_savings_plan (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references tf_households(id) on delete cascade,
  year          int not null,
  account_name  text not null,
  month         int not null check (month between 1 and 12),
  amount        numeric(12,2),
  is_actual     boolean default false,
  unique (household_id, year, account_name, month, is_actual)
);

create table if not exists tf_tax_assumptions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references tf_households(id) on delete cascade,
  year          int not null,
  key           text not null,
  value         numeric,
  unique (household_id, year, key)
);

-- -----------------------------------------------------------------------------
-- Retirement + college
-- -----------------------------------------------------------------------------
create table if not exists tf_retire_inputs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references tf_households(id) on delete cascade,
  key           text not null,
  value         text not null,
  unique (household_id, key)
);

create table if not exists tf_college_kids (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references tf_households(id) on delete cascade,
  name              text not null,
  birth_year        int not null,
  current_balance   numeric(12,2) not null,
  monthly_contrib   numeric(10,2) not null,
  return_rate       numeric(5,4) not null,
  start_year        int,
  duration_years    int default 4
);

-- -----------------------------------------------------------------------------
-- Import audit log
-- -----------------------------------------------------------------------------
create table if not exists tf_import_batches (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references tf_households(id) on delete cascade,
  account_id    uuid not null references tf_accounts(id),
  imported_at   timestamptz default now(),
  source_file   text,
  row_count     int not null,
  new_count     int not null,
  imported_by   uuid references auth.users(id)
);
