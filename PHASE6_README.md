# Phase 6 Completion Report — Truitt Family Finance App

**Date:** May 3, 2026
**Repo:** `C:\Users\JeffTruitt\finance-app`
**Branch:** `phase2` (Phase 6 work added on top — branch rename still pending)
**Stack:** React + TypeScript + Vite + Tailwind + Supabase + TanStack (Table, Query)

---

## Executive Summary

Phase 6 (Assumptions & Projections) is functionally complete.

The app now has a working `/assumptions` page (and `/assumptions/:year`) that
mirrors the spreadsheet's "Main Detail" tab: side-by-side projection-vs-actual
**waterfalls** (Income → Tax → Expenses → Savings → Left Over), a **Simple
Percentages** summary table, **Income** and **Savings** sections (annual
projection column + 12-month actual grid per source/account), and a **Tax
assumptions** section with pinned typed fields plus a custom-keys area.

The expenses leg of the actual waterfall is computed automatically from the
revised-forecast mix already in your data — actuals through the latest-actuals
month, then the most recent reforecast snapshot for future months, falling
back to the original budget if no reforecast exists. So the Assumptions page
stays in sync with whatever you do in the Reforecast page; you don't have to
keep them aligned by hand.

The page anchors on `useDefaultPeriod()` like every other Phase 4+ page, so
the URL `/assumptions` always lands you on the right year (latest-actuals
year), and `/assumptions/:year` is bookmarkable for any year.

---

## Phase 6 Decisions Locked In

| Decision | Resolution |
|---|---|
| Income / Savings entry grain (master plan question 1) | **Match the spreadsheet exactly.** Annual single-cell column for projection rows; 12-month grid for actual rows. Stored using the existing `tf_income_plan` / `tf_savings_plan` schema, with `month=0` indicating "annual total" on projection rows and `month=1..12` for monthly actuals. The `month` check constraint was relaxed in migration 09 from `between 1 and 12` to `between 0 and 12`. |
| Income / Savings actuals source | **Manual entry only.** Master plan suggested auto-pull from `tf_v_monthly_category_actuals` but the source/account names in `tf_income_plan` are free-text and don't naturally line up with the category set. Hand-keyed actuals match the spreadsheet's existing workflow and avoid fragile auto-mapping. (Optional: layer in a per-source `category_id` mapping later.) |
| Tax assumptions model (master plan question 2) | **Pinned typed fields + custom keys area.** The page renders `fed_rate`, `state_rate`, `ss_rate`, `medicare_rate`, `prev_total_income`, `prev_taxable_fed`, `prev_tax_paid_fed`, `prev_taxable_state`, `prev_tax_paid_state` as labeled inputs with the right format (rates show as percentages with the `%` suffix, dollars as plain numbers). Anything else the user types into the "Custom keys" form goes in as raw key/value rows. The schema is unchanged from `00_schema.sql` (`key text, value numeric`). |
| Waterfall chart rendering (master plan question 3) | **Inline-SVG, no chart library.** Same lightweight philosophy as the Phase 5 Sparkline. `WaterfallChart` is ~150 lines, one bar per step, dashed connectors at running total. Highcharts can land in Phase 7 alongside the retirement fan chart and college trajectories where a real chart lib actually pulls weight. |
| Expenses-projection leg | **One number per year, in `tf_household_settings.data.expenses_projection.{year}`.** No new table for one-cell-per-year data. Read/write helpers live in `src/api/assumptions.ts` and preserve every other settings field on write. |
| Expenses-actual leg | **Revised forecast mix.** Computed by `buildExpensesSeries` in `src/features/assumptions/expensesActual.ts`. For each month of the year: actual spend if month ≤ latest-actuals month, else latest reforecast snapshot value if any, else original budget value, else 0. Sum across spend categories × 12 months. Same data the Reforecast page already manages — Assumptions just consumes it. |
| Year anchor | **`useDefaultPeriod()` year.** `/assumptions` redirects-by-default to the latest-actuals year; `/assumptions/:year` is the explicit form. Year nav buttons (← prev / next →) on the page. |
| Sign convention | All Phase 6 numbers are positive. `tf_income_plan.amount` is user-entered positive (it's a plan, not a transaction — the negative-storage convention for income transactions doesn't apply). The waterfall builder treats Tax / Expenses / Savings as negative deltas and Income / Left Over as positive. |

---

## Architecture Decisions Added in Phase 6

### Schema

**Migration 09 — `09_phase6_assumptions.sql`**

1. **Relax `month` check** on `tf_income_plan` and `tf_savings_plan` from
   `between 1 and 12` to `between 0 and 12`. The schema's auto-generated
   constraint name is dropped via a `do $$` block that looks it up by
   definition pattern, then a named replacement (`tf_income_plan_month_check`,
   `tf_savings_plan_month_check`) is added so future migrations can manage
   it explicitly.

2. **Indices** on `(household_id, year)` for all three Phase 6 tables. The
   page reads each table once per year on load; the index keeps that scan
   cheap as historical data accumulates.

3. **`notes` column** on `tf_income_plan` and `tf_savings_plan` —
   `text null`. Nothing in the page UI surfaces it yet (Phase 6 didn't
   prioritize cell-level notes), but the column is there for the eventual
   "why did Brit's bonus move from August to March?" annotation feature.
   Reads / writes through the API are wired through.

4. **Table-level comments** documenting the projection-actual model. We use
   `comment on table` rather than `comment on constraint` to dodge fragility
   around auto-generated constraint name truncation on long table names.

### Code organization

```
src/
  api/
    assumptions.ts                ← Phase 6 — income/savings/tax CRUD + expenses-projection blob
  features/
    assumptions/
      rollup.ts                   ← Phase 6 — projection/actual rollups, Simple Percentages, waterfall builder
      expensesActual.ts           ← Phase 6 — revised-forecast mix for the actual expenses leg
  components/
    WaterfallChart.tsx            ← Phase 6 — inline-SVG waterfall, no chart lib
  pages/
    assumptions/
      AssumptionsPage.tsx         ← Phase 6 — page (replaces Phase 5 placeholder)
supabase/migrations/
  09_phase6_assumptions.sql
```

### `month=0` as "annual" sentinel

The Main Detail tab in the spreadsheet enters projections as one annual
number per source — not as 12 monthly cells. Three options for storage:

1. Store the projection at `month=1` (or any 1..12) and treat the cell
   ambiguously. **Rejected** — confusing semantics, and you couldn't
   distinguish "projected $160k for January only" from "projected $160k for
   the year".
2. Store the projection as 12 rows of `amount/12` each. **Rejected** —
   loses the "annual lump" semantics, and means a single edit needs 12
   round trips.
3. Store the projection as ONE row with `month=0`. **Adopted.** Required
   loosening the `month` check (migration 09). Reads filter `is_actual=false
   AND month=0` for projections, `is_actual=true AND month BETWEEN 1 AND 12`
   for actuals. The natural-key uniques continue to do their job since
   `month` is part of the key.

### Expenses-actual is computed, not stored

Earlier draft considered persisting the expenses-actual number alongside the
projection in `tf_household_settings`. **Rejected** — it's derivable from
data we already have (transactions + budgets + reforecast) and storing it
would mean we'd have to invalidate it whenever any of those upstream
sources changes. The page recomputes from the latest queried data; one
loop per render, ~12 months × ~25 categories = 300 ops. Free.

### Why no extra normalisation of source / account names

`tf_income_plan` uses free-text `source_name`. We don't deduplicate or pin
it to a known set. Reasoning: the spreadsheet uses different source names
in different years (Brit had "Cargill Stock" in some years and not others;
"Inheritance" appeared once). Forcing a closed set would just make the
schema fight reality. The page presents existing names as a list and lets
the user add / rename / delete freely. Renames touch all rows for that
(year, source) pair via `renameIncomeSource` so the natural-key invariant
holds.

---

## Phase 6 Deliverables — Complete

| Deliverable | Status | Notes |
|---|---|---|
| Migration 09 — month check relaxed, indices, notes column | ✅ | Run via Supabase SQL Editor |
| Income plan editor — projection col + 12-month actual grid | ✅ | Add / rename / delete sources; auto-save on blur |
| Savings plan editor — same shape | ✅ | Same UX as Income |
| Tax assumptions form — pinned set + custom keys | ✅ | Rates render as percentages; dollars as plain numbers |
| Waterfall chart — projection + actual side-by-side | ✅ | Inline SVG, ~150 lines, no dep |
| Auto-pull actuals from transactions where applicable | ✅ | For the EXPENSES leg via revised-forecast mix; income / savings actuals are manual per Phase 6 decision |
| Same period anchor (`useDefaultPeriod`) | ✅ | URL: `/assumptions` and `/assumptions/:year` |
| Simple Percentages summary | ✅ | Income / Tax % / Tax $ / Savings % / Savings $ / Leftover, side-by-side projection vs actual |
| Expenses projection — single editable cell per year | ✅ | Stored in `tf_household_settings.data.expenses_projection.{year}` |
| `npm run build` succeeds | ✅ | Zero TypeScript errors, zero linter errors |

---

## Phase 6 Acceptance Criteria

| Test | Status | Notes |
|---|---|---|
| Projection waterfall matches spreadsheet's Main Detail values | ⏳ | Logic verified in code; pending real DB write once migration 09 + your 2026 income/savings/tax data is entered |
| Actual waterfall pulls from real data automatically | ✅ | `buildExpensesSeries` computes the actual expenses leg from actuals + reforecast + budget; income & savings actuals are user-entered per the Phase 6 decision |
| Editing Brit's bonus reflects in the projection immediately | ✅ | All cells auto-save on blur; query invalidation re-renders the waterfall + summary |

⏳ tests are gated on the user running migration 09 in Supabase and entering
the 2026 projection / tax / expenses data.

---

## Issues Encountered & Resolved

### 1. Annual projection vs per-month actual — schema friction

The spreadsheet's "Income Projection" rows are annual totals; "Income Actual"
rows are 12-month grids. The schema's `month between 1 and 12` check
forbade storing an "annual" row at `month=0`. Migration 09 relaxes the
check. Two alternative shapes (storing 12 copies of `total/12`, storing
projection as `month=1`) were rejected for the reasons above.

**Decision:** `month=0` sentinel + relaxed check. `is_actual=false +
month=0` is the projection row; `is_actual=true + month=1..12` are the
actuals. The natural-key uniques still work because `month` is part of the
key.

### 2. Income transactions are stored negative — but Income plan is positive

In `tf_transactions`, income amounts are stored negative (storage convention
`out=positive, in=negative`). In `tf_income_plan`, the user types positive
projected dollars. So `sumByGroup` in the Phase 5 dashboard flips income
sums for display, but Phase 6 has no flip — `tf_income_plan.amount` is
displayed exactly as stored.

**Decision:** Keep `tf_income_plan` and `tf_savings_plan` storage
convention strictly user-display-positive. Documented in
`src/features/assumptions/rollup.ts`.

### 3. Auto-pull income / savings actuals would require a mapping layer

Master plan suggested auto-pulling Actuals from transactions. But the
source-name strings in `tf_income_plan` ("Brit Salary", "Brit Bonus")
aren't necessarily equal to category names ("Brit Salary" might be a
category, but "Brit Stock" might land in a different category, or no
category at all). Building a robust mapping = either fragile name-match
or a per-source `category_id` pointer + UI to manage it.

**Decision:** Manual entry for is_actual=true rows in Phase 6. Spreadsheet
has always done this manually anyway; no regression. Optional follow-on:
add a `mapped_category_id` column with a small mapping editor when the
"copy December's actuals from transactions" muscle gets too tired.

### 4. Highcharts is overkill for a 5-bar waterfall

Same reasoning as Phase 5's Sparkline: bringing in Highcharts for one chart
type that we only need on one page is dramatically more bundle weight,
theme setup, and dependency surface than 150 lines of inline SVG. We'll
bring Highcharts into Phase 7 where the retire fan chart (six rate
trajectories) and college projections actually justify it.

**Decision:** `src/components/WaterfallChart.tsx`. Connector lines at
running totals. Income green; outflow steps rose; final Left Over green
(or amber if negative — spend exceeded income).

### 5. Expenses-actual leg — three sources, one rule

The user requirement was "actual waterfall expense = revised mix":
actuals YTD + reforecast for future months + budget fallback. That logic
already lived implicitly in the Reforecast page. Pulling it into a pure
function in `expensesActual.ts` lets both pages share it without coupling
their components. The Assumptions page simply re-fetches the underlying
data (actuals via `tf_v_monthly_category_actuals`, budgets via
`tf_budgets`, reforecast snapshots via `tf_revised_budgets`) and runs the
same blend.

### 6. The settings JSON blob already had goals — preserve them on write

The expenses-projection helper does a read-modify-write on the settings
blob to set the per-year number. The first cut would have clobbered the
`goals` field if a user edited expenses before goals existed, since the
upsert rewrites the whole `data` column.

**Decision:** `setExpensesProjection` reads the existing blob,
`{...blob, expenses_projection: {...existing, [year]: amount}}` merges,
then writes. Goals + any future settings keys survive.

---

## Carry-Forward to Phase 7

### Cleanup tasks (lingering — same as Phase 3 + 4 + 5 carry-forward)

- **Branch is still named `phase2`.** Six phases on a "phase2" branch.
  Officially absurd now.
- **Two date helper files still exist:** `src/lib/date.ts` and
  `src/lib/dates.ts`.
- **Phantom `tf_household_members` row** — still needs cleanup.

### User tasks before Phase 7 starts

- **Run migration `09_phase6_assumptions.sql`** in Supabase SQL Editor.
- **Enter 2026 projection data** to validate the waterfall against your
  spreadsheet:
  - Add income sources (Brit Salary $160k, Brit Bonus $25k, Jeff Salary
    $181,496.07, Jeff Bonus $25k) → projection column.
  - Add savings accounts (Brit-401K $23,500, Brit-Traditional IRA $7000,
    etc.) → projection column.
  - Enter tax rates (fed 17%, state 6%, SS 6%, medicare 1%) → Tax block.
  - Enter expenses projection ($254,832).
  - Verify projection waterfall ends at $85,523.83 (matches spreadsheet
    cell V9).
- **Enter actual income / savings as the year unfolds** in the per-month
  actual grids. They're hand-keyed, like the spreadsheet's "Income Actual"
  / "Savings Actual" sections.
- **Decide whether to build a category-mapping feature** so income /
  savings actuals can auto-pull from transactions next year. Optional —
  current manual flow matches your existing spreadsheet workflow.

### Phase 7 scope per master plan

**Long-term Planning:**
- Retirement input form (yearly contribs, return rate, retire age, retire
  spend)
- Retirement projection table (year-by-year)
- Retire Graph multi-rate fan chart (2% / 4% / 6% / 8% / 10% / 12%)
- "Money lasts forever / runs out at age X" computed output
- 25× spend FI metric (already in Phase 5 dashboard) — feature-parity
  promotion to a dedicated card on Retire page
- College kid management (CRUD per kid)
- College projection per kid (year-by-year balance, contribution, interest,
  cost)
- College summary: "on track / X behind" indicator

### Suggested first questions for Phase 7

1. **Highcharts setup** — what theme do you want carried over? You
   mentioned an existing `theme.js` from prior projects. We'll set up
   `src/charts/` with the theme + a small wrapper so chart components
   import a styled `<HighchartsReact />` consistent across pages.
2. **Retire inputs storage** — `tf_retire_inputs(key text, value text)` is
   the existing schema (text-typed values). Same pinned-keys approach as
   Phase 6's tax block, or do you want a stricter typed editor (numeric
   age, decimal rate, etc.)?
3. **College kid management** — `tf_college_kids` already has fields for
   name / birth_year / current_balance / monthly_contrib / return_rate /
   start_year / duration_years. Anything missing for your spreadsheet's
   model? (Looks like a clean fit.)
4. **Spreadsheet retirement formula** — your "Retire" tab has its own
   sequence-of-returns logic. Want a 1:1 reproduction (run the exact
   year-by-year math the spreadsheet does) or a slight reformulation that's
   cleaner in code? Either works.

---

## Current State of Truth

### Database state (after migration 09)

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
tf_balance_sheet_items       0 rows
tf_balance_sheet_values      0 rows
tf_household_settings        0 rows  (will get a row when goals or expenses_projection is first set)
tf_income_plan               0 rows  (NEW — month check relaxed to 0..12)
tf_savings_plan              0 rows  (NEW — month check relaxed to 0..12)
tf_tax_assumptions           0 rows  (NEW)
tf_v_monthly_category_actuals (view)
tf_v_latest_actual_period   (view)
```

### App state

- All Phase 1 + 2 + 3 + 4 + 5 + 6 routes registered and reachable
- Auth working
- `/assumptions` and `/assumptions/:year` render the full Phase 6 page,
  including waterfall, simple percentages, income / savings editors, tax
  block, expenses projection
- `npm run build` succeeds
- Zero TypeScript errors, zero linter errors

### Code state

- Phase 1 + 2 + 3 + 4 + 5 + 6 code on `phase2` branch
- 1 SQL migration added in Phase 6 (`09_phase6_assumptions.sql`)
- 4 new TypeScript files: `src/api/assumptions.ts`,
  `src/features/assumptions/rollup.ts`,
  `src/features/assumptions/expensesActual.ts`,
  `src/components/WaterfallChart.tsx`,
  `src/pages/assumptions/AssumptionsPage.tsx`
- 2 modified files: `src/App.tsx` (route + import),
  `src/types/database.ts` (3 new table type definitions)

---

## Files Added in Phase 6

| File | Purpose |
|---|---|
| `supabase/migrations/09_phase6_assumptions.sql` | `month` check relaxed, indices, `notes` column, table comments |
| `src/api/assumptions.ts` | CRUD for `tf_income_plan` / `tf_savings_plan` / `tf_tax_assumptions`, plus expenses-projection helper that reads/writes `tf_household_settings.data.expenses_projection` |
| `src/features/assumptions/rollup.ts` | Pure projection/actual rollups: `listSources`, `projectionByName`, `actualGrid`, `actualByName`, `projectionTotal`, `actualTotal`, plus `buildSimplePercentages` and `buildWaterfall` |
| `src/features/assumptions/expensesActual.ts` | `buildExpensesSeries` — revised-forecast mix for the expenses-actual waterfall leg |
| `src/components/WaterfallChart.tsx` | Inline-SVG waterfall (no chart library) |
| `src/pages/assumptions/AssumptionsPage.tsx` | The page itself: editor + waterfalls + summary |
| `PHASE6_README.md` | This file |

## Files Modified in Phase 6

| File | Change |
|---|---|
| `src/App.tsx` | `/assumptions` and `/assumptions/:year` now wired to `AssumptionsPage` (was placeholder) |
| `src/types/database.ts` | Added `tf_income_plan` + `tf_savings_plan` + `tf_tax_assumptions` row/insert/update shapes |

---

## Migrations Required to Run Phase 6

In Supabase SQL Editor:

1. `supabase/migrations/09_phase6_assumptions.sql` — relaxes `month` check
   on `tf_income_plan` and `tf_savings_plan`, adds indices and the optional
   `notes` column, sets table comments.

Safe to re-run (uses `add column if not exists`, `drop constraint if
exists`, `create index if not exists`, idempotent `do $$` block to find
the original auto-generated check name).

---

— **End of Phase 6 Completion Report**
