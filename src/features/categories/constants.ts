import { SPEND_GROUP_ORDER } from '@/features/reports/grouping';

/**
 * Canonical group list for filters, drawer picker, and section ordering.
 * Includes legacy seed name `Rent & House Maintenance` alongside spec alias
 * `Rent & Utilities`.
 */
export const ALL_GROUPS = [
  'Income',
  'Rent & Utilities',
  'Rent & House Maintenance',
  'Food & Car',
  'Other',
  'Yearly',
  'Savings',
  'Transfer',
] as const;

export type AllGroupName = (typeof ALL_GROUPS)[number];

/** Groups that count as “spend” sections in report totals (plus spec alias). */
export const SPEND_GROUPS_FOR_LABEL = new Set<string>([
  ...SPEND_GROUP_ORDER,
  'Rent & Utilities',
]);

export const GROUP_META: Record<
  string,
  { tone: 'navy' | 'gold'; hint: string }
> = {
  Income: { tone: 'navy', hint: 'Inflows. Excluded from spend totals.' },
  'Rent & Utilities': {
    tone: 'navy',
    hint: 'Recurring household fixed costs.',
  },
  'Rent & House Maintenance': {
    tone: 'navy',
    hint: 'Recurring household fixed costs.',
  },
  'Food & Car': { tone: 'navy', hint: 'Variable household + transportation.' },
  Other: { tone: 'navy', hint: 'All other monthly spend.' },
  Yearly: { tone: 'gold', hint: 'Lumpy / annual — budgeted as one number.' },
  Savings: { tone: 'navy', hint: 'Contributions. Excluded from spend.' },
  Transfer: { tone: 'navy', hint: 'Account movement. Excluded from spend.' },
  '(no group)': { tone: 'navy', hint: 'Assign a group for reporting.' },
};

/** Palette dots (matches design-system cat-* hex row + spec order). */
export const CATEGORY_COLOR_PALETTE = [
  '#9b6dd1',
  '#e08750',
  '#3a9e6f',
  '#3884c2',
  '#d4517f',
  '#7a8aa8',
  '#22a39f',
  '#c98c3b',
  '#1e7e5a',
  '#9aa0af',
] as const;

export const NO_GROUP_KEY = '(no group)' as const;
