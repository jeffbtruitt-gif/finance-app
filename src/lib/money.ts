/**
 * Money display helpers.
 *
 * Storage convention: `out = positive, in = negative` (matches Actuals).
 * Display convention (reports): everything shown positive.
 *
 * The transaction grid (TransactionsPage) keeps signs and uses
 * `formatMoney` + `moneyClass`.
 *
 * Reports use `fmtUsd` / `fmtMoney` plus the grouping module to flip signs
 * at the display layer when needed (Phase 3 reports show spend only, which
 * is already stored positive — no flip required).
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Currency formatter with $ and 2 decimals. Used by the transactions grid. */
export function formatMoney(amount: number): string {
  return usd.format(amount);
}

/**
 * Color hint for the transactions grid.
 * Negative amounts (money in) render in pos-green; positive (money out) in
 * default body text (gray-900). Uses design-system semantic tokens.
 * Reports DO NOT use this — they show all values positive.
 */
export function moneyClass(amount: number): string {
  if (amount < 0) return 'text-pos';
  return 'text-gray-900';
}

// ----------------------------------------------------------------------------
// Phase 3 — report-friendly formatters (no decimals by default)
// ----------------------------------------------------------------------------

/** Format a number with thousands separators, no $ sign. */
export function fmtMoney(n: number, opts: { decimals?: number } = {}): string {
  const { decimals = 0 } = opts;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Same as fmtMoney with leading $. */
export function fmtUsd(n: number, opts: { decimals?: number } = {}): string {
  if (!Number.isFinite(n)) return '—';
  return '$' + fmtMoney(n, opts);
}

/** Signed currency for variances: `+$1,200` / `−$340` (unicode minus). */
export function fmtUsdSigned(n: number, opts: { decimals?: number } = {}): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return fmtUsd(0, opts);
  const sign = n > 0 ? '+' : '−';
  return sign + fmtMoney(Math.abs(n), opts);
}

/**
 * Display value for a spend report cell.
 *
 * Spend categories are stored positive in tf_transactions.amount, so this
 * is the identity for spend totals. We keep the function around so the
 * call site is explicit about what convention it's operating under.
 */
export function displaySpend(amount: number): number {
  return amount;
}

/** Variance (actual minus budget). Positive = over budget. */
export function variance(actual: number, budget: number): number {
  return actual - budget;
}

/** Variance %. Returns null when budget is zero (avoid div-by-0 noise). */
export function variancePct(actual: number, budget: number): number | null {
  if (budget === 0) return null;
  return ((actual - budget) / budget) * 100;
}

/** Pretty-print a percentage as "+12%" / "−4%" / "—". Uses the unicode minus. */
export function fmtPct(p: number | null, opts: { decimals?: number } = {}): string {
  const { decimals = 0 } = opts;
  if (p == null || !Number.isFinite(p)) return '—';
  const sign = p > 0 ? '+' : p < 0 ? '−' : '';
  return `${sign}${Math.abs(p).toFixed(decimals)}%`;
}

/** Tailwind class for variance color (design-system tokens): under budget =
 *  pos-green, over = neg-red, zero = gray-500. */
export function varianceClass(v: number): string {
  if (v < 0) return 'text-pos';
  if (v > 0) return 'text-neg';
  return 'text-gray-500';
}
