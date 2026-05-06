-- Categories: color_override + merge RPC (management page).
-- Safe to run after 00–10.

alter table tf_categories
  add column if not exists color_override text;

-- Merge source category into target: reassign references, archive source.
create or replace function public.tf_merge_category(p_source uuid, p_target uuid)
returns table(moved_txns int, moved_rules int, moved_budget_cells int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheme uuid;
  v_hh     uuid;
  n_tx     int := 0;
  n_rules  int := 0;
  n_bud    int := 0;
  r        tf_budgets%rowtype;
  rr       tf_revised_budgets%rowtype;
begin
  select scheme_id, household_id into v_scheme, v_hh
  from tf_categories
  where id = p_source;

  if v_scheme is null then
    raise exception 'source category not found';
  end if;

  if p_source = p_target then
    raise exception 'source and target must differ';
  end if;

  if not exists (
    select 1 from tf_categories
    where id = p_target and household_id = v_hh and scheme_id = v_scheme
  ) then
    raise exception 'target category not in same scheme/household';
  end if;

  update tf_transaction_categories
     set category_id = p_target,
         updated_at = now()
   where category_id = p_source
     and scheme_id = v_scheme;
  get diagnostics n_tx = row_count;

  update tf_rules
     set action_category_id = p_target
   where action_category_id = p_source;
  get diagnostics n_rules = row_count;

  for r in select * from tf_budgets where category_id = p_source
  loop
    if exists (
      select 1 from tf_budgets
      where household_id = r.household_id
        and year = r.year
        and month = r.month
        and category_id = p_target
    ) then
      update tf_budgets
         set amount = amount + r.amount
       where household_id = r.household_id
         and year = r.year
         and month = r.month
         and category_id = p_target;
      delete from tf_budgets where id = r.id;
    else
      update tf_budgets set category_id = p_target where id = r.id;
    end if;
    n_bud := n_bud + 1;
  end loop;

  for rr in select * from tf_revised_budgets where category_id = p_source
  loop
    if exists (
      select 1 from tf_revised_budgets
      where household_id = rr.household_id
        and year = rr.year
        and as_of_month = rr.as_of_month
        and category_id = p_target
        and month = rr.month
    ) then
      update tf_revised_budgets
         set amount = amount + rr.amount
       where household_id = rr.household_id
         and year = rr.year
         and as_of_month = rr.as_of_month
         and category_id = p_target
         and month = rr.month;
      delete from tf_revised_budgets where id = rr.id;
    else
      update tf_revised_budgets set category_id = p_target where id = rr.id;
    end if;
  end loop;

  update tf_categories
     set status = 'archived',
         merged_into_id = p_target,
         archived_at = now()
   where id = p_source;

  return query select n_tx, n_rules, n_bud;
end;
$$;

grant execute on function public.tf_merge_category(uuid, uuid) to authenticated;
grant execute on function public.tf_merge_category(uuid, uuid) to service_role;
