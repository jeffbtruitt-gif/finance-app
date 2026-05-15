-- =============================================================================
-- 29_off_balance_sheet_and_college_account.sql
-- Adds "off_balance_sheet" as a third account type and links college kids to
-- balance-sheet items for historical trend tracking.
--
-- Changes:
--   1. Widen the tf_balance_sheet_items.type CHECK constraint to include
--      'off_balance_sheet'. Off-balance-sheet items track values over time
--      (same as assets/liabilities) but are excluded from net worth.
--   2. Add bs_item_id to tf_college_kids so a kid can be linked to a
--      balance-sheet item (e.g. a 529 account) for historical balance display.
--
-- Safe to re-run: uses DROP/ADD CONSTRAINT pattern and ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- 1. Widen the type check constraint on tf_balance_sheet_items ----------------

alter table tf_balance_sheet_items
  drop constraint if exists tf_balance_sheet_items_type_check;

alter table tf_balance_sheet_items
  add constraint tf_balance_sheet_items_type_check
    check (type in ('asset', 'liability', 'off_balance_sheet'));

-- 2. Add bs_item_id to tf_college_kids ----------------------------------------

alter table tf_college_kids
  add column if not exists bs_item_id uuid
    references tf_balance_sheet_items(id) on delete set null;

comment on column tf_college_kids.bs_item_id is
  'Optional FK to a balance-sheet item (e.g. a 529 account). When set, the College page renders the item''s historical balance values as a trend chart alongside the projection.';

comment on column tf_balance_sheet_items.type is
  'Account type: asset (counts toward net worth), liability (deducted from net worth), or off_balance_sheet (tracked for trends but excluded from net worth calculations).';

-- =============================================================================
-- End migration 29
-- =============================================================================
