# Phase 7 Completion Report — Truitt Family Finance App

**Date:** May 3, 2026
**Repo:** `C:\Users\JeffTruitt\finance-app`
**Branch:** `phase2` (Phase 7 work added on top — branch rename still pending)
**Stack:** React + TypeScript + Vite + Tailwind + Supabase + TanStack (Table, Query)

---

## Executive Summary

Phase 7 (Long-term Planning) is functionally complete.

The app now has working `/retire` and `/college` pages that replace the
spreadsheet's "Retire", "Retire Graph", and "College" tabs. The Retire
page renders a pinned-key input form, a 6-rate fan chart for accumulation,
and a year-by-year sequence-of-returns projection table with a
"money-lasts-forever / runs out at age X" callout. The College page lets
the user CRUD any number of kids and renders a per-kid input row,
projection table, and balance line chart, with on-track / shortfall
indicators per kid and across all kids.

The retirement projection logic mirrors the spreadsheet's "Retire" tab
formulas (Retire!D15:O80) row-for-row: contributions stop at retire age,
spend inflates 2%/yr, taxes are grossed up off net spend, gains apply
half-year-on-half-the-contribution, and SS pays only inside age bands
(72..85.5 for Jeff, 72..88.8 for Brit per the spreadsheet's longevity
assumption). The fan chart mirrors "Retire Graph" (B11:H45) — six
parallel accumulation runs at 2/4/6/8/10/12% growth, no spend modeled.
The college projection mirrors "College" (B36:I58) with one
simplification — instead of a per-grade cost lookup table, each kid
stores a single base annual_cost + cost_inflation rate, projected forward
as `cost × (1 + inflation)^year_offset`.

The FI multiplier (25× T12 spend) was already on the dashboard from
Phase 5; it's now also a dedicated card on the Retire page per the master
plan's "feature-parity promotion" callout.

Inputs are pinned with sensible defaults so a brand-new household sees a
sample chart before any data is entered. The Retire page also surfaces
the household's investable assets from the balance sheet (same equity-
group filter as the dashboard) and offers a one-click button to use that
as the starting balance.

Every page anchors on `useDefaultPeriod()` like every other Phase 4+
page, so the projections always start from the latest-actuals year and
account for partial-year contributions in the first year via the
remaining-months-in-year ratio.

No new chart library was added. The fan chart and line chart are both
inline SVG (~200 lines each), continuing the "earn the right to a chart
lib" philosophy from Phases 5–6. Highcharts can land later if and when
we grow to 3+ chart types or need interactive tooltips.

---

## Phase 7 Decisions Locked In

| Decision | Resolution |
|---|---|
| Highcharts integration (master plan suggested Phase 7) | **Deferred again.** Inline SVG handled both new chart types (FanChart, LineChart) cleanly in <250 lines each. Bringing in Highcharts now would mean a +130KB gzipped bundle hit + theme setup for two more charts. Revisit when we need >3 chart types or interactive tooltips. |
| Retirement input model (master plan question 2 from Phase 6 carry-forward) | **Pinned typed fields + custom keys.** Same pattern as Phase 6's tax assumptions. The page renders 12 pinned inputs (jeff/brit yearly_contrib, return_rate, starting_balance, jeff/brit ss, jeff/brit retire_age, jeff/brit birth_year, retire_spend, retire_tax_rate) with the right format (rates as %, dollars plain, ages/years as integers). The schema (text-typed `value` column on `tf_retire_inputs`) is open to custom keys for future model refinements. |
| Retirement spreadsheet formula (master plan question 4) | **1:1 reproduction.** The Retire projection module's per-year math matches Retire!D15:O80 exactly — same SS age bands, same 2%/yr spend inflation, same gross-up tax formula, same half-year-on-half-the-contribution gains convention. Documented inline in `src/features/retire/projection.ts`. |
| College kid model (master plan question 3) | **Existing schema + 2 columns.** `tf_college_kids` already had name / birth_year / current_balance / monthly_contrib / return_rate / start_year / duration_years. Migration 10 adds `annual_cost` (first-year tuition in today's dollars) and `cost_inflation` (annual inflator). The spreadsheet's per-grade cost lookup model (College!AB:AC) was rejected as overkill — the user already runs MEFA / Schwab projector externally to derive the base number. |
| Per-kid grade lookup table (spreadsheet has College!X:Y mapping age→grade) | **Not migrated.** The grade label was decorative on the spreadsheet (just a column for context). The cost-during-attendance logic comes purely from start_year and duration_years now. If we ever want to label school years as "Freshman / Sophomore / …" we can derive that client-side from the year offset. |
| Default values when no inputs entered | **Show a sample chart anyway.** `RETIRE_DEFAULTS` in `src/api/retire.ts` provides reasonable defaults (Jeff 1987 / Brit 1988 birth years, 7.8% return rate, 65 retire age, $100k spend, 28% tax). College kids default to $30k/yr cost, 5% inflation, 6% return, 4-yr undergrad starting at age 18. Lets the page render usefully on a brand-new install before the user fills anything in. |
| First-year partial-year handling | **Months-left-in-year ratio.** The Retire and College projections both apply `(12 - currentMonth) / 12` to the first year's contributions and gains. Mirrors the spreadsheet's `=12-MONTH(TODAY())` cell in Retire!D13. Ensures a mid-year start doesn't double-count contributions or gains. |
| FI multiplier on the Retire page | **Reuse the Dashboard's logic.** Same `INVESTABLE_GROUPS` filter, same `25× T12 spend` formula. Dashboard kept its card; Retire page adds its own per the master plan. The two should always read the same number for the same household-month. |
| Investable balance auto-pull for `starting_balance` | **One-click suggestion, no auto-overwrite.** The Retire page shows a "Use this as starting balance" button when investable ≠ stored. The user clicks once to bootstrap; after that the field is hand-managed (so they can model "starting balance + 90k cash buffer" like the spreadsheet's Retire!D6 does). |

---

## Architecture Decisions Added in Phase 7

### Schema

**Migration 10 — `10_phase7_long_term.sql`**

1. **Two new columns on `tf_college_kids`:**
   - `annual_cost numeric(12,2)` — projected first-year cost in today's
     dollars. Backfilled with `30000` for any pre-existing rows
     (the table is empty in the live household, but the migration is
     idempotent for environments where it isn't).
   - `cost_inflation numeric(6,4)` — decimal inflation rate, defaulted
     to `0.05` (5%/yr per typical college-cost projector assumption).

2. **Index on `tf_college_kids(household_id)`** — the page reads every
   kid for a household in one round trip; this index keeps that fast as
   kid records accumulate (they don't, but the index is essentially free).

3. **Table-level comments** on both `tf_retire_inputs` and
   `tf_college_kids` documenting the pinned-key model and the simplified
   cost projection. Same `comment on table` rather than
   `comment on constraint` pattern used in Phase 6.

`tf_retire_inputs` was NOT touched — the existing `(household_id, key)`
unique already supports the pinned-keys-with-text-values pattern.

### Code organization

```
src/
  api/
    retire.ts                              ← Phase 7 — pinned-key CRUD + defaults
    college.ts                             ← Phase 7 — kid CRUD
  features/
    retire/
      projection.ts                        ← Phase 7 — sequence-of-returns year-by-year
      fanChart.ts                          ← Phase 7 — 6-rate accumulation series
    college/
      projection.ts                        ← Phase 7 — per-kid year-by-year balance
  components/
    FanChart.tsx                           ← Phase 7 — inline-SVG multi-rate line chart
    LineChart.tsx                          ← Phase 7 — inline-SVG single-series line chart
  pages/
    retire/
      RetirePage.tsx                       ← Phase 7 — replaces /retire placeholder
    college/
      CollegePage.tsx                      ← Phase 7 — replaces /college placeholder
supabase/migrations/
  10_phase7_long_term.sql
```

### Why `value text` on `tf_retire_inputs` instead of `value numeric`

The spreadsheet's Retire tab inputs span three numeric "shapes":
- Rates (0.078, 0.28)
- Ages (60, 65, 53)
- Dollars (180000, 25000)

Storing them all as `numeric` would work, but the column already exists
as `text` from `00_schema.sql`. We keep it that way to:

1. Avoid a destructive `alter column type` migration.
2. Allow future non-numeric keys (e.g. `notes`, `model_assumption_label`)
   without a schema change.
3. Match the Phase 6 tax assumptions pattern, which also uses a key/value
   table where the page enforces type.

The page parses with `Number()` on read; non-numeric values come through
as `NaN` and the page falls back to defaults via `resolvePinnedInputs`.

### `RETIRE_DEFAULTS` rather than empty rows

A brand-new household has zero rows in `tf_retire_inputs`. Without
defaults, the projection would render a 65-year table of zeros
(no growth, no spend, no balance). That's a useless first impression.

`RETIRE_DEFAULTS` ships sensible numbers (Jeff 1987 / Brit 1988 birth,
7.8% return matching the spreadsheet's D5, 65 retire age, $100k spend,
28% tax) so the page renders a meaningful sample chart before the user
types anything. The user's first input overrides the default for that
key only; other keys stay defaulted until touched.

This keeps the Retire page useful as a "play with assumptions" sandbox
even for a household that hasn't done any planning yet.

### Half-year-on-half-the-contribution gains

Both the Retire and College projections use the same averaging trick the
spreadsheet uses: when contributions land throughout the year, the
average dollar earns half a year of growth.

```
gains_y = beg_balance × rate
        + (contribution / 2) × rate    ← contributions earn ½ year
```

For the Retire projection, this also flips to spend in retirement years:
withdrawals exceed contribs, so the spreadsheet does
`IF((G+H+I+J-K-L) < 0, 0, /2)` — only credit the half-year boost if net
inflow is positive. Translated to code in `projection.ts`:

```ts
const netInflow = jeffContrib + britContrib + jeffSs + britSs - spend - taxes;
const adjustedBase = begBalance + (netInflow > 0 ? netInflow / 2 : 0);
interestGains = adjustedBase * inputs.return_rate;
```

This matches the spreadsheet's M-column gains for any year.

### `monthsLeftInFirstYear` as a first-class input

The spreadsheet hardcodes `=12-MONTH(TODAY())` in Retire!D13, which is
the months-after-the-current-month count (e.g. May → 7 months left).
Both the Retire and College projection modules accept this as an option
and apply it to the first year's contributions and gains. Lets a mid-year
start (e.g. running the projection in May 2026 from a 2026 start year)
correctly compute "May–December still has 7 months of contributions and
growth left". Defaults to 12 if not provided.

The page derives this from `useDefaultPeriod`'s month: `Math.max(0, 12 -
period.month)`. Same convention as every other Phase 4+ page that handles
partial years.

### Why FanChart shows the LAST value in the legend

The fan chart's right-side legend shows each rate's color + percentage +
the END balance for that rate. This makes the chart a useful answer to
"how much more do I have at 12% vs 6% over X years?" without needing
to mouse over the lines. Same data the spreadsheet's lookup tables
(Retire Graph!Q11:T16) give you, but inline.

### College page has no period anchor

Unlike Retire (which anchors on `useDefaultPeriod` for the start year),
the College page just uses the calendar/actuals year as `currentYear`
for the projection start and lets each kid's `start_year` (or
birth_year + 18 fallback) set their own attendance window. There's no
"year you're viewing" toggle because college projections cross many
decades and don't need a per-year report. Same as the dashboard's
balance sheet — current state matters most.

---

## Phase 7 Deliverables — Complete

| Deliverable | Status | Notes |
|---|---|---|
| Migration 10 — college_kids extended, indices, table comments | ✅ | Run via Supabase SQL Editor |
| Retirement input form (pinned typed fields) | ✅ | 12 inputs with kind-aware parsing (rate / dollars / age / year) |
| Retirement projection table (year-by-year) | ✅ | 65-year horizon, sequence-of-returns, color-codes the first negative-balance year |
| Retire Graph multi-rate fan chart (2/4/6/8/10/12%) | ✅ | Inline SVG, ~210 lines, no chart lib. Legend shows end-balance per rate |
| "Money lasts forever / runs out at age X" output | ✅ | Header badge, computed from first negative endBalance row |
| 25× spend FI metric promoted to its own card on Retire page | ✅ | Same logic + same investable-asset filter as Dashboard |
| College kid management (CRUD per kid) | ✅ | Add (name + birth year minimum), inline edit on every input, delete with confirm |
| College projection per kid (year-by-year) | ✅ | Start, contrib, interest, cost, end. Color-codes attendance years and shortfall |
| College summary: "on track / X behind" indicator | ✅ | Per-kid badge in the kid section header + an aggregate badge in the page header |
| `npm run build` succeeds | ✅ | Zero TypeScript errors, zero linter errors |

---

## Phase 7 Acceptance Criteria

| Test | Status | Notes |
|---|---|---|
| Retirement projection numbers match the spreadsheet for the same inputs | ⏳ | Logic verified to match Retire!D15:O80 row-for-row in code. Pending real-data verification once user enters their inputs into `tf_retire_inputs` and runs the page side-by-side with the spreadsheet for a one-row spot check |
| Multi-rate fan chart renders all 6 trajectories | ✅ | Default rate set is `[0.02, 0.04, 0.06, 0.08, 0.1, 0.12]`. All six render with distinct colors and an end-balance legend |
| Each kid's college projection matches the spreadsheet | ⏳ | Logic verified vs College!B36:I58 in code. Pending the user adding Cooper / Tucker as `tf_college_kids` rows and comparing the year-by-year table to the spreadsheet's |

⏳ tests are gated on the user running migration 10 in Supabase and
entering retirement / college data.

---

## Issues Encountered & Resolved

### 1. SS age bands look weird (72..85.5 and 72..88.8)

The spreadsheet's I-column formula `IF(AND(E16>72, E16<85.5), $D$7, 0)`
pays SS only in a narrow age window. Rationale (after re-reading the
sheet's notes column): the user's planning assumption is that SS doesn't
pay until age 73 (`>72`) and they don't plan to live past Jeff's 85th
birthday (Brit's slightly higher). It's a longevity hedge, not a real
SS rule.

**Decision:** Preserve the spreadsheet's exact bounds. They're constants
in `projection.ts` (`JEFF_SS_MIN_AGE`, `JEFF_SS_MAX_AGE`,
`BRIT_SS_MIN_AGE`, `BRIT_SS_MAX_AGE`). User can change them later by
editing those constants — they're not in `RETIRE_DEFAULTS` because the
spreadsheet didn't make them user-editable either.

### 2. Tax gross-up vs flat tax

The spreadsheet computes taxes as
`= K/(1-D12) - K` where K is spend and D12 is the tax rate. That's the
gross-up formula: if you need K dollars after tax, you need to withdraw
K/(1-tax) pre-tax, paying K/(1-tax)*tax in tax = K/(1-tax) - K dollars.

A naive "tax = spend × tax_rate" would understate by ~30% on a 28%
bracket. Worth getting right because the projection is sensitive to
this — the difference is ~$30k/yr in withdrawals on $100k retire spend.

**Decision:** Use the gross-up formula exactly:
```ts
spend / (1 - retire_tax_rate) - spend
```
Guarded against division by zero (if `tax_rate >= 1` or `< 0`, fall
back to 0 taxes — it's a misconfiguration, don't crash the projection).

### 3. Default starting balance defaults to 0 — confusing

A brand-new household with no `tf_retire_inputs` rows would see a chart
that starts at $0 and accumulates only contributions. That's
mathematically correct but visually misleading — the user usually
already has a 401k balance.

**Decision:** Show a separate "Investable today" card that pulls from
the balance sheet (same `INVESTABLE_GROUPS` filter as the Dashboard's FI
card) and offers a "Use this as starting balance" button. One click
bootstraps the field; subsequent edits are manual. We do NOT
auto-overwrite — the spreadsheet's `D6` adds a manual `+90000` cash
buffer to its formula, and we want to leave room for the user to do
the same kind of manual adjustment.

### 4. College cost lookup vs base cost

The spreadsheet's "College" tab uses two lookup tables (`AB:AC` for
years-out → cost, `X:Y` for age → grade). Replicating that in code
would mean two new schema tables (or two more JSONB blobs in
`tf_household_settings`) plus UI to manage them.

**Decision:** Reduce to two new columns per kid (`annual_cost` and
`cost_inflation`). The lookup-table approach gives you year-specific
costs (e.g. "freshman year is $52k, senior year is $61k"), but the user
already enters that data into MEFA / Schwab calculator externally to
derive the per-year inflated number. We just need the base. Trade-off
documented in the migration 10 docstring + `api/college.ts`.

If the user wants per-year overrides later, the right shape is a
new `tf_college_year_costs(kid_id, year_offset, cost_override)` table.
Easy to add — until then, the inflated-base-cost model matches every
public college-cost projector.

### 5. "On track" is a weak signal

`onTrack = finalBalance >= 0` is binary. A kid with $1 left at
graduation is "on track" by that rule but the spreadsheet user would
clearly call that "cutting it close". Conversely, $50k surplus is "on
track" but it might be a sign the user is over-saving and could redirect
the contribution.

**Decision:** Keep the binary indicator but supplement with a
"Total tuition cost (nominal): $X" + "Final balance: $Y" line in the
section footer, plus the line chart's below-zero shaded band. The user
can see at a glance whether they're cutting it close or have surplus.
Two-tier UX (green/red badge + numeric context) is enough for now;
"$X cushion" / "$X overshoot" labels can come later if needed.

### 6. fmtUsd showed cents on every line of the projection table

`fmtUsd(123456.78)` returns `$123,456.78` by default. Across a 65-row
projection table that's a wall of decimals nobody reads. The reports
already pass `{ decimals: 0 }` for big-number summaries; we do the same
for projection tables. Fixed inline at every call site in `RetirePage`
and `CollegePage`.

---

## Carry-Forward to Phase 8 (or "App is Done")

### Cleanup tasks (lingering — same as Phase 3 + 4 + 5 + 6 carry-forward)

- **Branch is still named `phase2`.** Seven phases on a "phase2" branch.
  Officially absurd now. Recommend renaming to `main` and merging.
- **Two date helper files still exist:** `src/lib/date.ts` and
  `src/lib/dates.ts`.
- **Phantom `tf_household_members` row** — still needs cleanup.

### User tasks before Phase 7 is "live"

- **Run migration `10_phase7_long_term.sql`** in Supabase SQL Editor.
- **Enter retirement inputs:**
  - Open `/retire`
  - The pinned-defaults render an immediate sample chart so you can see
    the page works
  - Replace each pinned default with your real numbers (Jeff/Brit
    contrib, return rate, retire ages, retire spend, retire tax rate)
  - If your investable balance is in the balance sheet, click "Use this
    as starting balance" to bootstrap that field
  - Verify the projection's "Money at retire age" matches your
    spreadsheet's Retire!H4 cell
- **Enter college kids:**
  - Open `/college`
  - Add Cooper (birth year 2017) and Tucker (birth year 2020) — that's
    the minimum
  - Open each kid's row and enter:
    - current_balance (Schwab balance for that kid's 529)
    - monthly_contrib (650 each per the spreadsheet's `Main Detail!D62`)
    - return_rate (0.06 per spreadsheet `College!C24`)
    - annual_cost (whatever your MEFA projector says — spreadsheet has
      $64,360.95 for Cooper, $54,462.12 for Tucker per `College!C23`,
      `College!M23`)
    - cost_inflation (0.05 default is fine; spreadsheet's column F uses
      similar)
  - Verify each kid's final balance matches your spreadsheet's
    `College!I50` / `College!S60`
- **Optional:** Bring Highcharts in if you want zoomable / hoverable
  charts. The current SVG charts are read-only. Phase 7's chart count is
  2 (FanChart + LineChart) plus Phase 5's Sparkline + Phase 6's
  WaterfallChart = 4 chart types. Still under the "earn the right" bar,
  but the moment we want a 5th chart or interactive features, switch.

### Phase 8 scope (if any)

Master plan declares the spreadsheet "fully retired" at the end of
Phase 7. Anything else is optional polish:

- **Multiple categorization schemes.** Schema is structurally ready
  (Phase 1). Phase 8 would add the scheme management page + scheme
  picker in nav + optional auto-mapping bootstrap. ~1 week.
- **Highcharts migration.** Replace inline SVG with themed Highcharts.
  Same data flow; just swap component implementations. ~3 days.
- **Tax planning page.** The "Tax WH" + "Tax" spreadsheet tabs
  weren't migrated. Could become a `/tax` page with payroll WH details.
- **Bills as a dashboard card.** "Bills" tab is just a list of bill-pay
  URLs. Easy small card.
- **Cash analysis page.** The "Cash" tab is one-off custom queries.
  Now that data is in Postgres, ad-hoc reporting is trivial.

---

## Current State of Truth

### Database state (after migration 10)

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
tf_income_plan               0 rows
tf_savings_plan              0 rows
tf_tax_assumptions           0 rows
tf_retire_inputs             0 rows  (Phase 7 reads via fetchRetireInputs; falls back to RETIRE_DEFAULTS)
tf_college_kids              0 rows  (Phase 7 columns annual_cost / cost_inflation added)
tf_v_monthly_category_actuals (view)
tf_v_latest_actual_period   (view)
```

### App state

- All Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 routes registered and reachable
- Auth working
- `/retire` renders the full Phase 7 Retire page (inputs, fan chart,
  projection table, money-lasts callout, FI multiplier card)
- `/college` renders the full Phase 7 College page (CRUD kids, per-kid
  projection table, line chart, on-track summary)
- `npm run build` succeeds
- Zero TypeScript errors, zero linter errors

### Code state

- Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 code on `phase2` branch
- 1 SQL migration added in Phase 7 (`10_phase7_long_term.sql`)
- 9 new TypeScript files: `src/api/retire.ts`, `src/api/college.ts`,
  `src/features/retire/projection.ts`, `src/features/retire/fanChart.ts`,
  `src/features/college/projection.ts`,
  `src/components/FanChart.tsx`, `src/components/LineChart.tsx`,
  `src/pages/retire/RetirePage.tsx`,
  `src/pages/college/CollegePage.tsx`
- 2 modified files: `src/App.tsx` (route swaps + import),
  `src/types/database.ts` (2 table type definitions)

---

## Files Added in Phase 7

| File | Purpose |
|---|---|
| `supabase/migrations/10_phase7_long_term.sql` | `tf_college_kids` columns + indices + table comments |
| `src/api/retire.ts` | Pinned-key CRUD for `tf_retire_inputs` + `RETIRE_DEFAULTS` + `resolvePinnedInputs` helper |
| `src/api/college.ts` | CRUD for `tf_college_kids` + resolved-getters for nullable columns + defaults |
| `src/features/retire/projection.ts` | `buildRetireProjection` — sequence-of-returns year-by-year mirroring Retire!D15:O80 |
| `src/features/retire/fanChart.ts` | `buildFanChart` — 6-rate accumulation series mirroring Retire Graph!B11:H45 |
| `src/features/college/projection.ts` | `buildCollegeProjection` — per-kid year-by-year mirroring College!B36:I58 |
| `src/components/FanChart.tsx` | Inline-SVG multi-rate line chart with end-balance legend |
| `src/components/LineChart.tsx` | Inline-SVG single-series line chart with below-zero shaded band |
| `src/pages/retire/RetirePage.tsx` | The Retire page itself |
| `src/pages/college/CollegePage.tsx` | The College page itself |
| `PHASE7_README.md` | This file |

## Files Modified in Phase 7

| File | Change |
|---|---|
| `src/App.tsx` | `/retire` and `/college` now wired to `RetirePage` / `CollegePage` (were `<Placeholder>` from Phase 5) |
| `src/types/database.ts` | Added `tf_retire_inputs` + `tf_college_kids` row/insert/update shapes (with `annual_cost` / `cost_inflation` from migration 10) |

---

## Migrations Required to Run Phase 7

In Supabase SQL Editor:

1. `supabase/migrations/10_phase7_long_term.sql` — adds two columns to
   `tf_college_kids`, an index on `(household_id)`, and table comments
   on both Phase 7 tables.

Safe to re-run (uses `add column if not exists`, `create index if not
exists`, and idempotent `comment on` statements).

---

— **End of Phase 7 Completion Report**
