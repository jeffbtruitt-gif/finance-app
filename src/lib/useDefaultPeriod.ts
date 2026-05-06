/**
 * useDefaultPeriod — system-wide convention (locked in Phase 4):
 * "current month" is the latest month with any transaction actuals, NOT the
 * calendar month. Pages that show period-relative data should anchor here so
 * an empty-data household doesn't see "this month, 0 transactions".
 *
 * Falls back to the calendar month while the lookup is loading or when the
 * household has no transactions yet — that's the only sensible fallback for
 * a brand-new household.
 *
 * Returns BOTH the resolved period and the raw query state so a page can opt
 * into showing a "Loading…" placeholder while the anchor resolves (avoiding
 * a flash of calendar-month data that immediately switches to actuals-month).
 */

import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { fetchLatestActualPeriodGlobal } from '@/api/reforecast';
import { currentPeriod, type Period } from '@/lib/period';

export interface DefaultPeriodResult {
  /** The resolved period — latest-actuals if available, else calendar. */
  period: Period;
  /** True if the lookup is still in flight (period falls back to calendar). */
  loading: boolean;
  /** True when we resolved to the calendar fallback (no transactions yet). */
  fellBack: boolean;
}

export function useDefaultPeriod(): DefaultPeriodResult {
  const household = useHousehold();
  const q = useQuery({
    queryKey: ['latest-actual-period-global', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchLatestActualPeriodGlobal(household!.id),
    // The latest period rarely changes mid-session; cache aggressively. New
    // imports invalidate via the import flow.
    staleTime: 5 * 60 * 1000,
  });

  if (q.data) {
    return { period: q.data, loading: false, fellBack: false };
  }
  return {
    period: currentPeriod(),
    loading: q.isLoading,
    fellBack: !q.isLoading,
  };
}
