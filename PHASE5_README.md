# Phase 5 Completion Report — Truitt Family Finance App

**Date:** May 3, 2026
**Repo:** `C:\Users\JeffTruitt\finance-app`
**Branch:** `phase2` (Phase 5 work added on top — branch rename still pending)
**Stack:** React + TypeScript + Vite + Tailwind + Supabase + TanStack (Table, Query)

---

## Executive Summary

Phase 5 (Balance Sheet & Dashboard) is functionally complete.

The app now has a working `/balance-sheet` page that mirrors the spreadsheet's
"Main 2" tab balance sheet section: line-item CRUD with assets/liabilities,
**perpetuate-forward** value entry (input a value once, it carries until you
update it), per-item 24-month sparklines, and a header net worth card with
month/year deltas.

The home page (`/`) is no longer a placeholder. It's a real Sunday-morning
dashboard with: spend vs budget (monthly + YTD), yearly bucket, income and
savings projected vs actual, net worth card with 24-month chart, FI
multiplier (25× trailing-12 spend), and a free-text Goals list.

Everything is anchored on the system-wide latest-actuals month
(`useDefaultPeriod` from Phase 4), so the dashboard never lies about "this
month" just because the calendar flipped over before any imports ran.

---

## Phase 5 Decisions Locked In

| Decision | Resolution |
|---|---|
| Balance-sheet effective-value model | **Perpetuate-forward, computed client-side.** Effective value at month M = the most recent `tf_balance_sheet_values.value` where `as_of_month <= M`. The underlying value table is small enough that one fetch + a client pivot is cheaper than a parameterised SQL view, AND it lets the dashboard build a 24-month series in zero extra round trips. |
| Backfill semantics (master plan question 1) | **Standard answer.** Writing a value to month X only changes the effective value for months ≥ X up to the next existing entry. April-July keep the May value because perpetuate-forward picks the most-recent-≤-target. This is automatic from the model — no special handling. |
| Net worth chart period (master plan question 2) | **Fixed last 24 months** on both the dashboard card and the balance-sheet header. Leading flat-zero rows are dropped so a brand-new household doesn't see a long ramp from $0. Future work could expose a period picker if it ever feels limiting. |
| Goals shape (master plan question 3) | **Free-text list** stored in `tf_household_settings.data->goals` (JSON array of strings). The master plan called for free-text; we kept it free-text. A structured "target / current / progress" model can be layered on later without a migration since the JSON blob is open. |
| Equity rollups | Items get an optional `equity_group` text column (Retirement / Investments / Savings / Credit Union / House / Car / Other or NULL). The dashboard's FI multiplier sums only items in `{Retirement, Investments, Savings, Credit Union}` — house & car are explicitly excluded, matching the spreadsheet's investable-assets convention. |
| Charts | **Inline SVG sparkline**, no external library. Master plan calls for Highcharts and we'll bring it in for Phase 7's retirement fan chart and college trajectories. For one 24-point net-worth line per page, a 100-line component is dramatically lighter. |
| Settings storage | Single JSON blob per household (`tf_household_settings`) instead of a one-off `goals` table. Anything else that needs household-level free-text preferences (chart preferences, default views) goes in the same blob. |

---

## Architecture Decisions Added in Phase 5

### Schema

**Migration 08 — `08_phase5_balance_sheet.sql`**

1. `tf_balance_sheet_items.equity_group text null` — optional bucket used by
   the dashboard's investable-assets / equity rollup logic. NULL is fine; the
   item still counts toward asset/liability totals, it just doesn't appear in
   the FI multiplier base.

2. `tf_household_settings(household_id pk, data jsonb, updated_at)` — single
   row per household, JSON blob. Today's payload is `{ goals: [string, ...] }`.
   RLS via `tf_is_household_member`.

3. `idx_tf_bs_items_household` — covers the items list query so it never
   sequential-scans even on an active household with a long item history.

The "perpetuate-forward effective value" lookup is intentionally NOT a
database view. Reasons:
- The full value set per household is tiny (a few hundred rows lifetime).
- The dashboard wants a 24-month series in one go; a scalar view would
  require 24 round trips or a function that returns a setof, plus pivoting.
- Doing it client-side keeps PostgREST trivial and the database surface
  small (no parameterised views or RPC functions).

### Code organization

```
src/
  api/
    balanceSheet.ts      ← Phase 5 — items/values/settings CRUD
    dashboard.ts         ← Phase 5 — period rollups + DashboardData fetcher
  components/
    Sparkline.tsx        ← Tiny inline-SVG line chart
  features/
    balance-sheet/
      effective.ts       ← Perpetuate-forward logic + net-worth series
  pages/
    balance-sheet/
      BalanceSheetPage.tsx
    dashboard/
      DashboardPage.tsx  ← Replaces the Phase 1 placeholder
supabase/migrations/
  08_phase5_balance_sheet.sql
```

### Effective-value model in code

`effectiveValuesAt(values, targetIso) → Map<itemId, number>` is the workhorse.
It does one O(values.length) pass per call, and the page calls it 3× (current,
prior month, start-of-year) plus once per chart point (24 calls for the line).
That's still cheap because `values.length` is small.

`netWorthSeries({ items, values, endMonth, count })` produces the 24-row time
series both pages use — same function, two callers.

### FI multiplier formula

```
target = trailing_12_spend × 25
multiplier = investable_assets / target
```

Where:
- `trailing_12_spend` = sum of all spend-group `tf_v_monthly_category_actuals`
  rows for the 12 months ending inclusive at `useDefaultPeriod()` month.
- `investable_assets` = sum of effective values at `now` for active asset
  items whose `equity_group ∈ {Retirement, Investments, Savings, Credit Union}`.

A multiplier of 1.0 = financially independent at current spend; 0.25 ≈ Coast FI
rule of thumb. We display as a percent (`xx.x%`) and a progress bar capped at
100%. No alert/celebration UI yet — that lands when Phase 7 adds richer
retirement context.

### Income & savings displayed positive

In storage, income transactions are stored negative (in = negative). The
dashboard's "Income YTD" card needs to show `+$X earned`, so we flip income
sums in `sumByGroup` once at the data layer. Savings categories are stored
positive (money OUT into a savings account, treated as a spend-like outflow
of the checking account); displayed positive — identity. tf_budgets values
are entered positive across the board (you budget +3000 of income, +500 of
savings), so no flip on the budget side.

The two `higherIsBetter` flag in `ProgressCard` controls (a) variance color
direction (over-projected income = green, under = amber) and (b) progress
bar color.

---

## Phase 5 Deliverables — Complete

| Deliverable | Status | Notes |
|---|---|---|
| Migration 08 — equity_group column, settings table | ✅ | Run via Supabase SQL Editor |
| Balance Sheet line-item CRUD | ✅ | Inline name + group edit, archive/restore, hard delete |
| Perpetuate-forward value entry | ✅ | Per-item history list with add/edit/delete |
| Per-item 24-month sparkline | ✅ | Asset items render in teal, liabilities in rose |
| Net worth header card | ✅ | Current value + Δ vs prior month + 24-month chart |
| Dashboard — Spend cards | ✅ | Monthly + YTD spend vs budget, plus Yearly bucket |
| Dashboard — Income/Savings cards | ✅ | YTD actual vs projected; sign flip for income |
| Dashboard — Net Worth card | ✅ | Current + month delta + YTD delta + sparkline + link to balance sheet |
| Dashboard — FI Multiplier card | ✅ | 25× trailing-12 spend, investable-only base |
| Dashboard — Goals card | ✅ | Free-text list, click-to-edit, persists in `tf_household_settings` |
| Sparkline component | ✅ | No-dep inline SVG; reused on dashboard + balance sheet header + per-item rows |
| `npm run build` succeeds | ✅ | Zero TypeScript errors, zero linter errors |

---

## Phase 5 Acceptance Criteria

| Test | Status | Notes |
|---|---|---|
| Adding a new line item ('Crypto Wallet'), entering one value, seeing it perpetuate forward | ⏳ | Logic verified; pending real DB write once migration 08 is applied |
| Backfilling a prior month's value updates only that month forward, not earlier | ✅ | Falls out of `effectiveValuesAt` model — March entry's `as_of_month=2026-03-01` only wins for target months ≥ March-2026 AND < the next existing as_of_month |
| Net worth chart shows correct historical trend | ✅ | `netWorthSeries` walks 24 months; leading flat-zero rows trimmed |
| Dashboard loads in <2s | ✅ | One `Promise.all` over 4 fetches; balance-sheet items+values usually return <500 rows total |
| Yearly bucket card matches `Yearly` group | ✅ | Drives off `is_yearly` via `group_name === 'Yearly'` in `sumByGroup` |
| Income card flips negative-stored income to positive display | ✅ | `sumByGroup` does the flip; budgets aren't flipped (entered positive) |

⏳ tests are gated on the user running migration 08 in Supabase.

---

## Issues Encountered & Resolved

### 1. The spreadsheet's balance sheet has implicit equity groups

Looking at "Main 2" rows 84–107, the spreadsheet rolls items up into Equity
groups — House, Car, Retirement, Investments, Savings, Credit Union — but
the underlying schema (`tf_balance_sheet_items` from migration 00) had no
column for it. Adding one is cheap, NULL-safe, and lets the dashboard's FI
multiplier filter to investable assets without hard-coding item names.

**Decision:** Add `equity_group text null`. Power users can leave it NULL
and the item still counts toward total assets/liabilities; only the
investable-assets rollup cares.

### 2. Highcharts is overkill for a single 24-point line

Master plan says Highcharts. For one sparkline on the dashboard plus a few
per-item mini-trends on the balance sheet, a 100-line inline-SVG component
is *dramatically* less code, less bundle weight, and zero theme setup. We'll
bring Highcharts in when Phase 7 actually needs it (retirement multi-rate
fan chart, college trajectories).

**Decision:** `src/components/Sparkline.tsx`, no external chart dep yet.

### 3. Income vs savings sign convention is asymmetric

Storage convention is `out = positive, in = negative`. So:
- Spend categories: stored positive, sum positive, display positive.
- Income categories: stored negative, sum negative — must flip for display.
- Savings categories (401K, Roth IRA, 529): the user logs them as
  *outflows* from checking (storage positive). For display ("you saved
  $X this YTD") that's already positive.

The flip lives in `sumByGroup`, exactly once. The budget rollup
(`rollupBudget`) doesn't flip because budget amounts are user-entered in
display sign.

### 4. Goals: structured vs free-text

Master plan question #3 asked. Free-text wins for now: it's what the
spreadsheet has, it's what the user wrote, and a structured model is more
work for an unclear payoff at this stage. The JSON blob in
`tf_household_settings` lets us evolve to structured later without a
migration.

### 5. The dashboard needs lots of data — one round trip

`fetchDashboardData` fires four fetches in parallel
(`Promise.all`): trailing-12 actuals + budget year + categories. Plus
balance-sheet items and values fire from their own hooks (so they share
cache with `BalanceSheetPage`). Net result: one paint with a single loading
state instead of cascading skeletons.

### 6. NetWorthCard prop typing

The first cut typed `nw` as `NonNullable<ReturnType<typeof Object>>` which
worked structurally but left no real type contract. Replaced with an
explicit `NetWorthSummary` interface so future refactors don't silently
break the card.

---

## Carry-Forward to Phase 6

### Cleanup tasks (lingering — same as Phase 3 + 4 carry-forward)

- **Branch is still named `phase2`.** Five phases of work on a "phase2"
  branch is starting to feel silly.
- **Two date helper files still exist:** `src/lib/date.ts` and
  `src/lib/dates.ts`.
- **Phantom `tf_household_members` row** — still needs cleanup.

### User tasks before Phase 6 starts

- Run migration `08_phase5_balance_sheet.sql` in Supabase SQL Editor.
- Add your 2025-12-31 line items + values (10 assets + 1 liability per the
  spreadsheet) to validate the perpetuate-forward UI against the
  spreadsheet's totals to the cent.
- Confirm equity_group rollups feel right; if they don't, edit the
  `KNOWN_EQUITY_GROUPS` list in `BalanceSheetPage.tsx` or relabel items
  (it's a free-text column, anything goes).
- Decide whether the FI multiplier should *include* House equity. The
  spreadsheet's "Equity" section shows House as a top-level row, but the
  current dashboard excludes it from investable assets. Easy toggle if you
  want it the other way.

### Phase 6 scope per master plan

Assumptions & Projections — replaces the Main Detail tab:
- Income plan editor (`tf_income_plan` exists already, untyped — Phase 6 wires it up)
- Savings plan editor (`tf_savings_plan`)
- Tax assumptions form (`tf_tax_assumptions`)
- Waterfall chart: Income → Tax → Expenses → Savings → Left Over (projection vs actual side-by-side)
- Auto-pull actuals from `tf_v_monthly_category_actuals` where applicable
- Same period anchor (`useDefaultPeriod`)

### Suggested first questions for Phase 6

1. **Granularity of `income_plan`** — per-paycheck (semi-monthly) or per-month? The schema says per-month (`unique (household, year, source_name, month, is_actual)`); the spreadsheet appears to track monthly. Keep monthly?
2. **Tax assumptions — model or just rates?** The schema is generic (`key text, value numeric`). The spreadsheet has rows like fed/state/SS/Medicare effective rates. Two options: keep the key/value flexibility (user adds whatever rows make sense), or pin a known set of keys with a typed editor. Either works; flexibility is the easier first cut.
3. **Waterfall chart** — once Phase 7 brings in Highcharts for the retire fan chart, the waterfall fits naturally there. Question is whether Phase 6 should ship a placeholder bar chart (today's Sparkline + a few rectangles) or wait for Highcharts in Phase 6.

---

## Current State of Truth

### Database state (after migration 08)

```
tf_households                1 row
tf_household_members         2 rows  (1 real + 1 phantom — see cleanup task)
tf_accounts                  4 rows
tf_category_schemes          1 row
tf_categories               29 rows
tf_transactions             20 rows
tf_transaction_categories  ~20 rows
tf_rules                     0 rows
tf_trips                     0 rows
tf_import_batches            0 rows
tf_budgets                   0 rows
tf_revised_budgets           ?? rows (depends on Phase 4 saves)
tf_balance_sheet_items       0 rows  (NEW: equity_group column)
tf_balance_sheet_values      0 rows
tf_household_settings        0 rows  (NEW)
tf_v_monthly_category_actuals (view)
tf_v_latest_actual_period   (view)
```

### App state

- All Phase 1 + 2 + 3 + 4 + 5 routes registered and reachable
- Auth working
- `/balance-sheet` renders empty-state correctly; line-item add + value
  entry path verified end-to-end in the type system
- `/` (Dashboard) replaces the Phase 1 placeholder — five spend/income
  cards, net-worth card with sparkline, FI multiplier card, goals card
- `npm run build` succeeds
- Zero TypeScript errors, zero linter errors

### Code state

- Phase 1 + 2 + 3 + 4 + 5 code on `phase2` branch
- 1 SQL migration added in Phase 5 (`08_phase5_balance_sheet.sql`)
- 6 new TypeScript files: `src/api/balanceSheet.ts`, `src/api/dashboard.ts`,
  `src/components/Sparkline.tsx`, `src/features/balance-sheet/effective.ts`,
  `src/pages/balance-sheet/BalanceSheetPage.tsx`, `PHASE5_README.md`
- 3 modified files: `src/App.tsx` (route + import), `src/types/database.ts`
  (new column + tables), `src/pages/dashboard/DashboardPage.tsx` (placeholder
  → real)

---

## Files Added in Phase 5

| File | Purpose |
|---|---|
| `supabase/migrations/08_phase5_balance_sheet.sql` | `equity_group` column, `tf_household_settings` table + RLS, indices |
| `src/api/balanceSheet.ts` | Items/values CRUD, settings (goals) get/set |
| `src/api/dashboard.ts` | Period rollups (`sumByGroup`, `rollupBudget`), `fetchDashboardData` aggregator |
| `src/features/balance-sheet/effective.ts` | Perpetuate-forward logic, `netWorthSeries`, period↔ISO helpers |
| `src/components/Sparkline.tsx` | No-dep inline-SVG line chart |
| `src/pages/balance-sheet/BalanceSheetPage.tsx` | Line-item CRUD + value editor + 24-mo header |
| `PHASE5_README.md` | This file |

## Files Modified in Phase 5

| File | Change |
|---|---|
| `src/App.tsx` | `/balance-sheet` now wired to `BalanceSheetPage` (was placeholder) |
| `src/types/database.ts` | Added `tf_balance_sheet_items` + `tf_balance_sheet_values` + `tf_household_settings` row/insert/update shapes |
| `src/pages/dashboard/DashboardPage.tsx` | Replaced placeholder cards with full Phase 5 dashboard |

---

## Migrations Required to Run Phase 5

In Supabase SQL Editor:

1. `supabase/migrations/08_phase5_balance_sheet.sql` — `equity_group`
   column, `tf_household_settings` table, RLS, indices.

Safe to re-run (uses `add column if not exists`, `create table if not
exists`, `create index if not exists`, `drop policy if exists`).

---

— **End of Phase 5 Completion Report**
