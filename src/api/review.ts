import { supabase } from './supabase';
import { fetchTransactions } from './transactions';
import type { TransactionRow } from '@/types';

export interface HistoryHint {
  category: string;
  similar: number;
}

/** Strip processor prefixes, store numbers, and suffixes to get a stable merchant key. */
export function merchantToken(description: string): string {
  let s = description.toUpperCase();
  if (/AMZN|AMAZON/.test(s)) return 'AMZN MKTP';
  s = s.replace(/^(SQ|SP|TST)\s*\*?\s*/, '');
  s = s.replace(/\s*[#*].*$/, '');
  s = s.replace(/\s*\d{3,}.*$/, '');
  s = s.replace(/\s+(US|USA|INC|LLC)$/, '').trim();
  return s || description.toUpperCase();
}

/** Fetch all uncategorized transactions for the Review queue (up to 500). */
export async function fetchReviewQueue(
  schemeId: string,
): Promise<{ rows: TransactionRow[]; total: number }> {
  const result = await fetchTransactions({
    filters: { categoryIds: ['__uncategorized__'], includeUncategorized: true },
    page: 0,
    pageSize: 500,
    schemeId,
  });
  return { rows: result.rows, total: result.totalCount };
}

/**
 * Build history hints: for each merchant-token pattern, what category have
 * categorized transactions most commonly been filed under, and how many times?
 * Looks at the past 6 months to keep suggestions fresh.
 */
export async function fetchHistoryHints(
  householdId: string,
  schemeId: string,
): Promise<Map<string, HistoryHint>> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('tf_transactions')
    .select(
      `description,
       tf_transaction_categories!inner(
         scheme_id,
         category:tf_categories!inner(name)
       )`,
    )
    .eq('household_id', householdId)
    .eq('tf_transaction_categories.scheme_id', schemeId)
    .gte('date', cutoffStr)
    .limit(5000);

  if (error) throw error;

  const tally = new Map<string, Map<string, number>>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const rawTcs = row['tf_transaction_categories'];
    const tcs: Record<string, unknown>[] = Array.isArray(rawTcs)
      ? rawTcs
      : rawTcs
        ? [rawTcs as Record<string, unknown>]
        : [];
    for (const tc of tcs) {
      const cat = Array.isArray(tc['category']) ? tc['category'][0] : tc['category'];
      const catName = (cat as Record<string, unknown> | undefined)?.['name'] as string | undefined;
      if (!catName) continue;
      const key = merchantToken(row['description'] as string);
      const catMap = tally.get(key) ?? new Map<string, number>();
      catMap.set(catName, (catMap.get(catName) ?? 0) + 1);
      tally.set(key, catMap);
    }
  }

  const hints = new Map<string, HistoryHint>();
  for (const [token, catMap] of tally) {
    let bestCat = '';
    let bestCount = 0;
    let totalCount = 0;
    for (const [cat, count] of catMap) {
      totalCount += count;
      if (count > bestCount) {
        bestCat = cat;
        bestCount = count;
      }
    }
    if (bestCat) hints.set(token, { category: bestCat, similar: totalCount });
  }

  return hints;
}
