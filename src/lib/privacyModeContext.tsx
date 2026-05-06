import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'tf:privacy-hide-income-assets:v1';

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === '1' || raw === 'true') return true;
  } catch {
    /* ignore */
  }
  return false;
}

type PrivacyModeContextValue = {
  hideIncomeAssets: boolean;
  setHideIncomeAssets: (v: boolean) => void;
};

const PrivacyModeContext = createContext<PrivacyModeContextValue | null>(null);

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [hideIncomeAssets, setHideIncomeAssetsState] = useState<boolean>(() => readStored());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, hideIncomeAssets ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [hideIncomeAssets]);

  const setHideIncomeAssets = useCallback((v: boolean) => {
    setHideIncomeAssetsState(v);
  }, []);

  const value = useMemo(
    () => ({ hideIncomeAssets, setHideIncomeAssets }),
    [hideIncomeAssets, setHideIncomeAssets],
  );

  return (
    <PrivacyModeContext.Provider value={value}>{children}</PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode(): PrivacyModeContextValue {
  const ctx = useContext(PrivacyModeContext);
  if (!ctx) throw new Error('usePrivacyMode must be used within PrivacyModeProvider');
  return ctx;
}
