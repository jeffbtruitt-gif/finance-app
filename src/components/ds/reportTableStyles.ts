/**
 * Shared Tailwind class strings for the financial-report tables.
 *
 * The 1MO / YTD / Single-Detail / Averages reports all share the same visual
 * vocabulary per the design system PDF section "FINANCIAL REPORT TABLE":
 *   - Group rows: navy-50 tint, label-style header
 *   - Detail rows: white, hover navy-50/40, slim row height
 *   - Subtotal rows: navy-100 tint, semibold
 *   - Total row: navy-800 fill, white text, bold
 *
 * Centralizing the class strings here means later design tweaks (e.g.
 * tighten row height, switch hover tint) only need to be made in one place.
 */

export const RT = {
  /** <table> root */
  table: 'w-full text-sm',
  /** <thead> */
  head: 'border-b border-navy-100 bg-navy-50/60',
  /** <th> in head row */
  th: 'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-600',
  thLeft: 'text-left',
  thRight: 'text-right',
  /** Group header row (the small "RENT & UTILITIES" label) */
  groupRow: 'bg-navy-50',
  groupCell:
    'px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-navy-700',
  /** Detail rows */
  detailRow:
    'border-t border-navy-100 transition-colors hover:bg-navy-50/40',
  cellLeft: 'px-4 py-1.5 text-left text-gray-800',
  cellRight: 'px-4 py-1.5 text-right tabular-nums text-gray-800',
  cellRightMuted: 'px-4 py-1.5 text-right tabular-nums text-gray-500',
  /** Subtotal row (per group) */
  subtotalRow: 'border-t border-navy-200 bg-navy-50 font-semibold text-navy-800',
  /** Grand total row */
  totalRow: 'border-t-2 border-navy-700 bg-navy-800 font-bold text-white',
  totalCell: 'px-4 py-2.5',
  totalCellRight: 'px-4 py-2.5 text-right tabular-nums',
};
