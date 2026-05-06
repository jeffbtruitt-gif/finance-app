-- Optional URL per balance-sheet line item (not per month) — e.g. institution
-- page the household uses to look up or refresh balances.

alter table tf_balance_sheet_items
  add column if not exists value_source_url text;

comment on column tf_balance_sheet_items.value_source_url is
  'Optional HTTPS URL for this line item (one per item). Used to open the source site when updating balances; not tied to tf_balance_sheet_values.';
