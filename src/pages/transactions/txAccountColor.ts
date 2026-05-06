/** Stable accent for account chip stripe (no `color` column on tf_accounts yet). */
const PALETTE = [
  '#3b559a',
  '#243460',
  '#c9a84c',
  '#1e7e5a',
  '#9b6dd1',
  '#3884c2',
  '#d4517f',
  '#22a39f',
] as const;

export function accountStripeHex(accountId: string): string {
  let h = 0;
  for (let i = 0; i < accountId.length; i++) h = (h * 31 + accountId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
