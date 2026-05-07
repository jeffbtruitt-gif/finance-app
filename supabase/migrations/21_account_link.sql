-- Add optional URL link to accounts (e.g. online banking login page).
alter table tf_accounts add column if not exists link text;
