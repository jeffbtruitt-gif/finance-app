import type { ParseResult, SourceParser } from '../../../types/phase2';
import { parseSlashedDate4, parseMoney, round2 } from '../../../lib/dates';

/**
 * Amex CSV format
 *
 * Header: Date,Description,Card Member,Account #,Amount
 * (Some exports also include "Extended Details" and "Address" — we ignore.)
 *
 * Sign convention: Amex reports purchases as POSITIVE, payments as NEGATIVE.
 * Matches our internal convention. No flip.
 *
 * Date: MM/DD/YYYY.
 *
 * Card Member: captured into ParsedTransaction.card_member so we can later
 * build a rule like "if card_member contains 'BRITNEY' then tag as Brit".
 */

const REQUIRED = ['Date', 'Description', 'Amount'];
// "Card Member" sometimes spelled "Cardmember" in older exports
const CARD_MEMBER_KEYS = ['Card Member', 'Cardmember', 'Card Holder'];

export const amexParser: SourceParser = {
  source_type: 'amex',

  detect(headerRow) {
    const headers = headerRow.map(h => h.trim());
    const hasRequired = REQUIRED.every(h => headers.includes(h));
    const hasCardMember = CARD_MEMBER_KEYS.some(k => headers.includes(k));
    // Discover also has Date+Description+Amount, so the Card Member field is
    // what disambiguates Amex from Discover.
    return hasRequired && hasCardMember;
  },

  parse(rows) {
    const transactions = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // Find which Card Member column variant is present
    const sampleRow = rows[0] || {};
    const cardMemberKey = CARD_MEMBER_KEYS.find(k => k in sampleRow);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const dateStr = row['Date']?.trim();
        const description = row['Description']?.trim();
        const amountStr = row['Amount']?.trim();
        const cardMember = cardMemberKey ? row[cardMemberKey]?.trim() : undefined;

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
          card_member: cardMember || undefined,
          raw_row: row,
        });
      } catch (e: any) {
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }

    return {
      source_type: 'amex',
      transactions,
      warnings,
      errors,
    } satisfies ParseResult;
  },
};
