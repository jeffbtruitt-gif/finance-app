/**
 * Period helpers for Phase 3 reports.
 *
 * A `Period` is a (year, month) tuple — month is 1-12. We keep it as numbers
 * (not Date) so timezone has zero impact: a "2026-04" report should mean
 * April regardless of where the user opens the browser.
 */

export interface Period {
  year: number;
  month: number; // 1-12
}

export const MONTH_NAMES_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function currentPeriod(): Period {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function formatPeriod(p: Period, style: 'long' | 'short' = 'long'): string {
  const m = (style === 'long' ? MONTH_NAMES_LONG : MONTH_NAMES_SHORT)[p.month - 1];
  return `${m} ${p.year}`;
}

/** First day of the month as ISO string (YYYY-MM-DD), suitable for SQL date filters. */
export function periodStartIso(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-01`;
}

/** Last day of the month as ISO string. Handles 28/29/30/31 correctly. */
export function periodEndIso(p: Period): string {
  // new Date(year, month, 0) gives last day of previous month.
  // Since JS months are 0-indexed, passing `month` (our 1-12) gives
  // last day of OUR month.
  const d = new Date(p.year, p.month, 0);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** First day of the year as ISO. */
export function yearStartIso(year: number): string {
  return `${year}-01-01`;
}

/** Subtract N months. May cross years. Returns a new Period. */
export function shiftPeriod(p: Period, months: number): Period {
  // Convert to absolute month index, shift, convert back.
  const idx = p.year * 12 + (p.month - 1) + months;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Returns the N periods immediately preceding (and not including) the given period. */
export function prevNPeriods(p: Period, n: number): Period[] {
  const out: Period[] = [];
  for (let i = n; i >= 1; i--) {
    out.push(shiftPeriod(p, -i));
  }
  return out;
}

/** Returns periods from year-start through (and including) the given period. */
export function ytdPeriods(p: Period): Period[] {
  const out: Period[] = [];
  for (let m = 1; m <= p.month; m++) {
    out.push({ year: p.year, month: m });
  }
  return out;
}

/** All 12 months of a year. */
export function fullYear(year: number): Period[] {
  const out: Period[] = [];
  for (let m = 1; m <= 12; m++) out.push({ year, month: m });
  return out;
}

/** Compare two periods. Returns negative / 0 / positive. */
export function comparePeriod(a: Period, b: Period): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

/** Stable string key for using a Period as a Map key. */
export function periodKey(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}
