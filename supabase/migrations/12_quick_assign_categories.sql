-- Quick-assign flag: surfaced as chips on Make rule for fast categorization.
alter table tf_categories
  add column if not exists quick_assign boolean not null default false;

comment on column tf_categories.quick_assign is
  'When true, category appears as a one-click chip above the category field in Make rule.';
