-- Standalone quick links (not tied to accounts).
create table if not exists tf_quick_links (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references tf_households(id) on delete cascade,
  name         text not null,
  url          text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index idx_tf_quick_links_household on tf_quick_links(household_id);

-- RLS
alter table tf_quick_links enable row level security;

create policy "quick_links_select" on tf_quick_links for select
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

create policy "quick_links_insert" on tf_quick_links for insert
  with check (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

create policy "quick_links_update" on tf_quick_links for update
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

create policy "quick_links_delete" on tf_quick_links for delete
  using (household_id in (select household_id from tf_household_members where user_id = auth.uid()));

-- Migrate existing account links into the new table.
insert into tf_quick_links (household_id, name, url)
select a.household_id, a.name, a.link
from tf_accounts a
where a.link is not null;
