import type { ParseResult, SourceParser, SourceType } from '../../../types/phase2';
import { parseSlashedDate2, parseMoney, round2 } from '../../../lib/dates';

/**
 * BCU CSV format (both Cash Rewards Visa and Powerplus Checking)
 *
 * Header (real, as of 2026):
 *   Account ID,Transaction ID,Date,Name,Description,Check Number,Category,
 *   Tags,Amount,Balance
 *
 * Differences:
 *   - Visa: Balance column is empty (credit card; no running balance reported)
 *   - Powerplus: Balance column has values (checking account)
 *
 * Sign convention: BCU reports money OUT (purchases, withdrawals) as NEGATIVE
 * and money IN (deposits, payments) as POSITIVE. We FLIP this to match our
 * internal convention (out = positive).
 *
 * Date: MM/DD/YY (two-digit year).
 *
 * external_id: We use the bank's "Transaction ID" — a unique stable ID per
 * transaction. Stronger dedupe signal than the hash.
 *
 * Description vs Name: BCU's "Description" column is usually identical to
 * "Name" but sometimes longer/more detailed. We prefer Description; if it's
 * blank we fall back to Name.
 *
 * Category: BCU supplies a category column ("Gasoline/Fuel", "Restaurants",
 * etc.). We capture this as `source_category`. It's currently unused (Phase 3
 * removed the hint feature) but stored for future use.
 *
 * Pending transactions: BCU sometimes includes pending entries. Per Jeff's
 * preference, we insert them normally — he'll filter manually.
 */

const REQUIRED = ['Account ID', 'Date', 'Amount', 'Transaction ID'];

/**
 * Returns 'bcu_visa' if the export looks like a credit card (no balances),
 * 'bcu_powerplus' if it looks like a checking account (has balances).
 */
export function detectBcuVariant(rows: Record<string, string>[]): SourceType {
  // Sample up to 20 rows; if any have a non-empty balance, it's checking.
  // A single populated balance is enough — Visa exports leave the column
  // blank for every row.
  const sample = rows.slice(0, 20);
  const anyBalance = sample.some(r => {
    const b = (r['Balance'] ?? '').trim();
    return b !== '' && !Number.isNaN(parseMoney(b));
  });
  return anyBalance ? 'bcu_powerplus' : 'bcu_visa';
}

function parseBcuRows(rows: Record<string, string>[], source_type: SourceType): ParseResult {
  const transactions = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const dateStr = row['Date']?.trim();
      // Prefer Description; fall back to Name (some rows have one populated
      // and the other empty depending on how BCU classified the merchant).
      const description =
        (row['Description']?.trim() || row['Name']?.trim()) ?? '';
      const amountStr = row['Amount']?.trim();
      const externalId = row['Transaction ID']?.trim();
      const sourceCategory = row['Category']?.trim();

      if (!dateStr || !description || !amountStr) {
        warnings.push(`Row ${i + 2}: missing required field (date/description/amount), skipping`);
        continue;
      }

      const rawAmount = parseMoney(amountStr);
      if (Number.isNaN(rawAmount)) {
        warnings.push(`Row ${i + 2}: unparseable amount "${amountStr}", skipping`);
        continue;
      }

      // FLIP: BCU has out = negative, we want out = positive
      const amount = round2(-rawAmount);

      transactions.push({
        date: parseSlashedDate2(dateStr),
        description,
        amount,
        source_category: sourceCategory || undefined,
        external_id: externalId || undefined,
        raw_row: row,
      });
    } catch (e: any) {
      errors.push(`Row ${i + 2}: ${e.message}`);
    }
  }

  return { source_type, transactions, warnings, errors };
}

/**
 * Generic BCU detector — runs first and identifies the variant.
 * The actual parser is selected based on the detection.
 */
export const bcuVisaParser: SourceParser = {
  source_type: 'bcu_visa',

  detect(headerRow) {
    const headers = headerRow.map(h => h.trim());
    const hasRequired = REQUIRED.every(h => headers.includes(h));
    const hasTxId = headers.includes('Transaction ID');
    return hasRequired && hasTxId;
    // We can't tell visa vs powerplus from header alone — see parse() which
    // looks at row data. The detector's job here is to claim the format;
    // variant is decided at parse time.
  },

  parse(rows) {
    const variant = detectBcuVariant(rows);
    return parseBcuRows(rows, variant);
  },
};

/**
 * Powerplus is the same parser; we expose it as a separate object so the
 * registry can list it explicitly. detect() is identical — variant is
 * resolved at parse time inside the shared logic.
 */
export const bcuPowerplusParser: SourceParser = {
  source_type: 'bcu_powerplus',
  detect: bcuVisaParser.detect,
  parse: bcuVisaParser.parse,
};
