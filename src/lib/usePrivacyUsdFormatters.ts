import { fmtUsd } from '@/lib/money';
import { maskUsd } from '@/lib/privacyMoney';
import { usePrivacyMode } from '@/lib/privacyModeContext';

/**
 * `spend` — expense / outflow numbers (always visible).
 * `sensitive` — income, assets, balances, net worth (masked when privacy is on).
 */
export function usePrivacyUsdFormatters() {
  const { hideIncomeAssets } = usePrivacyMode();
  return {
    hideIncomeAssets,
    spend: (n: number, opts?: { decimals?: number }) => fmtUsd(n, opts),
    sensitive: (n: number, opts?: { decimals?: number }) =>
      maskUsd(hideIncomeAssets, n, true, opts),
  };
}
