-- User-marked transactions for follow-up (notes already exist on tf_transactions).
alter table tf_transactions
  add column if not exists flag_for_review boolean not null default false;

comment on column tf_transactions.flag_for_review is
  'When true, the transaction is flagged for manual review in the UI.';
