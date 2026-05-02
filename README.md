# Truitt Family Finance App — Phase 1

Foundation phase: Supabase + auth + read-only transactions grid.

> **Note:** Every database table this app creates is prefixed with `tf_` (e.g.
> `tf_transactions`, `tf_categories`) so it can safely live alongside other
> projects in the same Supabase database without name collisions. If you ever
> need to query the data directly, remember to use the prefix.

## What's in this drop

| What                                         | Where                                       |
| -------------------------------------------- | ------------------------------------------- |
| All tables from the master plan              | `supabase/migrations/00_schema.sql`         |
| Row Level Security policies                  | `supabase/migrations/01_rls.sql`            |
| Household, categories, accounts, fake txns   | `supabase/migrations/02_seed_minimal.sql`   |
| React + Vite + TS + Tailwind app             | `src/`                                      |
| Auth (login, password reset)                 | `src/pages/auth/`                           |
| Transaction grid w/ sort, filter, search     | `src/pages/transactions/TransactionsPage.tsx` |
| Placeholders for every future route          | `src/pages/placeholders/`                   |
| GitHub Pages deploy pipeline                 | `.github/workflows/deploy.yml`              |

## Order of operations

You're going to do this in three swims, each with clear "did it work" checkpoints. **Don't skip ahead** — the next step always needs the previous step's output.

```
Drop 1: Supabase up      ──┐
                           │
Drop 2: Local app working ─┼─ test on localhost:5173
                           │
Drop 3: GitHub Pages live ─┘  test at https://jeffbtruitt-git.github.io/finance-app/
```

---

## Drop 1 — Supabase + schema (≈30 min)

### 1a. Create the Supabase project

1. Go to <https://supabase.com> → **Sign up** (use the GitHub login if you want; same account that hosts the repo is fine).
2. **New project**. Org = your personal org. Name = `truitt-finance`. Database password — generate a strong one and **save to your password manager**. Region = pick US Central or US East (whichever is closer to Bloomington — both fine).
3. Wait ~2 min for the project to provision.
4. Go to **Project Settings → API**. Copy these two values into a scratchpad — you'll need them in a sec:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public key** (a long JWT)
5. Save the **service role key** (also on that page) into your password manager. We don't use it from the app, but you'll want it for any future one-off scripts.

### 1b. Create the user accounts

1. Left sidebar → **Authentication → Providers**. Make sure **Email** is enabled. Toggle **off** "Confirm email" for now (you can turn it back on after Phase 1 — fewer moving parts during setup).
2. **Authentication → Users → "Add user" → "Create new user"**.
   - Add yourself: your email + a password.
   - Add Britney: her email + a password (you can share with her later).
3. After both are created, click into each user. Copy the **User UID** for each. You'll paste these into the seed migration in step 1d.

### 1c. Run the schema migrations

1. Left sidebar → **SQL Editor → New query**.
2. Open `supabase/migrations/00_schema.sql` from this repo, paste the entire contents, click **Run** (bottom right). Should say "Success. No rows returned." in a few seconds.
3. New query → paste `01_rls.sql` → Run. Same success.

### 1d. Run the seed

1. Open `supabase/migrations/02_seed_minimal.sql` in any text editor. Near the top you'll see:
   ```sql
   v_jeff_id      uuid := '00000000-0000-0000-0000-000000000000';   -- ← PASTE YOUR UID HERE
   v_britney_id   uuid := '00000000-0000-0000-0000-000000000000';   -- ← PASTE BRITNEY'S UID HERE
   ```
   Replace each zero-string with the real User UID you copied in step 1b. **Keep the single quotes around it** — that's important. So the line should end up looking like:
   ```sql
   v_jeff_id      uuid := 'd51e4870-77ce-4687-9a01-fa44ecdee5d2';
   ```
2. Save the file. Paste the whole thing into the SQL Editor → Run. You should see a **NOTICE** line in the output showing your new household ID. If it errors with "You must replace the placeholder UUIDs" — you forgot one or got the format wrong.

### 1e. Sanity check

In the SQL Editor:

```sql
select count(*) from tf_transactions;
-- expect: 20

select count(*) from tf_categories;
-- expect: 27

select hm.role, u.email
from tf_household_members hm
join auth.users u on u.id = hm.user_id;
-- expect: 2 rows, you as 'owner' and Britney as 'member'
```

If anything's off, drop me a line — easier to fix here than later.

**Drop 1 done.** Keep your Supabase URL and anon key handy for Drop 2.

---

## Drop 2 — Local app running (≈20 min)

### 2a. Install Node 20+ if you don't have it

```bash
node --version
# need v20.x or higher; if not, install from https://nodejs.org
```

### 2b. Create the GitHub repo

1. Go to <https://github.com/new>.
2. Owner: `jeffbtruitt-git`. Name: `finance-app`. Visibility: **Private**. Don't initialize with README.
3. Clone it locally:
   ```bash
   git clone https://github.com/jeffbtruitt-git/finance-app.git
   cd finance-app
   ```

### 2c. Drop in the files

Copy **everything** from this Phase 1 deliverable into the cloned folder. The structure should match what's in this README.

### 2d. Configure environment

```bash
cp .env.local.example .env.local
```

Open `.env.local` and paste your real Supabase URL and anon key:
```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2e. Install + run

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. You should see the login screen. Log in with the email/password you created in Supabase. You should land on the dashboard, see the nav, and clicking **Transactions** should show 20 fake rows.

### 2f. Test the acceptance criteria

- [ ] Can log in as you
- [ ] Can log in as Britney (sign out, sign in again with her credentials)
- [ ] Transaction grid loads
- [ ] Click "Date" header to toggle sort direction
- [ ] Click "Amount" header to sort by amount
- [ ] Filter by date range works
- [ ] Filter by account chip works (try clicking "Discover" — only Discover transactions show)
- [ ] Filter by category chip works
- [ ] Filter by "uncategorized" chip — should show 3 rows (Netflix, Spotify, CVS)
- [ ] Free-text search on description works (try "TARGET")

If everything passes, commit and push:

```bash
git add .
git commit -m "Phase 1 — Foundation"
git push origin main
```

**Drop 2 done.**

---

## Drop 3 — GitHub Pages live (≈15 min)

### 3a. Add repo secrets

1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.
2. Add `VITE_SUPABASE_URL` (paste your Supabase project URL).
3. Add `VITE_SUPABASE_ANON_KEY` (paste your anon key).

### 3b. Enable Pages

1. GitHub repo → **Settings → Pages**.
2. Source: **GitHub Actions** (not "Deploy from a branch").

### 3c. Trigger a deploy

The workflow runs automatically on push to main. If you've already pushed in step 2f, it's running now — go to the **Actions** tab and watch it. If not, push something:

```bash
git commit --allow-empty -m "Trigger deploy"
git push
```

Wait ~2 min for the build + deploy to finish (green check on both jobs).

### 3d. Visit the deployed app

<https://jeffbtruitt-git.github.io/finance-app/>

You should see the login screen. Log in. Should look identical to localhost.

### 3e. Auth redirect setup (one-time)

Supabase's auth flow needs to know where to send password-reset emails. In Supabase:

1. **Authentication → URL Configuration**.
2. **Site URL**: `https://jeffbtruitt-git.github.io/finance-app/`
3. **Redirect URLs**: add both
   - `http://localhost:5173/finance-app/reset-password`
   - `https://jeffbtruitt-git.github.io/finance-app/reset-password`

This isn't strictly needed for sign-in (which uses email/password directly), but it makes password reset work in both environments.

**Drop 3 done. Phase 1 complete.**

---

## What's *not* in Phase 1 (intentional)

- **CSV import**: comes in Phase 2 along with the rule engine.
- **Excel seed**: also Phase 2 — same parsing infrastructure as imports.
- **Reports, budget editor, dashboard cards**: Phases 3–5.
- **Bulk edit on the grid** (multi-select + assign): Phase 2.
- **Generated TS types from your DB schema**: hand-rolled minimal types for now in `src/types/database.ts`. Switch to `npx supabase gen types typescript` output when it starts pinching.

## Working with Cursor day-to-day

Now that the codebase exists, Cursor can see all of it. The kinds of things to send to Cursor:

- "The Discover chip should be green when active, not slate" — visual tweak, give it the screenshot.
- "Browser console says `Cannot read properties of undefined (reading 'name')`" — paste the stack trace.
- Any single-file edit where the change is obvious from context.

Bring back to me:

- Schema changes (we want to update the master plan in lockstep).
- New parsers for banks not in the master plan.
- Anything where you want a written explanation of trade-offs.

---

## Common gotchas

**"Missing Supabase env vars" on `npm run dev`** — `.env.local` either doesn't exist or has typos. Vite reads it on server start; if you edit it, restart the dev server.

**Login works but transaction grid is empty** — the seed didn't link your auth user to the household. Re-check the UUIDs in `02_seed_minimal.sql`. Run this in the SQL Editor:
```sql
select * from tf_household_members where user_id = (select id from auth.users where email = 'your@email.com');
```
If empty, the UUID was wrong.

**"new row violates row-level security policy"** — the RLS policies are working, you just don't have a household membership row. Same fix.

**404 on `https://jeffbtruitt-git.github.io/finance-app/transactions` after a hard refresh** — should be handled by the `404.html` fallback in the workflow. If not, check that the workflow ran successfully and that `dist/404.html` exists in the deployed artifact.

**Asset loads 404 in dev** — make sure the dev server is at `localhost:5173`, not `localhost:5173/finance-app`. The `base` config only kicks in for production builds.
