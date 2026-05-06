-- Correct pagination when filtering to uncategorized only (range after filter, not before).
-- RLS on tf_transactions applies (security invoker).

create or replace function public.tf_uncategorized_transaction_page(
  p_scheme_id uuid,
  p_start date,
  p_end date,
  p_account_ids uuid[],
  p_search text,
  p_limit int,
  p_offset int,
  p_sort_column text,
  p_sort_asc boolean
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  s_col text;
  s_dir text;
  lim int := greatest(coalesce(p_limit, 25), 1);
  off int := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_arr uuid[];
begin
  s_col := case p_sort_column
    when 'amount' then 'amount'
    when 'description' then 'description'
    else 'date'
  end;
  s_dir := case when coalesce(p_sort_asc, false) then 'asc' else 'desc' end;

  execute format($sql$
    with filtered as (
      select t.id, t.date, t.amount, t.description
      from tf_transactions t
      where ($1::date is null or t.date >= $1::date)
        and ($2::date is null or t.date <= $2::date)
        and ($3::uuid[] is null or coalesce(cardinality($3), 0) = 0 or t.account_id = any($3))
        and ($4::text is null or btrim($4) = '' or t.description ilike ('%%' || btrim($4) || '%%'))
        and not exists (
          select 1 from tf_transaction_categories tc
          where tc.transaction_id = t.id
            and tc.scheme_id = $5
            and tc.category_id is not null
        )
    )
    select
      (select count(*)::bigint from filtered),
      coalesce(
        array(
          select f.id
          from filtered f
          order by f.%I %s nulls last, f.id %s
          limit $6 offset $7
        ),
        array[]::uuid[]
      )
  $sql$, s_col, s_dir, s_dir)
  into v_total, v_arr
  using p_start, p_end, p_account_ids, p_search, p_scheme_id, lim, off;

  return jsonb_build_object(
    'total', v_total,
    'ids', coalesce(to_jsonb(v_arr), '[]'::jsonb)
  );
end;
$$;

comment on function public.tf_uncategorized_transaction_page is
  'Returns {"total": bigint, "ids": uuid[]} for uncategorized-only transaction list pagination.';

grant execute on function public.tf_uncategorized_transaction_page(
  uuid, date, date, uuid[], text, int, int, text, boolean
) to anon, authenticated;
