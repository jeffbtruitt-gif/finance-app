# Phase 2 — Data Flow

This bundle adds: imports, dedupe, rules engine, dry-run preview, bulk edit,
trip auto-stamping, and source-category hint mapping.

## What's in this drop

```
supabase/migrations/
  03_phase2_imports_and_hints.sql      ← new tables + indexes

src/
  types/phase2.ts                       ← shared types

  lib/
    dedupe.ts                           ← SHA-256 hash for dedupe
    dates.ts                            ← date + money parsing helpers

  features/
    import/parsers/
      discover.ts                       ← Discover CSV parser
      amex.ts                           ← Amex CSV parser
      bcu.ts                            ← BCU Visa + Powerplus parser
      index.ts                          ← detection + dispatch
    rules/
      engine.ts                         ← rule evaluator
      dryRun.ts                         ← dry-run computation
    trips/
      matcher.ts                        ← trip date-range matcher

  api/phase2.ts                         ← all Supabase queries

  pages/
    ImportPage.tsx                      ← /import
    RulesPage.tsx                       ← /rules
    RuleBuilderPage.tsx                 ← /rules/new and /rules/:id
    RunRulesPage.tsx                    ← /rules/run

  components/
    BulkActionBar.tsx                   ← drop into TransactionsPage

  _phase2_routing_notes.ts              ← integration notes (add to App.tsx)
```

## Setup steps

### 1. Run the migration

In the Supabase SQL Editor, paste the contents of
`supabase/migrations/03_phase2_imports_and_hints.sql` and run it.

This adds `source_category_hints` (with RLS policies) and a few indexes that
keep imports + dry-run snappy.

### 2. Install one new dependency

```bash
npm install papaparse
npm install -D @types/papaparse
```

PapaParse handles the messy parts of CSV parsing — quoted fields with commas,
escaped quotes, etc. The parsers themselves are thin transforms on top.

### 3. Wire up the routes

Open `src/_phase2_routing_notes.ts` for the exact snippets. Short version:

In `App.tsx`:

```tsx
import { ImportPage } from './pages/ImportPage';
import { RulesPage } from './pages/RulesPage';
import { RuleBuilderPage } from './pages/RuleBuilderPage';
import { RunRulesPage } from './pages/RunRulesPage';

// inside <Routes>:
<Route path="/import" element={<ImportPage />} />
<Route path="/rules" element={<RulesPage />} />
<Route path="/rules/run" element={<RunRulesPage />} />
<Route path="/rules/new" element={<RuleBuilderPage />} />
<Route path="/rules/:id" element={<RuleBuilderPage />} />
```

In your nav/sidebar, add links to `/import` and `/rules`.

### 4. Wire BulkActionBar into TransactionsPage

In your existing `TransactionsPage.tsx` from Phase 1:

1. Add multi-select to the TanStack Table — there's a row-selection
   feature you enable with `enableRowSelection: true` plus a header/cell
   checkbox column.
2. Sync `table.getSelectedRowModel().rows` into a `selectedIds: string[]`
   state (via `useEffect`).
3. Render `<BulkActionBar selectedIds={selectedIds} onClear={...}/>`
   conditionally above the table.

The bar is sticky so it stays visible as you scroll.

### 5. Drop your sample CSVs

Put one sample export from each bank into `samples/` (or anywhere local).
Test order I'd recommend:

1. **Discover first** — simplest format, validates the happy path.
2. **Amex next** — validates Card Member capture.
3. **BCU Visa** — validates the sign flip and Transaction ID dedupe.
4. **BCU Powerplus** — validates variant detection (balance column).

For each, run an import and verify the preview counts make sense before
clicking Commit.

## Acceptance walkthrough

This is the test plan from the master plan, with concrete steps:

| Test | Steps |
|------|-------|
| Discover import works | `/import` → pick Discover account → drop CSV → preview shows N new, 0 dupes (first run) → commit → see them in `/transactions` with positive amounts for purchases |
| Amex captures Card Member | Same flow with an Amex CSV → check `/transactions` row detail; `card_member` field populated |
| BCU sign flip | Import a BCU CSV → preview shows positive amounts for purchases, negative for deposits (opposite of the raw CSV) |
| Dedupe via Transaction ID | Re-import the same BCU CSV → preview shows 0 new, all duplicates with `external_id` match type |
| Dedupe via hash | Re-import the same Discover CSV → 0 new, all duplicates with `hash` match type |
| Trip auto-stamping | Create a trip whose date range covers some imported rows → re-run import (or import a different file overlapping that range) → preview's "Trip-tagged" count > 0; rows show trip badge |
| Build a rule | `/rules/new` → name, condition `description contains "TARGET"`, category Shopping → Save → see it in the list |
| Run rules with preview | `/rules/run` → scope = uncategorized → "Compute Preview" → see summary cards + per-row table |
| Manual override warning | Manually set a category on a transaction → run rules → that row shows in the preview with red highlight, "manual" badge, default unchecked |
| Bulk include manual overrides | In the same preview, click "Include all manual overrides" → all red rows now checked |
| Apply | Click Apply → returns to /transactions with the categorizations live |
| Bulk edit | Multi-select 5 rows in the grid → click "Set category" → pick one → all 5 update |
| Make rule from selection | Multi-select 3 Target transactions → "Make rule from these" → builder opens with `description starts_with "TARGET"` pre-filled |

## Design decisions worth flagging

- **Rule engine is pure / in-memory.** All rule evaluation happens
  client-side. This is fine at your scale (~15K transactions, dozens of
  rules) — well under 100ms in practice. If we ever need to scale this up,
  we can move evaluation server-side via a Postgres function. Not needed now.

- **Hints in the dry-run preview.** Per your decision, hints show up
  alongside rule matches in the preview table. The "Why" column tells you
  whether each row came from a rule or a hint. Hints are stored in
  `source_category_hints` per (scheme, source_type, source_category) and
  you'll bootstrap them via the categories page in Phase 3 (or by direct
  inserts now if you want to seed them earlier).

- **BCU pending transactions** are inserted normally (your call). If they
  later disappear or change in a re-import, the hash will differ, so they'd
  re-import as new. That's a known caveat — easy to revisit if it bites.

- **Confirmation modal** appears on import commit (your preference). Two
  clicks to commit: "Commit Import" → "Confirm & Commit". The modal shows
  new count, dupes skipped, trip-tagged count, and source filename.

- **"Make rule from selection"** uses heuristics:
    * longest common description prefix (≥4 chars) → `starts_with`
    * else most common ≥4-char token shared by ≥60% of selection → `contains`
    * single shared account → `account is X`
    * tight amount range (≤$2 spread, ≥3 selected) → `between`
  Pre-filled, then you review/edit before saving.

## Known follow-ups

- **Source-category hint management UI** — there's no dedicated page yet to
  add/edit hint mappings. For now, you'd insert them via SQL or the rules
  page workflow. We can add a simple admin page in Phase 3 alongside the
  categories management page.
- **Custom rule actions** — currently rules only set a category. Setting
  trip or tag from a rule is a future-add, schema-compatible.
- **Rule bulk import/export** — if you ever want to share rule sets between
  schemes (Tax view etc.), we'd add JSON export/import. Not needed for now.

## Verification I already ran

I ran sanity tests on:
- Date parsing (MM/DD/YYYY for Discover/Amex, MM/DD/YY for BCU including the
  20YY/19YY rollover)
- Money parsing ($, commas, parens for negatives)
- Sign convention (Discover/Amex no flip, BCU flipped)
- Header detection (Amex must be checked before Discover; BCU is unambiguous)
- Rule engine (priority ordering, AND conditions, disabled rules, no-match)

All assertions passed.
