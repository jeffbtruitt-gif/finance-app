/**
 * Privacy mask for income / assets / net worth. Spend-style amounts stay visible.
 * Placeholder matches user preference for a minimal dollar stub when hidden.
 */

import { fmtUsd, fmtPct } from '@/lib/money';

/** Shown when “Hide assets / income” is on (ASCII so it matches common `$-` expectation). */
export const PRIVACY_USD_PLACEHOLDER = '$-';

/** Non-dollar obscured values (percentages, multipliers). */
export const PRIVACY_TEXT_PLACEHOLDER = '—';

/**
 * @param sensitive When true and hideIncomeAssets is on, return placeholder.
 */
export function maskUsd(
  hideIncomeAssets: boolean,
  amount: number,
  sensitive: boolean,
  opts?: { decimals?: number },
): string {
  if (!hideIncomeAssets || !sensitive) return fmtUsd(amount, opts);
  return PRIVACY_USD_PLACEHOLDER;
}

export function maskPct(hideIncomeAssets: boolean, p: number | null, opts?: { decimals?: number }): string {
  if (!hideIncomeAssets) return fmtPct(p, opts);
  return PRIVACY_TEXT_PLACEHOLDER;
}
