const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(amount: number): string {
  return usd.format(amount);
}

/**
 * Formats with a leading sign and color hint for the grid.
 * Negative amounts (money in) render in green; positive (money out) in slate.
 * NOTE: this is for the transaction grid, which keeps signs.
 * Reports flip signs at the display layer (out shown as positive) — not here.
 */
export function moneyClass(amount: number): string {
  if (amount < 0) return 'text-emerald-700';
  return 'text-slate-900';
}
