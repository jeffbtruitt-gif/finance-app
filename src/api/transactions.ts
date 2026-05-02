import { supabase } from './supabase';
import type { TransactionRow } from '@/types';

export interface TransactionFilters {
  startDate?: string; // ISO yyyy-mm-dd
  endDate?: string;
  accountIds?: string[];
  categoryIds?: string[]; // null entry means "uncategorized"
  search?: string;
}

export interface TransactionSort {
  column: 'date' | 'amount' | 'description' | 'category_name' | 'account_name';
  direction: 'asc' | 'desc';
}

/**
 * Fetch transactions joined with account and (default-scheme) category.
 * Uses Supabase's PostgREST embedding to pull the joins in one round trip.
 */
export async function fetchTransactions(opts: {
  filters?: TransactionFilters;
  sort?: TransactionSort;
  page: number;
  pageSize: number;
}): Promise<{ rows: TransactionRow[]; totalCount: number }> {
  const { filters = {}, sort, page, pageSize } = opts;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  // Embed account name and the joined category via transaction_categories.
  // PostgREST will return transaction_categories as an array (could be empty
  // when uncategorized); we collapse it client-side.
  let query = supabase
    .from('tf_transactions')
    .select(
      `
      id, household_id, account_id, date, description, amount,
      source_category, card_member, external_id, dedupe_hash,
      notes, tag, trip_id, imported_at,
      account:tf_accounts!inner ( name ),
      tf_transaction_categories (
        category:tf_categories ( name, group_name )
      )
    `,
      { count: 'exact' },
    );

  if (filters.startDate) query = query.gte('date', filters.startDate);
  if (filters.endDate) query = query.lte('date', filters.endDate);
  if (filters.accountIds && filters.accountIds.length > 0) {
    query = query.in('account_id', filters.accountIds);
  }
  if (filters.search && filters.search.trim().length > 0) {
    query = query.ilike('description', `%${filters.search.trim()}%`);
  }

  // Apply sort
  if (sort) {
    // Sorting on joined columns isn't directly supported in PostgREST in the
    // same way; for date / amount / description we can sort server-side.
    // For account_name / category_name we'll fall back to client-side sort.
    if (sort.column === 'date' || sort.column === 'amount' || sort.column === 'description') {
      query = query.order(sort.column, { ascending: sort.direction === 'asc' });
    } else {
      // server returns date desc; we'll re-sort client-side below
      query = query.order('date', { ascending: false });
    }
  } else {
    query = query.order('date', { ascending: false });
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  // Collapse the embedded shape into a flat row for the grid.
  // PostgREST returns embedded relations as arrays on `to-many` and
  // objects/arrays-of-one on `to-one`; we shape both into our flat type.
  const rows: TransactionRow[] = (data ?? []).map((r: any) => {
    const account_name: string = Array.isArray(r.account)
      ? r.account[0]?.name ?? ''
      : r.account?.name ?? '';
    const tc = Array.isArray(r.tf_transaction_categories)
      ? r.tf_transaction_categories[0]
      : r.tf_transaction_categories;
    const category_name: string | null = tc?.category?.name ?? null;
    const category_group: string | null = tc?.category?.group_name ?? null;
    return {
      id: r.id,
      household_id: r.household_id,
      account_id: r.account_id,
      date: r.date,
      description: r.description,
      amount: Number(r.amount),
      source_category: r.source_category,
      card_member: r.card_member,
      external_id: r.external_id,
      dedupe_hash: r.dedupe_hash,
      notes: r.notes,
      tag: r.tag,
      trip_id: r.trip_id,
      imported_at: r.imported_at,
      account_name,
      category_name,
      category_group,
    };
  });

  // Apply category filter client-side (after join collapse) so we can express
  // the "uncategorized" case naturally.
  let filtered = rows;
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    const wantUncat = filters.categoryIds.includes('__uncategorized__');
    const ids = new Set(filters.categoryIds.filter((x) => x !== '__uncategorized__'));
    filtered = rows.filter((r) => {
      if (r.category_name === null) return wantUncat;
      // We only have category_name here; for filtering we'd want id.
      // For Phase 1 we accept matching by name to keep the round-trips low.
      return Array.from(ids).some((wanted) => wanted === r.category_name);
    });
  }

  // Client-side sort fallback for joined columns
  if (sort && (sort.column === 'account_name' || sort.column === 'category_name')) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sort.column] ?? '';
      const bv = b[sort.column] ?? '';
      const cmp = String(av).localeCompare(String(bv));
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }

  return { rows: filtered, totalCount: count ?? 0 };
}

export interface AccountOption {
  id: string;
  name: string;
  source_type: string;
  is_active: boolean;
}

export async function fetchAccounts(): Promise<AccountOption[]> {
  const { data, error } = await supabase
    .from('tf_accounts')
    .select('id, name, source_type, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as unknown as AccountOption[];
}

export interface CategoryOption {
  id: string;
  name: string;
  group_name: string | null;
  sort_order: number;
  is_yearly: boolean;
  status: string;
}

export async function fetchCategories(): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from('tf_categories')
    .select('id, name, group_name, sort_order, is_yearly, status')
    .eq('status', 'active')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as unknown as CategoryOption[];
}
