# Phase 3 Completion Report — Truitt Family Finance App

**Date:** May 3, 2026
**Repo:** `C:\Users\JeffTruitt\finance-app`
**Branch:** `phase2` (Phase 3 work added on top — branch rename pending)
**Stack:** React + TypeScript + Vite + Tailwind + Supabase + TanStack (Table, Query)

---

## Executive Summary

Phase 3 (Reports + Budget) is functionally complete. The app now delivers all four
reports from the master plan (1 MO, YTD, Single Detail, Averages) plus a full
per-category × per-month budget editor with prior-year-average pull buttons.
Sign convention is honored at the display layer (everything shown positive on
spend reports). Group ordering matches the spreadsheet. UX additions surfaced
during testing — error/empty states, hover row-highlight, latest-data-anchored
history grid — are all live.

The hints feature (bank-reported categories driving categorization) was removed
per user decision: Phase 2 had scaffolded it but the feature was deemed
unwanted; the table is dropped, the dry-run path simplified, and the Run Rules
page slimmed accordingly.

A **silent build-blocker from Phase 2** was discovered and fixed during Phase 3:
`tsconfig` had `strict: true` and the build script ran `tsc --noEmit && vite build`,
but the hand-rolled `Database` type in `src/types/database.ts` was missing
`Insert`/`Update`/`Relationships` shapes for most tables. supabase-js v2.105
fell back to typing every table as `never`, which caused dozens of TS errors
on every insert/update/upsert across `phase2.ts`. Phase 2's dev appears to have
run only `npm run dev` and never actually built. **`npm run build` now succeeds
cleanly.**

---

## Phase 3 Decisions Locked In

| Decision | Resolution |
|---|---|
| Budget granularity | Per-category × per-month grid (12 cells per row) |
| Averages basis (summary table) | Rolling 3 / 6 / 12 months ending at the picker-selected month, inclusive |
| Averages basis (history grid) | Anchored on the most recent month with any transaction data, NOT the picker (so empty trailing months don't waste columns) |
| Spend vs. Income/Savings on reports | Reports show spending only — Rent & Utilities, Food & Car, Other, Yearly. Income / Savings / Transfer are excluded; they get their own page in Phase 6 |
| Single Detail period | Three options: single month / YTD / All months of data |
| Source-category hints | **Removed entirely.** No hints feature, no admin page, no DB table. Rules-only categorization. |
| Budget editor auto-fill | Per-row `3 / 6 / 12` buttons (one click pulls prior-year N-month average to all 12 cells). NO bulk "Fill ALL" buttons (deemed too risky / too much overwrite power). |

---

## Architecture Decisions Added in Phase 3

### Schema

**Migration 04 — `tf_v_monthly_category_actuals` view**

Created a database view that aggregates transactions to (household, scheme,
category, year, month) totals. Reports query the view directly instead of
running `GROUP BY` on every page render. Sign convention is preserved (storage
sign, raw); display layer flips when needed.

The view inherits RLS automatically from the underlying tables
(`tf_transactions` + `tf_transaction_categories`), so no separate policy was
needed.

Two helper indexes added:
- `idx_tf_budgets_household_year_cat` — covers the budget editor's full-year fetch
- `idx_tf_transactions_household_date` — speeds up the view's grouping

**Migration 05 — drop `tf_source_category_hints`**

Drops the table created in migration 03. Safe to run on an empty table; no
data loss possible since hints were never inserted.

### Code organization

```
src/
  api/
    reports.ts          ← All Phase 3 queries (actuals, budgets, single-category txns,
                          latest-data-period anchor, default scheme lookup)
  components/
    PeriodPicker.tsx    ← Shared month/year picker (also supports yearOnly mode)
    StatusPanel.tsx     ← Three-style panel (loading / error / empty) for consistent
                          state messaging across pages
  features/
    reports/
      grouping.ts       ← Spend group order + section/grand totals (the spreadsheet's grouping)
  lib/
    period.ts           ← Period helpers: shift, prevN, ytd, fullYear, periodKey
    money.ts            ← (extended) fmtUsd, variance, variancePct, fmtPct, varianceClass
  pages/
    reports/
      OneMonthReportPage.tsx
      YtdReportPage.tsx
      AveragesReportPage.tsx
      SingleDetailReportPage.tsx
    budget/
      BudgetEditorPage.tsx
supabase/migrations/
  04_phase3_reports.sql
  05_drop_source_category_hints.sql
```

### Sign-convention layer

Storage stays `out = positive, in = negative` (matches Actuals).
Reports show all-positive values for spend categories — no flip needed since
spend is already stored positive. The `displaySpend()` helper in `money.ts`
exists as an explicit no-op so future calls (e.g. an Income report in Phase 6)
have a clear place to add the sign flip without retrofitting reports.

### Default-scheme lookup centralized

`fetchDefaultSchemeId(household_id)` lives in `api/reports.ts` and is used by
every Phase 3 page. Phase 2's `RunRulesPage` had its own inline scheme lookup;
left as-is to avoid touching unrelated code, but Phase 4+ should standardize on
the centralized helper.

---

## Phase 3 Deliverables — Complete

| Deliverable | Status | Notes |
|---|---|---|
| Migration 04 — actuals view + indexes | ✅ | Run via Supabase SQL Editor |
| Shared infra (period helpers, money, picker, status panel) | ✅ | |
| 1 MO report | ✅ | Actual / Budget / Variance / Var %, group subtotals + grand total |
| YTD report | ✅ | Same plus PY YTD column + vs-PY % |
| Averages report (summary) | ✅ | 3 / 6 / 12-mo avg, anchored on picker |
| Averages report (history grid) | ✅ | 12 monthly columns, anchored on **latest month with data** (not picker) |
| Single Detail report | ✅ | Category picker + Month / YTD / All-time toggle, subtotal in header |
| Budget editor `/budget/:year` | ✅ | Inline-edit cells (Enter/blur saves, Escape cancels, empty deletes); per-row Pull avg `3 / 6 / 12` buttons; year nav arrows |
| Period picker shared component | ✅ | Used by all four reports |
| Status panels (loading/error/empty) | ✅ | All five pages surface DB errors and empty states explicitly |
| Hover row-highlight | ✅ | Soft sky-blue (`hover:bg-sky-50`) on data rows in all reports + budget editor; sticky cells use `group-hover` so the tint isn't masked |
| Hints feature removal | ✅ | Table dropped, types pruned, dry-run simplified, RunRulesPage slimmed |
| `Database` type fleshed out | ✅ | All tf_* tables now have proper Insert/Update/Relationships; `Functions: {}` added so v2.105 stops returning `never` |
| Phase 2 build errors cleaned up | ✅ | Wrong import paths, implicit any, unused imports — all fixed. `npm run build` succeeds |

---

## Phase 3 Acceptance Criteria

| Test | Status | Notes |
|---|---|---|
| 1 MO report numbers match spreadsheet | ⏳ | Logic verified against seed data; pending real-data validation once you re-import CSVs |
| YTD report numbers match | ⏳ | Same — pending real data |
| Averages match (3/6/12) | ⏳ | Same — pending real data |
| Single Detail correctly drills into one category | ✅ | Validated with seed (Shopping → 1 row in May, multiple in April) |
| Budget editor: edit cells, save persists, refresh shows | ✅ | |
| Budget editor: per-row 3/6/12 button populates 12 cells | ✅ | Confirmed against seed data (mostly zeros since seed only spans April–May 2026) |
| Reports surface DB errors visibly | ✅ | Confirmed — missing-view error showed up clearly during testing |
| Hover highlight on data rows only | ✅ | Group headers, subtotals, grand totals deliberately excluded |
| `npm run build` succeeds | ✅ | First time since Phase 2 |

---

## Issues Encountered & Resolved

Documenting these so future phases don't repeat them.

### 1. `Database` type incompleteness silently broke `tsc --noEmit`

Phase 2's `src/types/database.ts` only declared 5 tables and used `Insert: never; Update: never;`. With supabase-js v2.105 + strict TypeScript, this caused every insert/update on those tables to widen to `never`, which produces "Argument is not assignable to parameter of type 'never'" errors. Because the dev only ran `npm run dev` (which uses esbuild and skips strict typecheck), the failures never surfaced. Running `tsc --noEmit` produced ~50 errors across `phase2.ts`, `reports.ts`, etc.

**Fix:** Filled out all 13 `tf_*` tables with proper `Row` / `Insert` (with `?`-marked optional fields for defaults) / `Update` (`Partial<Row>`) shapes. Critically: every table now has `Relationships: GenericRelationship[]` and the schema has `Functions: Record<string, never>` — both required by supabase-js v2.105's `GenericSchema` constraint, otherwise the `Schema extends GenericSchema ? Schema : never` check falls to `never`.

**Lesson for Phase 4+:** Run `npm run build` (not just `npm run dev`) at the end of every phase. If we add a new table in Phase 4 (e.g. for snapshots in Reforecast), its entry must include `Relationships: []` (or proper FK metadata) and proper `Insert`/`Update` shapes.

### 2. Embedded PostgREST queries break under typed schemas

Phase 2's joined-select pattern `select('id, accounts(name)')` worked at runtime but couldn't be statically typed because `accounts(name)` isn't declared as a relationship in the hand-rolled `Database` type. Same problem in Phase 3's `fetchCategoryTransactions`.

**Fix:** Cast the result row to `any[]` immediately after the query, with a comment explaining why. This is local and bounded — the embed shape is well-known at the call site. Future option: declare the FK metadata in `Relationships`, but that adds maintenance burden until we generate types from Supabase.

### 3. Source-category hints feature was scoped without confirming desire

Phase 2 built the hints scaffolding (table, types, dry-run integration, UI cards on RunRulesPage) on the assumption it would be used. When Phase 3 asked "should we build the admin page?", the answer was "I don't want this feature at all." That meant a feature was carried forward through Phase 2 unused.

**Fix:** Removed the table (migration 05), the loaders (`loadHints` / `loadAllHints`), the `'import_hint'` and `'hint'` source values from type unions, the hint match path in `dryRun.ts`, and the related cards/labels from `RunRulesPage`.

**Lesson for Phase 4+:** Validate user-facing features with the user before scaffolding the data model. The "futureproof" rationale is real but should not extend to features we're not sure are wanted.

### 4. Pages with silent failures were impossible to debug from the screenshot

The 1 MO page initially showed nothing because the view didn't exist. Both the loading and error states were silent — no panel rendered when the queries errored.

**Fix:** Added `StatusPanel` component (loading / error / empty styles) and wired it into all four reports + budget editor. Errors now show the actual Supabase error message inline.

**Lesson for Phase 4+:** Every async-data page needs three explicit states: loading, error (with the message), and empty (with helpful guidance).

### 5. Default budget editor "Fill ALL" buttons were too dangerous

Initial budget editor had top-bar `Fill ALL with 3-mo / 6-mo / 12-mo avg` buttons that overwrote every cell after a confirm dialog. User feedback: the per-row buttons are useful but the bulk version was too easy to trigger by mistake.

**Fix:** Removed the top-bar buttons; kept the per-row `3 / 6 / 12` buttons.

### 6. Run Rules page broken by Phase 2 prefix-mismatch bug (caught post-Phase-3)

The Run Rules page's "Compute Preview" button returned a 400 from PostgREST. Root cause: two embedded selects in `loadScope()` used unprefixed table names — `accounts(name)` and `categories(name)` — instead of `tf_accounts` and `tf_categories`. The Phase 2 PowerShell find/replace caught top-level `.from('transactions')` → `.from('tf_transactions')` calls but missed embedded references inside `.select()` strings.

**Fix:** Changed both embeds to the alias form: `account:tf_accounts(name)` and `category:tf_categories(name)`, plus updated the consumers to read from the new alias property (handles both array-of-one and object embed shapes).

**Lesson:** The Phase 2 report flagged this exact failure mode ("table name prefix mismatch") but the cleanup only reached top-level `.from()` calls. Future schema-rename refactors should grep for both `.from('xxx')` AND `xxx(` (embed pattern) AND `xxx.` (joined-column pattern).

### 7. Sticky cells masked row hover tint

The Averages history grid and Budget editor have sticky-positioned first columns with `bg-white`. Adding `hover:bg-sky-50` to the row had no visible effect on those cells because the sticky background painted on top.

**Fix:** Added `group` class to the `<tr>` and `group-hover:bg-sky-50` to the sticky cells, so they pick up the tint via the parent group-hover state.

---

## Carry-Forward to Phase 4

### Cleanup tasks (low priority)

- **Branch is still named `phase2`.** Either rename to `main` and merge, or create a `phase3` branch retroactively. Recommend: rebase/squash and merge to `main` before starting Phase 4.
- **Two date helper files exist:** `src/lib/date.ts` (Phase 1) and `src/lib/dates.ts` (Phase 2 import parsers). They serve different needs but the names are confusing. Consider consolidating.
- **`RuleBuilderPage` doesn't pre-populate when editing** an existing rule (`/rules/:id` route works for the navigation but the form starts blank). TODO comment left in place. Worth ~30 minutes when you actually want to edit a rule.
- **Phantom `tf_household_members` row** mentioned in Phase 2 report still needs cleanup:
  ```sql
  delete from tf_household_members
  where user_id = 'd51e4870-77ce-4687-9a01-fa44ecdee5d2';
  ```

### User tasks before Phase 4 starts

- Re-import all four bank CSVs to populate real transaction data
- Build out an initial rule set (~10–20 vendor mappings)
- Run rules → bulk-categorize the imports
- Enter a 2026 budget for at least the major spend categories — this makes the variance columns meaningful on the 1 MO and YTD reports
- Test the reports against the spreadsheet to spot any to-the-cent discrepancies (the master plan calls these out as Phase 3 acceptance criteria)

### Phase 4 scope per master plan

Reforecast / Revised page (mid-year course-correction):
- Route: `/budget/:year/revise`
- Actuals YTD pulled live from transactions, displayed read-only
- Future months editable, default to original budget values
- Live total/variance calculation as you edit
- Save creates a new `tf_revised_budgets` snapshot (audit trail — table already exists from Phase 1 schema)
- Compare view: original | actuals to date | revised forecast | YE variance

### Suggested first questions for Phase 4

1. **Snapshot model** — every save creates a new snapshot (full audit trail), or only when explicitly "frozen" (e.g. quarter-end)?
2. **Revising history** — can the user revise a snapshot from a past `as_of_month`, or only the current one?
3. **Future-month default** — when revising, do future months start from the original budget or from the previous revision?
4. **Compare view scope** — show all four columns (original / actual / revised / YE variance) for one period, or stack multiple revision snapshots side by side?

---

## Current State of Truth

### Database state (`tf_*` tables)

```
tf_households                1 row
tf_household_members         2 rows   (1 real + 1 phantom — see cleanup task)
tf_accounts                  4 rows
tf_category_schemes          1 row    (Default, is_default=true)
tf_categories               29 rows   (full Phase 1 taxonomy)
tf_transactions             20 rows   (Phase 1 seed data)
tf_transaction_categories  ~20 rows   (seed assignments)
tf_rules                     0 rows
tf_trips                     0 rows
tf_import_batches            0 rows
tf_budgets                   0 rows   (NEW in Phase 3 use)
tf_revised_budgets           0 rows   (Phase 4 will populate)
tf_source_category_hints     —        (TABLE DROPPED in migration 05)
tf_v_monthly_category_actuals (view)  (NEW in Phase 3 — created by migration 04)
```

### App state

- All Phase 1 + 2 + 3 routes registered and reachable
- Auth working
- Transactions grid showing 20 seed transactions
- All 4 reports + budget editor render with seed data; empty/error states confirmed working
- Hover row-highlight visible on all reports + budget
- `npm run build` succeeds (first time since Phase 2)
- Zero TypeScript errors
- Zero linter errors

### Code state

- Phase 1 + 2 + 3 code on `phase2` branch
- 14 tracked files modified, ~22 new files added (see git status)
- 3 SQL migrations added (03 from Phase 2, 04 + 05 from Phase 3)
- `Database` type covers all 13 `tf_*` tables + the new view

---

## Files Added in Phase 3

| File | Purpose |
|---|---|
| `supabase/migrations/04_phase3_reports.sql` | Monthly actuals view + helper indexes |
| `supabase/migrations/05_drop_source_category_hints.sql` | Drops the unused hints table |
| `src/lib/period.ts` | Year+month tuple helpers (shift, prevN, ytd, periodKey, comparePeriod) |
| `src/api/reports.ts` | All Phase 3 queries: monthly actuals, year-budget, single-category txns, latest-data-period anchor, default scheme |
| `src/features/reports/grouping.ts` | Spend group order + section/grand totals (matches spreadsheet) |
| `src/components/PeriodPicker.tsx` | Shared month/year picker (also supports yearOnly) |
| `src/components/StatusPanel.tsx` | Loading / error / empty status panel |
| `src/pages/reports/OneMonthReportPage.tsx` | 1 MO report |
| `src/pages/reports/YtdReportPage.tsx` | YTD report with PY column |
| `src/pages/reports/AveragesReportPage.tsx` | Averages summary + history grid |
| `src/pages/reports/SingleDetailReportPage.tsx` | Single Detail report |
| `src/pages/budget/BudgetEditorPage.tsx` | Budget editor |

## Files Modified in Phase 3

| File | Change |
|---|---|
| `src/App.tsx` | Wired Phase 3 routes; removed Phase 3 placeholders |
| `src/lib/money.ts` | Added `fmtUsd`, `fmtMoney`, `displaySpend`, `variance`, `variancePct`, `fmtPct`, `varianceClass` (kept existing `formatMoney`/`moneyClass`) |
| `src/types/database.ts` | Fleshed out all `tf_*` tables with proper Insert/Update/Relationships shapes; added `Functions: {}`; removed `tf_source_category_hints` |
| `src/types/phase2.ts` | Removed hint fields from `DryRunRow` / `DryRunSummary` / `CategorySource` |
| `src/api/phase2.ts` | Removed hint loaders (`loadHints`, `loadAllHints`); tightened `applyCategorizations` source union; cast embed result to `any[]` to satisfy supabase v2.105 typing; cleaned unused imports |
| `src/features/rules/dryRun.ts` | Removed hint matching path |
| `src/features/rules/engine.ts` | Fixed import path (`../../../types` → `../../types`); explicit `RuleCondition[]` cast on `rule.conditions`; trailing `return false` for exhaustive switch |
| `src/pages/RunRulesPage.tsx` | Removed Hint stat card, hint loader call, hint-mapping label; switched 5-col layout to 4-col |
| `src/pages/RuleBuilderPage.tsx` | Dropped unused `editQuery` (with TODO note); cleaned imports |
| `src/pages/RulesPage.tsx`, `src/pages/ImportPage.tsx` | Removed unused imports |

## Files Deleted in Phase 3

| File | Reason |
|---|---|
| `src/_phase2_routing_notes.ts` | Stale instructions scratch file from Phase 2 |

---

## Migrations Required to Run Phase 3

In Supabase SQL Editor, in order:

1. `supabase/migrations/04_phase3_reports.sql` — creates the view + indexes
2. `supabase/migrations/05_drop_source_category_hints.sql` — drops unused hints table

Both safe to re-run (migration 04 uses `create or replace view` and `create index if not exists`; migration 05 uses `drop ... if exists`).

---

— **End of Phase 3 Completion Report**
