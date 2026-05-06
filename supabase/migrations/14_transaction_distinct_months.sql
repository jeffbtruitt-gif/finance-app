-- Distinct calendar months that have at least one transaction (RLS applies).
create or replace function public.tf_transaction_distinct_months()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select distinct (date_trunc('month', t.date))::date as ms
    from tf_transactions t
  )
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'key', to_char(m.ms, 'YYYY-MM'),
          'start', m.ms::text,
          'end', ((m.ms + interval '1 month - 1 day')::date)::text
        )
        order by m.ms desc
      )
      from months m
    ),
    '[]'::jsonb
  );
$$;

comment on function public.tf_transaction_distinct_months() is
  'JSON array of {key, start, end} for each month with transactions, newest first.';

grant execute on function public.tf_transaction_distinct_months() to anon, authenticated;
