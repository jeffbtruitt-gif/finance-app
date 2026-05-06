import { supabase } from '@/api/supabase';
import { periodEndIso, periodStartIso, type Period } from '@/lib/period';

export interface ImportMonthlyStatRow {
  account_id: string;
  account_name: string;
  /** First day of month (YYYY-MM-DD) — month of transaction `date`, same as reports. */
  period_month: string;
  txn_count: number;
  amount_sum: number;
}

function mapRpcRows(data: unknown): ImportMonthlyStatRow[] {
  const rows = (data as Record<string, unknown>[] | null | undefined) ?? [];
  return rows.map((r) => ({
    account_id: String(r.account_id),
    account_name: String(r.account_name ?? ''),
    period_month: String(r.period_month ?? r.import_month ?? '').slice(0, 10),
    txn_count: Number(r.txn_count ?? 0),
    amount_sum: Number(r.amount_sum ?? 0),
  }));
}

/** PostgREST when the RPC is not deployed or not in the schema cache yet. */
function isMissingImportStatsRpc(error: { message?: string; code?: string }): boolean {
  const msg = error.message ?? '';
  return (
    error.code === 'PGRST202' ||
    msg.includes('Could not find the function') ||
    msg.includes('schema cache')
  );
}

/**
 * Same aggregates as `tf_transaction_import_stats_by_month`, computed client-side
 * with paginated reads. Used when the migration has not been applied yet.
 */
async function fetchImportMonthlyStatsPaginated(
  householdId: string,
): Promise<ImportMonthlyStatRow[]> {
  const PAGE = 1000;
  const bucket = new Map<
    string,
    { account_id: string; account_name: string; period_month: string; txn_count: number; amount_sum: number }
  >();

  function nameFromJoin(account: unknown): string {
    const a = account as { name?: string } | { name?: string }[] | null;
    if (Array.isArray(a)) return a[0]?.name ?? '';
    return a?.name ?? '';
  }

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('tf_transactions')
      .select('account_id, amount, date, account:tf_accounts!inner(name)')
      .eq('household_id', householdId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const raw of rows) {
      const row = raw as {
        account_id: string;
        amount: string | number;
        date: string;
        account: unknown;
      };
      const dateStr = row.date;
      if (!dateStr || dateStr.length < 7) continue;
      const period_month = `${dateStr.slice(0, 7)}-01`;
      const key = `${row.account_id}|${period_month}`;
      const amt = Number(row.amount);
      const prev = bucket.get(key);
      const account_name = nameFromJoin(row.account);
      if (prev) {
        prev.txn_count += 1;
        prev.amount_sum += amt;
      } else {
        bucket.set(key, {
          account_id: row.account_id,
          account_name,
          period_month,
          txn_count: 1,
          amount_sum: amt,
        });
      }
    }
    if (rows.length < PAGE) break;
  }

  const list = Array.from(bucket.values());
  list.sort((a, b) => {
    if (a.period_month !== b.period_month) return a.period_month < b.period_month ? 1 : -1;
    return a.account_name.localeCompare(b.account_name);
  });
  return list;
}

export async function fetchImportMonthlyStats(
  householdId: string,
): Promise<ImportMonthlyStatRow[]> {
  const { data, error } = await supabase.rpc('tf_transaction_import_stats_by_month', {
    p_household_id: householdId,
  });
  if (!error) return mapRpcRows(data);
  if (isMissingImportStatsRpc(error)) {
    return fetchImportMonthlyStatsPaginated(householdId);
  }
  throw error;
}

/**
 * True when at least one transaction **dated** in `period` carries fields that bank CSV
 * imports populate (Discover category, Amex card member, BCU transaction id). Recurring
 * template posts and typical Manual Add rows omit these — so we treat this as “natural”
 * import coverage for that calendar month before allowing recurring adds.
 */
export async function fetchMonthHasNaturalImportedTransactions(
  householdId: string,
  period: Period,
): Promise<boolean> {
  const start = periodStartIso(period);
  const end = periodEndIso(period);
  const { data, error } = await supabase
    .from('tf_transactions')
    .select('id')
    .eq('household_id', householdId)
    .gte('date', start)
    .lte('date', end)
    .or('external_id.not.is.null,card_member.not.is.null,source_category.not.is.null')
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
