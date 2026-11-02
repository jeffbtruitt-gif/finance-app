import type { ParseResult, SourceParser } from '../../../types/phase2';
import { parseSlashedDate4, parseIsoDate, parseMoney, round2 } from '../../../lib/dates';

/**
 * Discover CSV format
 *
 * Legacy header (pre-2026 Discover exports):
 *   Trans. Date,Post Date,Description,Amount,Category
 *   Sign convention: purchases POSITIVE, payments/credits NEGATIVE. Matches
 *   our internal convention (out = positive). No flip. Date: MM/DD/YYYY.
 *
 * Capital One header (Discover account converted to Capital One, mid-2026):
 *   Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
 *   Amount is split into separate Debit/Credit columns instead of one signed
 *   Amount column. Debit = purchase (positive), Credit = payment (flipped to
 *   negative to match our convention). Date: YYYY-MM-DD (already ISO).
 *
 * Both formats are treated as source_type 'discover' since they're the same
 * underlying account.
 */

const LEGACY_HEADERS = ['Trans. Date', 'Post Date', 'Description', 'Amount', 'Category'];
const CAPITAL_ONE_HEADERS = ['Transaction Date', 'Posted Date', 'Description', 'Category', 'Debit', 'Credit'];

export const discoverParser: SourceParser = {
  source_type: 'discover',

  detect(headerRow) {
    const headers = headerRow.map(h => h.trim());
    const isLegacy = LEGACY_HEADERS.every(h => headers.includes(h));
    const isCapitalOne = CAPITAL_ONE_HEADERS.every(h => headers.includes(h));
    return isLegacy || isCapitalOne;
  },

  parse(rows) {
    const transactions = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    const sampleRow = rows[0] || {};
    const isCapitalOneFormat = 'Debit' in sampleRow || 'Credit' in sampleRow;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (isCapitalOneFormat) {
          const dateStr = row['Transaction Date']?.trim();
          const description = row['Description']?.trim();
          const debitStr = row['Debit']?.trim();
          const creditStr = row['Credit']?.trim();
          const sourceCategory = row['Category']?.trim();

          if (!dateStr || !description || (!debitStr && !creditStr)) {
            warnings.push(`Row ${i + 2}: missing required field, skipping`);
            continue;
          }

          const amount = debitStr ? parseMoney(debitStr) : -parseMoney(creditStr);
          if (Number.isNaN(amount)) {
            warnings.push(`Row ${i + 2}: unparseable amount, skipping`);
            continue;
          }

          transactions.push({
            date: parseIsoDate(dateStr),
            description,
            amount: round2(amount),
            source_category: sourceCategory || undefined,
            raw_row: row,
          });
        } else {
          const dateStr = row['Trans. Date']?.trim();
          const description = row['Description']?.trim();
          const amountStr = row['Amount']?.trim();
          const sourceCategory = row['Category']?.trim();

          if (!dateStr || !description || !amountStr) {
            warnings.push(`Row ${i + 2}: missing required field, skipping`);
            continue;
          }

          const amount = parseMoney(amountStr);
          if (Number.isNaN(amount)) {
            warnings.push(`Row ${i + 2}: unparseable amount "${amountStr}", skipping`);
            continue;
          }

          transactions.push({
            date: parseSlashedDate4(dateStr),
            description,
            amount: round2(amount),  // no flip
            source_category: sourceCategory || undefined,
            raw_row: row,
          });
        }
      } catch (e: any) {
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }

    return {
      source_type: 'discover',
      transactions,
      warnings,
      errors,
    } satisfies ParseResult;
  },
};
