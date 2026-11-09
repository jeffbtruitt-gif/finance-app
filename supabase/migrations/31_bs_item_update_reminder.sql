-- =============================================================================
-- 31_bs_item_update_reminder.sql
-- Per-account switch for the BS Accounts "not updated this month" indicator.
-- Turn it off for accounts that no longer change (e.g. a paid-off auto loan).
--
-- Additive and safe to re-run; defaults to true so existing accounts keep
-- the indicator.
-- =============================================================================

alter table tf_balance_sheet_items
  add column if not exists track_monthly_updates boolean not null default true;
