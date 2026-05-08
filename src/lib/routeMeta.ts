import { matchPath } from 'react-router-dom';
import { formatPeriod, type Period } from '@/lib/period';

export type PageMeta = { title: string; description: string };

const FALLBACK: PageMeta = {
  title: 'Truitt Finance',
  description: '',
};

/**
 * Title + description for the fixed app shell header. Match most-specific routes first.
 */
export function getPageMeta(pathname: string, period?: Period): PageMeta {
  const path = pathname.replace(/\/$/, '') || '/';

  const entries: Array<{ pattern: string; meta: PageMeta | ((p: Record<string, string>) => PageMeta) }> =
    [
      { pattern: '/', meta: { title: 'Dashboard', description: 'Household overview and key metrics.' } },
      {
        pattern: '/transactions',
        meta: {
          title: 'Transactions',
          description: 'Review, filter, and categorize cash flows for the selected month.',
        },
      },
      {
        pattern: '/trips',
        meta: {
          title: 'Trips',
          description: 'Define trip date ranges; matching transactions are highlighted on the list.',
        },
      },
      {
        pattern: '/categories',
        meta: {
          title: 'Categories',
          description: 'Manage category names, groups, and quick-assign shortcuts.',
        },
      },
      {
        pattern: '/balance-sheet/allocation',
        meta: { title: 'BS Allocation', description: 'Asset class allocation across balance-sheet accounts.' },
      },
      {
        pattern: '/balance-sheet',
        meta: { title: 'Balance Sheet', description: 'Assets, liabilities, and net worth snapshot.' },
      },
      {
        pattern: '/assumptions/:year',
        meta: ({ year }) => ({
          title: `Assumptions ${year}`,
          description: 'Planning inputs for projections and scenario work.',
        }),
      },
      {
        pattern: '/assumptions',
        meta: { title: 'Assumptions', description: 'Planning inputs for projections and scenario work.' },
      },
      {
        pattern: '/budget/:year/revise',
        meta: ({ year }) => ({
          title: `Reforecast ${year}`,
          description: 'Revise the remainder of the year using live actuals through the as-of month.',
        }),
      },
      {
        pattern: '/budget/:year',
        meta: ({ year }) => ({
          title: `Budget ${year}`,
          description: 'Monthly amounts by category. Pull prior-year averages or fill January to spread.',
        }),
      },
      {
        pattern: '/reports',
        meta: {
          title: 'Monthly Report',
          description: period
            ? `Spending by category for ${formatPeriod(period)} — how actuals compare to your plan.`
            : 'Spending by category for the selected month — how actuals compare to your plan.',
        },
      },
      {
        pattern: '/reports/one-month',
        meta: { title: 'One-month report', description: 'Actuals for a single calendar month.' },
      },
      {
        pattern: '/reports/ytd',
        meta: { title: 'Year-to-date report', description: 'Actuals from January through the selected period.' },
      },
      {
        pattern: '/reports/detail',
        meta: {
          title: 'Single category detail',
          description: 'Transactions for one category across the selected range.',
        },
      },
      {
        pattern: '/reports/transactions',
        meta: {
          title: 'Budget report transactions',
          description:
            'Search transactions (all time, YTD, or current month), filter by category and group, sorted by amount.',
        },
      },
      {
        pattern: '/reports/budget-matrix',
        meta: {
          title: 'Budget matrix report',
          description:
            'Year-wide matrix of actuals, budget, reforecast, and variances with optional heatmap and trends.',
        },
      },
      {
        pattern: '/reports/averages',
        meta: { title: 'Averages report', description: 'Rolling and historical averages by category.' },
      },
      {
        pattern: '/reports/balance-sheet',
        meta: {
          title: 'Balance sheet report',
          description: 'Assets, liabilities, and equity by group at the selected month.',
        },
      },
      {
        pattern: '/bills',
        meta: { title: 'Bills', description: 'Monthly recurring bills and payment websites.' },
      },
      {
        pattern: '/retire',
        meta: { title: 'Retirement', description: 'Long-term retirement projections.' },
      },
      { pattern: '/college', meta: { title: 'College', description: 'Education funding projections.' } },
      {
        pattern: '/import',
        meta: {
          title: 'Import Data',
          description:
            'Upload CSV statements, or review counts and totals by account for the selected transaction month.',
        },
      },
      {
        pattern: '/rules/run',
        meta: { title: 'Run rules', description: 'Apply categorization rules to uncategorized transactions.' },
      },
      { pattern: '/rules/new', meta: { title: 'New rule', description: 'Define conditions and a category action.' } },
      {
        pattern: '/rules/:id',
        meta: { title: 'Edit rule', description: 'Update conditions, priority, and category.' },
      },
      {
        pattern: '/rules',
        meta: {
          title: 'Rules',
          description: 'Auto-categorize by description, amount, or account. Order sets priority.',
        },
      },
      {
        pattern: '/settings/accounts',
        meta: {
          title: 'Manage Accounts',
          description: 'Add, rename, and configure balance-sheet accounts.',
        },
      },
    ];

  for (const { pattern, meta } of entries) {
    const m = matchPath({ path: pattern, end: true }, path);
    if (m) {
      return typeof meta === 'function' ? meta(m.params as Record<string, string>) : meta;
    }
  }

  return FALLBACK;
}
