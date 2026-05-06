-- =============================================================================
-- 07_relax_dedupe_constraint.sql
-- Truitt Family Finance App — Phase 4 follow-up
--
-- Drops the unique constraint on tf_transactions(household_id, dedupe_hash)
-- and replaces it with a non-unique index that still supports the
-- "is this hash already in the DB?" lookup the import preview runs.
--
-- Why:
--   The dedupe_hash is `(account, date, amount, description)`. That's a
--   reasonable HEURISTIC for "this row already imported", but it's also
--   correct for a legitimate same-day refund or re-charge of the same amount
--   at the same merchant. Treating it as a hard DB invariant blocks users
--   from overriding the import-preview's "duplicate" flag when they know
--   better.
--
--   Dedupe is a UX feature (the import preview surfaces the count + lets
--   you uncheck overrides). It does NOT need to be enforced at the DB
--   level — the preview pass always runs before insert.
--
-- Run this in Supabase SQL Editor after migration 06.
-- =============================================================================

-- The original constraint was added inline in migration 00 as
-- `unique (household_id, dedupe_hash)`. Postgres auto-names that constraint
-- `tf_transactions_household_id_dedupe_hash_key`.
alter table tf_transactions
  drop constraint if exists tf_transactions_household_id_dedupe_hash_key;

-- Replace with a non-unique index so the "look up by household + hash"
-- query still uses an index scan. The preview's `findExistingTransactions`
-- uses `where household_id = $1 and dedupe_hash in (...)` which this index
-- covers.
create index if not exists idx_tf_transactions_household_dedupe_hash
  on tf_transactions(household_id, dedupe_hash);
