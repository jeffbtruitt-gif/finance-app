-- Phase 2: Imports, rules, and source-category hints
-- Run this after Phase 1 migrations (00_schema.sql, 01_rls.sql, 02_seed_categories.sql)

-- ============================================================================
-- source_category_hints
-- Maps a bank's own category string (e.g., Discover's "Gasoline") to one of
-- our categories. Used as a fallback suggestion when no rule matches a tx.
-- Hints are SUGGESTIONS, never auto-applied — surfaced in the dry-run preview
-- where the user accepts/rejects them per row.
-- ============================================================================
create table if not exists source_category_hints (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  scheme_id       uuid not null references category_schemes(id) on delete cascade,
  source_type     text not null,                       -- 'discover' | 'amex' | 'bcu_visa' | 'bcu_powerplus'
  source_category text not null,                       -- raw value as it appears in the bank export
  category_id     uuid not null references categories(id) on delete cascade,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (household_id, scheme_id, source_type, source_category)
);

create index if not exists idx_hints_lookup
  on source_category_hints (household_id, scheme_id, source_type, source_category)
  where is_active = true;

alter table source_category_hints enable row level security;

create policy "members can read hints" on source_category_hints
  for select using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "members can write hints" on source_category_hints
  for all using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  ) with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- ============================================================================
-- Helpful index for the dedupe path on imports
-- We look up by (household_id, dedupe_hash) on every imported row; a covering
-- index on those columns plus external_id keeps imports fast even at 50K rows.
-- ============================================================================
create index if not exists idx_transactions_dedupe
  on transactions (household_id, dedupe_hash);

create index if not exists idx_transactions_external_id
  on transactions (household_id, external_id)
  where external_id is not null;

-- ============================================================================
-- Index for rule evaluation: pulling uncategorized transactions in a scheme
-- ============================================================================
create index if not exists idx_tx_categories_lookup
  on transaction_categories (scheme_id, category_id);

create index if not exists idx_rules_active_priority
  on rules (household_id, scheme_id, priority)
  where is_active = true;
