import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { currentPeriod, type Period } from '@/lib/period';

const STORAGE_KEY = 'tf:app-period:v1';

function readStoredPeriod(): Period {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return currentPeriod();
    const j = JSON.parse(raw) as { year?: number; month?: number };
    if (
      j &&
      typeof j.year === 'number' &&
      typeof j.month === 'number' &&
      j.month >= 1 &&
      j.month <= 12
    ) {
      return { year: j.year, month: j.month };
    }
  } catch {
    /* ignore */
  }
  return currentPeriod();
}

type AppPeriodContextValue = {
  period: Period;
  setPeriod: (p: Period) => void;
  setYearMonth: (year: number, month: number) => void;
};

const AppPeriodContext = createContext<AppPeriodContextValue | null>(null);

export function AppPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<Period>(() => readStoredPeriod());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(period));
  }, [period]);

  const setPeriod = useCallback((p: Period) => {
    setPeriodState({
      year: p.year,
      month: Math.min(12, Math.max(1, p.month)),
    });
  }, []);

  const setYearMonth = useCallback((year: number, month: number) => {
    setPeriodState({
      year,
      month: Math.min(12, Math.max(1, month)),
    });
  }, []);

  const value = useMemo(
    () => ({ period, setPeriod, setYearMonth }),
    [period, setPeriod, setYearMonth],
  );

  return <AppPeriodContext.Provider value={value}>{children}</AppPeriodContext.Provider>;
}

export function useAppPeriod(): AppPeriodContextValue {
  const ctx = useContext(AppPeriodContext);
  if (!ctx) throw new Error('useAppPeriod must be used within AppPeriodProvider');
  return ctx;
}
