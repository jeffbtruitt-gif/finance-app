-- =============================================================================
-- 02_seed_minimal.sql
-- Minimal seed for Phase 1 testing.
--
-- ⚠️ BEFORE RUNNING ⚠️
-- 1. In Supabase Auth → Users, create accounts for both you and Britney.
-- 2. Click each user, copy the "User UID" value.
-- 3. Find the two lines below marked "← PASTE YOUR UID HERE" and replace the
--    placeholder UUIDs with the real ones. Save the file. Then run.
-- =============================================================================

do $$
declare
  -- ⬇⬇⬇  EDIT THESE TWO LINES  ⬇⬇⬇
  v_jeff_id      uuid := 'd51e4870-77ce-4687-9a01-fa44ecdee5d2';   -- ← PASTE YOUR UID HERE
  v_britney_id   uuid := '00000000-0000-0000-0000-000000000000';   -- ← PASTE BRITNEY'S UID HERE
  -- ⬆⬆⬆  EDIT THESE TWO LINES  ⬆⬆⬆

  v_household_id   uuid;
  v_scheme_id      uuid;
  v_discover_id    uuid;
  v_amex_id        uuid;
  v_bcu_visa_id    uuid;
  v_bcu_pp_id      uuid;
  v_groceries_id   uuid;
  v_restaurants_id uuid;
  v_transport_id   uuid;
  v_shopping_id    uuid;
  v_rent_id        uuid;
  v_utilities_id   uuid;
  v_target_id      uuid;
  v_amazon_id      uuid;
  v_income_id      uuid;
begin
  -- Sanity check
  if v_jeff_id = '00000000-0000-0000-0000-000000000000'::uuid
     or v_britney_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'You must replace the placeholder UUIDs at the top of this file with the real User UIDs from Supabase Auth.';
  end if;

  -- ---------------------------------------------------------------------------
  -- Household + members
  -- ---------------------------------------------------------------------------
  insert into tf_households (name) values ('Truitt') returning id into v_household_id;

  insert into tf_household_members (household_id, user_id, role) values
    (v_household_id, v_jeff_id, 'owner'),
    (v_household_id, v_britney_id, 'member');

  -- ---------------------------------------------------------------------------
  -- Default category scheme
  -- ---------------------------------------------------------------------------
  insert into tf_category_schemes (household_id, name, is_default, sort_order)
  values (v_household_id, 'Standard Budget', true, 0)
  returning id into v_scheme_id;

  -- ---------------------------------------------------------------------------
  -- Categories — full set, grouped per the master plan
  -- ---------------------------------------------------------------------------
  -- Rent & House Maintenance
  insert into tf_categories (household_id, scheme_id, name, group_name, sort_order) values
    (v_household_id, v_scheme_id, 'Rent',              'Rent & House Maintenance', 10),
    (v_household_id, v_scheme_id, 'House Maintenance', 'Rent & House Maintenance', 20),
    (v_household_id, v_scheme_id, 'Utilities',           'Rent & House Maintenance', 30),
    (v_household_id, v_scheme_id, 'Car Loan',            'Rent & House Maintenance', 40),
    (v_household_id, v_scheme_id, 'Cleaning',            'Rent & House Maintenance', 50),
    (v_household_id, v_scheme_id, 'Day Care',            'Rent & House Maintenance', 70);

  insert into tf_categories (household_id, scheme_id, name, group_name, sort_order, is_yearly) values
    (v_household_id, v_scheme_id, 'Insurance', 'Rent & House Maintenance', 60, true);

  -- Food & Car
  insert into tf_categories (household_id, scheme_id, name, group_name, sort_order) values
    (v_household_id, v_scheme_id, 'Transportation', 'Food & Car', 110),
    (v_household_id, v_scheme_id, 'Restaurants',    'Food & Car', 120),
    (v_household_id, v_scheme_id, 'Groceries',      'Food & Car', 130),
    (v_household_id, v_scheme_id, 'Target',         'Food & Car', 140);

  -- Other (general)
  insert into tf_categories (household_id, scheme_id, name, group_name, sort_order) values
    (v_household_id, v_scheme_id, 'Gym',           'Other', 210),
    (v_household_id, v_scheme_id, 'Shopping',      'Other', 220),
    (v_household_id, v_scheme_id, 'Amazon',        'Other', 230),
    (v_household_id, v_scheme_id, 'Entertainment', 'Other', 240),
    (v_household_id, v_scheme_id, 'Dry Cleaning',  'Other', 250),
    (v_household_id, v_scheme_id, 'Gifts',         'Other', 260),
    (v_household_id, v_scheme_id, 'Misc',          'Other', 270);

  -- Yearly
  insert into tf_categories (household_id, scheme_id, name, group_name, sort_order, is_yearly) values
    (v_household_id, v_scheme_id, 'Property Tax',  'Yearly', 320, true),
    (v_household_id, v_scheme_id, 'Subscriptions', 'Yearly', 330, true),
    (v_household_id, v_scheme_id, 'Charity',       'Yearly', 340, true);

  -- Income / Savings / Transfer
  insert into tf_categories (household_id, scheme_id, name, group_name, sort_order) values
    (v_household_id, v_scheme_id, 'Salary',       'Income',   410),
    (v_household_id, v_scheme_id, 'Bonus',        'Income',   420),
    (v_household_id, v_scheme_id, 'Other Income', 'Income',   430),
    (v_household_id, v_scheme_id, '401K',         'Savings',  510),
    (v_household_id, v_scheme_id, 'Roth IRA',     'Savings',  520),
    (v_household_id, v_scheme_id, '529',          'Savings',  530),
    (v_household_id, v_scheme_id, 'Transfer',     'Transfer', 610);

  -- Capture some category ids for the fake transactions
  select id into v_groceries_id   from tf_categories where scheme_id = v_scheme_id and name = 'Groceries';
  select id into v_restaurants_id from tf_categories where scheme_id = v_scheme_id and name = 'Restaurants';
  select id into v_transport_id   from tf_categories where scheme_id = v_scheme_id and name = 'Transportation';
  select id into v_shopping_id    from tf_categories where scheme_id = v_scheme_id and name = 'Shopping';
  select id into v_target_id     from tf_categories where scheme_id = v_scheme_id and name = 'Target';
  select id into v_amazon_id     from tf_categories where scheme_id = v_scheme_id and name = 'Amazon';
  select id into v_rent_id        from tf_categories where scheme_id = v_scheme_id and name = 'Rent';
  select id into v_utilities_id   from tf_categories where scheme_id = v_scheme_id and name = 'Utilities';
  select id into v_income_id      from tf_categories where scheme_id = v_scheme_id and name = 'Salary';

  -- ---------------------------------------------------------------------------
  -- Accounts
  -- ---------------------------------------------------------------------------
  insert into tf_accounts (household_id, name, source_type) values
    (v_household_id, 'Discover', 'discover') returning id into v_discover_id;
  insert into tf_accounts (household_id, name, source_type) values
    (v_household_id, 'Amex', 'amex') returning id into v_amex_id;
  insert into tf_accounts (household_id, name, source_type) values
    (v_household_id, 'BCU Cash Rewards Visa', 'bcu_visa') returning id into v_bcu_visa_id;
  insert into tf_accounts (household_id, name, source_type) values
    (v_household_id, 'BCU Powerplus', 'bcu_powerplus') returning id into v_bcu_pp_id;

  -- ---------------------------------------------------------------------------
  -- 20 fake transactions for grid testing
  -- ---------------------------------------------------------------------------
  insert into tf_transactions (household_id, account_id, date, description, amount, dedupe_hash) values
    (v_household_id, v_bcu_pp_id,    current_date - 1,  'TARGET STORE T-1234',           87.42,   'seed-001'),
    (v_household_id, v_amex_id,      current_date - 2,  'STARBUCKS #4521',                6.15,   'seed-002'),
    (v_household_id, v_discover_id,  current_date - 3,  'AMAZON.COM*A1B2C',              42.99,   'seed-003'),
    (v_household_id, v_bcu_visa_id,  current_date - 4,  'SHELL OIL 12345',               48.20,   'seed-004'),
    (v_household_id, v_amex_id,      current_date - 5,  'WHOLE FOODS MARKET 102',       128.34,   'seed-005'),
    (v_household_id, v_discover_id,  current_date - 7,  'CHIPOTLE 0918',                 14.85,   'seed-006'),
    (v_household_id, v_bcu_pp_id,    current_date - 9,  'EMPLOYER PAYROLL DEPOSIT',   -3850.00,   'seed-007'),
    (v_household_id, v_bcu_pp_id,    current_date - 10, 'XCEL ENERGY ONLINE PMT',       142.50,   'seed-008'),
    (v_household_id, v_bcu_pp_id,    current_date - 12, 'RENT - ACH',                  2100.00,   'seed-009'),
    (v_household_id, v_amex_id,      current_date - 14, 'COSTCO WHSE #1024',            215.78,   'seed-010'),
    (v_household_id, v_discover_id,  current_date - 16, 'DELTA AIRLINES TICKET',        412.00,   'seed-011'),
    (v_household_id, v_bcu_visa_id,  current_date - 18, 'KWIK TRIP #482',                52.10,   'seed-012'),
    (v_household_id, v_amex_id,      current_date - 22, 'NETFLIX.COM',                   17.99,   'seed-013'),
    (v_household_id, v_discover_id,  current_date - 25, 'SPOTIFY USA',                    9.99,   'seed-014'),
    (v_household_id, v_bcu_pp_id,    current_date - 28, 'COMCAST CABLE',                 79.00,   'seed-015'),
    (v_household_id, v_amex_id,      current_date - 30, 'TRADER JOES #621',              94.21,   'seed-016'),
    (v_household_id, v_discover_id,  current_date - 33, 'CVS/PHARMACY 04321',            22.45,   'seed-017'),
    (v_household_id, v_bcu_visa_id,  current_date - 38, 'HOME DEPOT 2839',              156.78,   'seed-018'),
    (v_household_id, v_bcu_pp_id,    current_date - 42, 'EMPLOYER PAYROLL DEPOSIT',   -3850.00,   'seed-019'),
    (v_household_id, v_amex_id,      current_date - 45, 'OLIVE GARDEN 4521',             68.40,   'seed-020');

  -- Categorize most of them so the grid shows mixed states
  insert into tf_transaction_categories (transaction_id, scheme_id, category_id, source)
  select t.id, v_scheme_id,
    case
      when t.description like 'TARGET%' then v_target_id
      when t.description like 'AMAZON%' then v_amazon_id
      when t.description like 'COSTCO%' or t.description like 'HOME DEPOT%' then v_shopping_id
      when t.description like 'WHOLE FOODS%' or t.description like 'TRADER JOES%' then v_groceries_id
      when t.description like 'STARBUCKS%' or t.description like 'CHIPOTLE%'
        or t.description like 'OLIVE GARDEN%' then v_restaurants_id
      when t.description like 'SHELL%' or t.description like 'KWIK TRIP%'
        or t.description like 'DELTA%' then v_transport_id
      when t.description like 'RENT%' then v_rent_id
      when t.description like 'XCEL%' or t.description like 'COMCAST%' then v_utilities_id
      when t.description like '%PAYROLL%' then v_income_id
      else null
    end,
    'manual'
  from tf_transactions t
  where t.household_id = v_household_id
    and t.dedupe_hash like 'seed-%'
    and t.description not like 'NETFLIX%'   -- leave a few uncategorized
    and t.description not like 'SPOTIFY%'
    and t.description not like 'CVS%';

  raise notice 'Seed complete. Household ID: %', v_household_id;
end $$;
