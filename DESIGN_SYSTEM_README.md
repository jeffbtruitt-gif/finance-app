# Truitt Finance — Design System (in-app)

This codebase implements the **Truitt Finance Design System** specified in
`Truitt Finance — Design System.pdf`. This file is the developer cheat sheet
for staying inside the system when building new pages.

## TL;DR

- **Font**: Figtree (loaded from Google Fonts in `index.html`).
- **Brand colors**: Navy (`navy-50…900`) + Gold (`gold-100…700`).
- **Neutrals**: `gray-50…900` (warm-tinted; defined in `tailwind.config.ts`).
- **Semantic**: `pos`, `neg`, `warn`, `info` (each with a `*-soft` variant).
- **Categories**: `cat-housing`, `cat-food`, `cat-travel`, `cat-shopping`,
  `cat-utilities`, `cat-entertainment`, `cat-health`, `cat-other`.
- **Always use the primitives in `src/components/ds/`** instead of rolling
  bespoke wrappers.

## Where the tokens live

| Layer            | File                                       |
| ---------------- | ------------------------------------------ |
| Color / type / radius / shadow tokens | `tailwind.config.ts`        |
| Body font + base styles               | `src/index.css`             |
| Google Font load                      | `index.html`                |

## Reusable primitives — `@/components/ds`

Import everything from one barrel:

```ts
import {
  Brand,        // wordmark + tagline
  Button,       // variants: primary | secondary | accent | ghost | danger
  Card,         // optional Card.Header / .Section / .Footer
  Badge,        // tones: pos | neg | warn | info | navy | gold | neutral | outline
  CategoryChip, // colored chip with deterministic palette per category
  Kpi,          // big-number metric tile
  PageHeader,   // h1 + subtitle + actions slot
  RT,           // class strings for financial-report tables
  categoryColorKey,
  categoryColorHex,
} from '@/components/ds';
```

### When to use what

- **`PageHeader`** → every page top. Pass `actions` for filters/CTAs.
- **`Card`** → every panel/section wrapper. Use `padded={false}` when the
  child is a full-bleed table or has its own headers.
- **`Button`** → every button. Don't write `<button className="bg-...">`.
- **`Badge`** → status pills ("Ready", "Error", "On track"). Pass `dot` for
  a leading status dot.
- **`CategoryChip`** → anywhere a category name appears (transactions list,
  reports, etc.). Color is automatic and deterministic.
- **`Kpi`** → dashboards and overview rows.
- **`RT`** → all financial report / budget / reforecast tables. Compose like:
  ```tsx
  <table className={RT.table}>
    <thead className={RT.head}>
      <tr><th className={`${RT.th} ${RT.thLeft}`}>…</th></tr>
    </thead>
    <tbody>
      <tr className={RT.detailRow}>
        <td className={RT.cellLeft}>…</td>
        <td className={RT.cellRight}>…</td>
      </tr>
      <tr className={RT.subtotalRow}>…</tr>
      <tr className={RT.totalRow}><td className={RT.totalCellRight}>…</td></tr>
    </tbody>
  </table>
  ```

### Form inputs

We don't have an `Input` primitive yet (most inputs sit inside grid/table
cells where the styling has to harmonize with the cell). Use this pattern:

```tsx
<input
  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm
             focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
/>
```

## Money colors

`src/lib/money.ts` exports two helpers that return DS color classes:

- `moneyClass(amount)` — `text-pos` for negative (i.e. inflows, "good"),
  `text-gray-900` otherwise.
- `varianceClass(v)` — `text-pos` if `v < 0` (under budget = good),
  `text-neg` if `v > 0`, `text-gray-500` if zero.

Use these instead of inline conditionals so a future tweak to the variance
palette only touches one file.

## Charts

The custom inline SVG components (`Sparkline`, `LineChart`, `WaterfallChart`,
`FanChart`) all default to DS colors:

- Lines / areas: navy palette
- Income / positive: `pos` semantic
- Outflows / negative: `neg` semantic
- Warnings / deficits: `warn` semantic
- FanChart percentile bands: navy → gold gradient

Override via props only when there's a real reason (e.g. matching a brand
color in a marketing page).

## Dos and don'ts

✅ Do
- Reach for `@/components/ds/*` first.
- Use semantic tokens (`pos`, `neg`, `warn`, `info`) for status, not hex
  values or hard-coded color names.
- Use `text-display`, `text-h1…h3`, `text-body`, `text-label`, `text-caption`
  for type sizes — they map directly to the PDF's type scale.

❌ Don't
- Don't introduce `slate-*`, `emerald-*`, `rose-*`, `amber-*`, `sky-*`,
  `blue-*`, `green-*`, `red-*`, `purple-*`, etc. None of those exist in
  this design system.
- Don't write custom button variants. Add a new variant to `Button.tsx` if
  you need one.
- Don't use the default Tailwind `gray-*` scale color values from memory —
  ours is a custom warm-tinted neutral palette defined in `tailwind.config.ts`.

## Where the system is applied

Everything in `src/pages/**` plus `AppShell`, `StatusPanel`, `BulkActionBar`,
`PeriodPicker`, and the four chart components is on the design system as of
this commit. Any future page should follow the patterns established in:

- `src/pages/dashboard/DashboardPage.tsx` (KPI dashboard)
- `src/pages/reports/OneMonthReportPage.tsx` (financial table)
- `src/pages/budget/ReforecastPage.tsx` (editable grid)
- `src/pages/balance-sheet/BalanceSheetPage.tsx` (table + side panel)
- `src/pages/RuleBuilderPage.tsx` (form-heavy page)
