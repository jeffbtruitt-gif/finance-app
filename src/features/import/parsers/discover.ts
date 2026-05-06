import type { ParseResult, SourceParser } from '../../../types/phase2';
import { parseSlashedDate4, parseMoney, round2 } from '../../../lib/dates';

/**
 * Discover CSV format
 *
 * Header: Trans. Date,Post Date,Description,Amount,Category
 *
 * Sign convention: Discover reports purchases as POSITIVE, payments/credits as
 * NEGATIVE. That matches our internal convention (out = positive). No flip.
 *
 * Date: MM/DD/YYYY. We use Trans. Date (transaction date), not Post Date.
 */

const HEADERS = ['Trans. Date', 'Post Date', 'Description', 'Amount', 'Category'];

export const discoverParser: SourceParser = {
  source_type: 'discover',

  detect(headerRow) {
    const headers = headerRow.map(h => h.trim());
    return HEADERS.every(h => headers.includes(h));
  },

  parse(rows) {
    const transactions = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
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
