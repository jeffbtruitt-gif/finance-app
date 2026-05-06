-- =============================================================================
-- 05_drop_source_category_hints.sql
-- We decided not to use bank-reported categories as a categorization signal.
-- Rules cover everything we need; hints just add another path that's easy to
-- forget about and complicates the dry-run UI.
--
-- Run this in the Supabase SQL Editor. Safe to run even if the table is empty
-- (which it is at the time of writing — we never inserted any hints).
-- =============================================================================

drop index if exists idx_tf_hints_lookup;
drop table if exists tf_source_category_hints;
