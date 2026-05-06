-- Align import summary with app "period" semantics (Monthly Report, etc.):
-- group by bank/posting month = tf_transactions.date, not imported_at.
--
-- Return columns changed from migration 17 (import_month -> period_month); Postgres
-- cannot replace a function with a different OUT/RETURNS TABLE shape without DROP.

drop function if exists public.tf_transaction_import_stats_by_month(uuid);

create or replace function public.tf_transaction_import_stats_by_month(p_household_id uuid)
returns table (
  account_id uuid,
  account_name text,
  period_month date,
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
    (date_trunc('month', t.date))::date as period_month,
    count(*)::bigint as txn_count,
    coalesce(sum(t.amount), 0)::numeric(14, 2) as amount_sum
  from tf_transactions t
  inner join tf_accounts a on a.id = t.account_id
  where t.household_id = p_household_id
  group by t.account_id, a.name, (date_trunc('month', t.date))::date
  order by period_month desc, account_name asc;
$$;

comment on function public.tf_transaction_import_stats_by_month(uuid) is
  'Per account: count and sum(amount) grouped by calendar month of transaction date (tf_transactions.date).';

grant execute on function public.tf_transaction_import_stats_by_month(uuid) to anon, authenticated;
