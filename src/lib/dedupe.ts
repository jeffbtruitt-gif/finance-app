/**
 * Dedupe hash for transactions.
 *
 * Hash inputs (in order, joined by `|`):
 *   account_id, date (ISO), amount (fixed 2 decimals), description (trimmed, lowercased)
 *
 * The bank's external_id (when available) is a stronger signal and is checked
 * BEFORE the hash in the dedupe path. The hash is the fallback for sources
 * that don't expose a stable transaction ID (Discover, Amex).
 */

export async function dedupeHash(
  account_id: string,
  date: string,         // ISO YYYY-MM-DD
  amount: number,
  description: string,
): Promise<string> {
  const normalized = [
    account_id,
    date,
    amount.toFixed(2),
    description.trim().toLowerCase().replace(/\s+/g, ' '),
  ].join('|');

  const enc = new TextEncoder().encode(normalized);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash many transactions in parallel — used during import preview.
 * Modern browsers handle ~1000 hashes in well under 100ms.
 */
export async function dedupeHashMany(
  account_id: string,
  rows: Array<{ date: string; amount: number; description: string }>,
): Promise<string[]> {
  return Promise.all(
    rows.map(r => dedupeHash(account_id, r.date, r.amount, r.description))
  );
}
