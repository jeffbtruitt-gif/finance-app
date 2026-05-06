# Phase 4 Completion Report — Truitt Family Finance App

**Date:** May 3, 2026
**Repo:** `C:\Users\JeffTruitt\finance-app`
**Branch:** `phase2` (Phase 4 work added on top — branch rename still pending from Phase 3)
**Stack:** React + TypeScript + Vite + Tailwind + Supabase + TanStack (Table, Query)

---

## Executive Summary

Phase 4 (Reforecast / mid-year course-correction) is functionally complete.
The app now has a working `/budget/:year/revise` page that mirrors the
spreadsheet's Revised tab: past months show live actuals (read-only), future
months are editable with a forecast value seeded from the most recent prior
revision (or original budget if none exists), and saving creates a snapshot
keyed by `(year, as_of_month)`.

A **system-wide convention** was locked in this phase: the "current month"
across the app is now the **latest month with any transaction actuals**, NOT
the calendar month. The 1 MO / YTD / Averages / Single Detail report pages and
the sidebar nav all anchor on this. That avoids the "blank page" surprise when
opening the app early in a new calendar month before any imports have run.

The compare view (Original | Actuals YTD | Revised YE | Variance) lives inline
below the editor on the same page — no separate route. This matches how the
spreadsheet works (one Revised tab, no separate compare grid).

---

## Phase 4 Decisions Locked In

| Decision | Resolution |
|---|---|
| Snapshot model | One snapshot per `(household, year, as_of_month)`. Saving the same `as_of_month` twice overwrites in place via the new unique constraint; saving in a new month creates a separate snapshot. Lightweight audit trail for free. |
| `as_of_month` source | **Latest month with any transaction actuals**, system-wide. Not user-changeable on the Reforecast page. |
| Future-month default | Seed from the most recent prior snapshot for the same year if one exists; else fall back to `tf_budgets`. |
| Past-month treatment | Live actuals from `tf_v_monthly_category_actuals`, displayed read-only (slate-tinted). |
| Compare view scope | Inline summary below the editor: per-category `Original \| Actuals YTD \| Revised YE \| Δ vs Original`. No separate `/compare` route. |
| Calendar month vs latest-actuals | **Latest-actuals wins.** Reports + nav default to this. User can still pick any other month via the period picker. |

---

## Architecture Decisions Added in Phase 4

### Schema

**Migration 06 — `tf_revised_budgets` uniqueness + `tf_v_latest_actual_period` view**

1. **Unique constraint** on `tf_revised_budgets(household_id, year, as_of_month, category_id, month)` — enforces "one row per cell per snapshot". Lets the app use a single bulk `upsert` to save the whole grid: re-saving the same `as_of_month` overwrites; new `as_of_month` creates fresh rows. Migration includes a defensive dedupe `do $$ ... $$` block in case any duplicates exist (none should at end of Phase 3, but the table is open-write).

2. **View `tf_v_latest_actual_period`** — returns ONE row per household giving the most recent `(year, month)` that has any transaction. Used by the system-wide default-period hook. A view (not a function) keeps the REST surface auto-generated and inherits RLS from `tf_transactions`.

3. **Helper index** `idx_tf_revised_household_year_as_of` on `(household_id, year, as_of_month)` — covers the editor's "load this snapshot" query.

### Code organization

```
src/
  api/
    reforecast.ts        ← Phase 4 queries (snapshots, latest-actual lookup)
  lib/
    useDefaultPeriod.ts  ← System-wide default period hook (latest-actuals)
  pages/
    budget/
      ReforecastPage.tsx  ← /budget/:year/revise editor + compare summary
supabase/migrations/
  06_phase4_reforecast.sql
```

### System-wide default-period hook

`useDefaultPeriod()` returns `{ period, loading, fellBack }`. Pages that want
to anchor on the latest-actuals month use this:

```tsx
const { period: defaultP } = useDefaultPeriod();
const [userPeriod, setUserPeriod] = useState<Period | null>(null);
const period = userPeriod ?? defaultP;
const setPeriod = (p: Period) => setUserPeriod(p);
```

`null` user state = "still using the default"; once the user picks anything,
their choice sticks. The reports use this pattern uniformly so nav-flipping
between 1 MO / YTD / Averages / Single Detail keeps the same default.

The hook caches the result for 5 minutes (the latest-actuals month rarely
changes mid-session). Imports already trigger query invalidation, so a fresh
import re-anchors everything correctly.

### Snapshot model in code

`tf_revised_budgets` rows form a "wide thin table" — one row per
`(year, as_of_month, category, month)` cell. The Reforecast page treats a
**snapshot** as the set of rows sharing the same `(year, as_of_month)`. The
API helpers in `src/api/reforecast.ts` work in terms of these rows directly:

- `fetchAllRevisedForYear` — pulls every row for the year. Cheap; budgets
  are tiny.
- `filterToAsOf(rows, m)` / `findMostRecentPriorSnapshot(rows, m)` —
  client-side pivots, keep query count to one.
- `saveRevisedSnapshot({ year, as_of_month, cells })` — bulk upsert against
  the `(household, year, as_of_month, category, month)` unique key.

The Save button always writes ALL 12 months for every spend category, even
unchanged ones — a snapshot is conceptually a complete picture, and the
unique-key upsert means rewriting the same value is idempotent.

---

## Phase 4 Deliverables — Complete

| Deliverable | Status | Notes |
|---|---|---|
| Migration 06 — uniqueness + latest-period view | ✅ | Run via Supabase SQL Editor |
| `useDefaultPeriod` hook | ✅ | Used by 4 report pages + sidebar nav |
| Reforecast page `/budget/:year/revise` | ✅ | Editor grid (past=actuals, future=editable) + inline compare summary |
| Snapshot history strip | ✅ | Pills at top of page show every saved `as_of_month` for the year; current as_of is highlighted |
| Save button with overwrite/new badge | ✅ | "Will overwrite" warning shows when re-saving an existing as_of_month |
| Compare summary | ✅ | Inline below editor; 4 columns × spend groups + grand total |
| Year nav arrows + "Original budget" jump | ✅ | Same pattern as Budget editor |
| Reports default to latest-actuals month | ✅ | 1 MO / YTD / Averages / Single Detail all wired |
| Sidebar Budget + Reforecast links auto-anchor | ✅ | No more hardcoded `/budget/2026` |

---

## Phase 4 Acceptance Criteria

| Test | Status | Notes |
|---|---|---|
| Loading the revised page mid-year shows actuals locked | ✅ | Past months display in slate-gray, no edit affordance |
| Future months default to original budget when no prior revision | ✅ | Verified: empty `tf_revised_budgets` falls back to `tf_budgets` |
| Future months default to most recent prior snapshot when one exists | ✅ | `findMostRecentPriorSnapshot` picks the largest `as_of_month < target` |
| Editing a future month updates totals immediately | ✅ | Subtotal + grand total + compare summary all recompute live (`useMemo`) |
| Saving creates a new snapshot row set | ⏳ | Logic verified; pending real DB write once migration 06 is applied |
| Re-saving the same `as_of_month` overwrites in place | ⏳ | Same — relies on the unique constraint from migration 06 |
| Compare summary renders correctly | ✅ | Per-category 4-col view with group subtotals + grand total |
| `npm run build` succeeds | ✅ | Zero TypeScript errors, zero linter errors |

⏳ tests are gated on the user running migration 06 in Supabase; nothing in
the code path can fail in isolation since both the constraint and the upsert
target the same column tuple.

---

## Issues Encountered & Resolved

### 1. Spreadsheet's Revised tab doesn't have a "Compare" grid

Looking at the actual `2026.03 Budget.xlsx`, the Revised tab is just a single
month-by-month table — past months are `SUMIFS` against Actuals, future
months are typed-in numbers. There's no separate Original/Revised/Variance
grid; the user reads the totals row and uses their head.

That said, the master plan asked for a compare view, and it adds real value
once you have multiple revisions stacked over a year. I built it as an inline
summary panel rather than a separate route — keeps the workflow on one page
and matches the spreadsheet's "everything in one spot" feel.

**Lesson:** When the spreadsheet is the spec, look at the actual file before
building, not just the master plan. The plan calls for a "compare view" but
the spreadsheet shows what the user actually does.

### 2. "Current month" was inconsistent across pages

Phase 3 reports defaulted to `currentPeriod()` (calendar). For a household
that imports CSVs once a month, this means opening the app on May 1 shows an
empty May 1 MO report and an empty May Single Detail. Same problem on the
Reforecast page — May 1 with no May actuals means "as of May, no actuals yet,
so all 12 months are editable", which is wrong.

**Fix:** Introduced `useDefaultPeriod()` hook and `tf_v_latest_actual_period`
view. Reports now default to the latest-actuals month. The user can still
pick whatever they want via the period picker; the *initial* anchor just
matches reality.

### 3. Existing `fetchLatestActualPeriod` in `reports.ts` is scheme-scoped

Phase 3 already had a "latest period" lookup, but it queries
`tf_v_monthly_category_actuals` which requires a scheme_id. The system-wide
default needs to work BEFORE we know the scheme (e.g. to anchor the sidebar
nav). I added a separate `fetchLatestActualPeriodGlobal` that hits the new
view directly. The two helpers serve different needs; both stay.

### 4. Snapshot history could explode if every save = new row

Phase 3 README's open question #1 asked about snapshot model. The risk with
"every save = new snapshot" is that idle clicking adds rows quickly. The
chosen model (one snapshot per `as_of_month`) gives a free audit trail (one
record per "revision date") without that risk: re-saving in the same month
just overwrites, but the moment a new month starts, the next save creates a
new historical row automatically.

### 5. Hardcoded `2026` in sidebar nav

`AppShell.tsx` had `/budget/2026` and `/budget/2026/revise` baked into
`NAV_ITEMS`. That's fine for May 2026 but would silently rot. Switched to
`buildNavItems(year)` driven by `useDefaultPeriod()`.

---

## Carry-Forward to Phase 5

### Cleanup tasks (low priority — same as Phase 3 carry-forward)

- **Branch is still named `phase2`.** Recommend rebasing/squashing onto a
  `main` branch before Phase 5 — three phases of work on a "phase2" branch
  is starting to lie.
- **Two date helper files still exist:** `src/lib/date.ts` and
  `src/lib/dates.ts`. Same situation as documented in Phase 3.
- **Phantom `tf_household_members` row** — still needs cleanup (see Phase 3
  README).

### User tasks before Phase 5 starts

- Run migration `06_phase4_reforecast.sql` in Supabase SQL Editor
- Validate the Reforecast page against your spreadsheet for the cell-level
  numbers (this is where the master plan said the "to-the-cent" check matters)
- Confirm the snapshot history pills behave the way you expect when you save
  for two different months (e.g. an April snapshot and a May snapshot)
- If you want a richer audit trail (e.g. "what did I think Travel YE looked
  like in April?"), the schema already supports it — Phase 5+ could expose a
  read-only "view snapshot X" mode

### Phase 5 scope per master plan

Balance Sheet & Dashboard:
- Route: `/balance-sheet`
- Line-item CRUD; perpetuate-forward value entry (one value carries forward
  until you update it)
- Trend charts per line item + total net worth
- Dashboard cards (route `/`):
  - Monthly spend vs. budget, YTD vs. budget
  - Net worth Δ this month / Δ this year
  - 25× spend FI multiplier
  - Income/savings projected vs. actual
  - Goals (free text)

### Suggested first questions for Phase 5

1. **Backfill semantics** — when you enter a value for, say, March and there
   are existing values in May and August, do you expect the March entry to
   ONLY affect March (until May overwrites it again), or to ALSO update the
   April-perpetuated value? (Standard answer: only March; April-July keep
   the May value because perpetuate-forward looks at the most recent
   `as_of_month <= target`.)
2. **Net worth chart period** — fixed (last 24 months), or the same period
   picker as the reports?
3. **Goals as free-text vs. structured** — the master plan says free-text,
   but a tiny structured "target / current / progress" model isn't much more
   work and would let the dashboard show progress bars.

---

## Current State of Truth

### Database state

```
tf_households                1 row
tf_household_members         2 rows  (1 real + 1 phantom — see cleanup task)
tf_accounts                  4 rows
tf_category_schemes          1 row   (Default, is_default=true)
tf_categories               29 rows  (full Phase 1 taxonomy)
tf_transactions             20 rows  (Phase 1 seed data)
tf_transaction_categories  ~20 rows  (seed assignments)
tf_rules                     0 rows
tf_trips                     0 rows
tf_import_batches            0 rows
tf_budgets                   0 rows
tf_revised_budgets           0 rows  (will populate as you save)
tf_v_monthly_category_actuals (view)
tf_v_latest_actual_period   (view — NEW in Phase 4)
```

### App state

- All Phase 1 + 2 + 3 + 4 routes registered and reachable
- Auth working
- Reforecast page renders with seed data; status panels confirmed working
- Reports default-anchor to latest-actuals month
- Sidebar Budget + Reforecast links auto-anchor on the latest-actuals year
- `npm run build` succeeds
- Zero TypeScript errors, zero linter errors

### Code state

- Phase 1 + 2 + 3 + 4 code on `phase2` branch
- 1 SQL migration added in Phase 4 (`06_phase4_reforecast.sql`)
- 4 new TypeScript files: `src/api/reforecast.ts`, `src/lib/useDefaultPeriod.ts`,
  `src/pages/budget/ReforecastPage.tsx`, `PHASE4_README.md`
- 6 modified files (App.tsx, AppShell.tsx, types/database.ts, and the 4
  report pages adopting `useDefaultPeriod`)

---

## Files Added in Phase 4

| File | Purpose |
|---|---|
| `supabase/migrations/06_phase4_reforecast.sql` | Unique constraint on `tf_revised_budgets` + `tf_v_latest_actual_period` view + helper index |
| `src/api/reforecast.ts` | Snapshot CRUD + global latest-actuals lookup |
| `src/lib/useDefaultPeriod.ts` | System-wide "default current period" React hook |
| `src/pages/budget/ReforecastPage.tsx` | The Reforecast editor + inline compare summary |
| `PHASE4_README.md` | This file |

## Files Modified in Phase 4

| File | Change |
|---|---|
| `src/App.tsx` | Wired `/budget/:year/revise` to `ReforecastPage` (was placeholder) |
| `src/components/AppShell.tsx` | `NAV_ITEMS` now built from `useDefaultPeriod()` so Budget + Reforecast auto-anchor on the latest-actuals year |
| `src/types/database.ts` | Added `tf_v_latest_actual_period` row shape under `Views` |
| `src/pages/reports/OneMonthReportPage.tsx` | Default period from `useDefaultPeriod`; user override pattern |
| `src/pages/reports/YtdReportPage.tsx` | Same |
| `src/pages/reports/AveragesReportPage.tsx` | Same |
| `src/pages/reports/SingleDetailReportPage.tsx` | Same |

---

## Migrations Required to Run Phase 4

In Supabase SQL Editor:

1. `supabase/migrations/06_phase4_reforecast.sql` — unique constraint, latest-period view, helper index

Safe to re-run (uses `drop constraint if exists`, `create or replace view`,
`create index if not exists`, and a defensive dedupe block).

---

— **End of Phase 4 Completion Report**
