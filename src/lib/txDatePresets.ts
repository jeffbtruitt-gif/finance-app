import { todayIso } from '@/lib/date';

export type DateQuick = '7d' | '30d' | '90d' | 'ytd' | 'all';

/** Inclusive ISO date range (yyyy-mm-dd) for quick-pick controls. */
export function rangeForQuick(quick: DateQuick, now = new Date()): { start: string; end: string } | null {
  const end = todayIso();
  if (quick === 'all') return null;

  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (yy: number, mm: number, dd: number) =>
    `${yy}-${pad(mm)}-${pad(dd)}`;

  if (quick === 'ytd') {
    return { start: iso(y, 1, 1), end };
  }

  const days = quick === '7d' ? 7 : quick === '30d' ? 30 : 90;
  const startDt = new Date(y, m, d - (days - 1));
  return {
    start: iso(startDt.getFullYear(), startDt.getMonth() + 1, startDt.getDate()),
    end,
  };
}
