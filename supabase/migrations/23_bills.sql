-- Bills — monthly recurring bills with optional URL to the bill website.
create table if not exists tf_bills (
  id          uuid primary key default gen_random_uuid(),
  household_id uuid not null references tf_households(id) on delete cascade,
  name        text not null,
  url         text,
  notes       text,
  amount      numeric,
  due_day     smallint,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_tf_bills_household on tf_bills(household_id);

-- RLS
alter table tf_bills enable row level security;

create policy "bills_select" on tf_bills for select
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

create policy "bills_insert" on tf_bills for insert
  with check (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

create policy "bills_update" on tf_bills for update
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

create policy "bills_delete" on tf_bills for delete
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));
