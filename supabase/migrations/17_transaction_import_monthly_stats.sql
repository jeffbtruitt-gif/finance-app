-- Aggregate imported transaction counts and amount sums by account and by
-- calendar month of tf_transactions.imported_at (when the row landed in the app).
-- RLS on tf_transactions and tf_accounts applies (security invoker).

create or replace function public.tf_transaction_import_stats_by_month(p_household_id uuid)
returns table (
  account_id uuid,
  account_name text,
  import_month date,
  txn_count bigint,
  amount_sum numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.account_id,
    a.name as account_name,
    (date_trunc('month', t.imported_at))::date as import_month,
    count(*)::bigint as txn_count,
    coalesce(sum(t.amount), 0)::numeric(14, 2) as amount_sum
  from tf_transactions t
  inner join tf_accounts a on a.id = t.account_id
  where t.household_id = p_household_id
  group by t.account_id, a.name, (date_trunc('month', t.imported_at))::date
  order by import_month desc, account_name asc;
$$;

comment on function public.tf_transaction_import_stats_by_month(uuid) is
  'Per account: transaction count and sum(amount) grouped by month of imported_at.';

grant execute on function public.tf_transaction_import_stats_by_month(uuid) to anon, authenticated;
