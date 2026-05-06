import { supabase } from './supabase';
import type { TransactionRow } from '@/types';
import { dedupeHash } from '@/lib/dedupe';
import { applyBulkAction } from './phase2';

export interface TransactionFilters {
  startDate?: string; // ISO yyyy-mm-dd
  endDate?: string;
  accountIds?: string[];
  categoryIds?: string[]; // chip keys: category names + "__uncategorized__" (see isUncategorizedOnlyFilter)
  /** Resolved UUIDs for named category chips; drives server-side pagination when set. */
  schemeCategoryIds?: string[];
  /** True when the uncategorized chip is selected (can combine with schemeCategoryIds). */
  includeUncategorized?: boolean;
  search?: string;
}

export interface TransactionSort {
  column: 'date' | 'amount' | 'description' | 'category_name' | 'account_name';
  direction: 'asc' | 'desc';
}

/** True when the only category filter chip is uncategorized (no named categories). */
export function isUncategorizedOnlyFilter(filters: TransactionFilters): boolean {
  const cats = filters.categoryIds;
  if (!cats || cats.length === 0) return false;
  const named = cats.filter((x) => x !== '__uncategorized__');
  return named.length === 0 && cats.includes('__uncategorized__');
}

const TRANSACTION_LIST_SELECT = `
      id, household_id, account_id, date, description, amount,
      source_category, card_member, external_id, dedupe_hash,
      notes, tag, trip_id, imported_at, flag_for_review,
      account:tf_accounts!inner ( name ),
      tf_transaction_categories (
        scheme_id,
        category_id,
        rule_id,
        source,
        category:tf_categories ( name, group_name )
      )
    `;

function mapTransactionListRow(r: any, preferredSchemeId?: string | null): TransactionRow {
  const account_name: string = Array.isArray(r.account)
    ? r.account[0]?.name ?? ''
    : r.account?.name ?? '';
  const rawTc = r.tf_transaction_categories;
  const tcArr: any[] = Array.isArray(rawTc) ? rawTc : rawTc ? [rawTc] : [];
  const tc = preferredSchemeId
    ? tcArr.find((x) => x?.scheme_id === preferredSchemeId) ?? tcArr[0]
    : tcArr[0];
  const category_name: string | null = tc?.category?.name ?? null;
  const category_group: string | null = tc?.category?.group_name ?? null;
  const categorization_rule_id: string | null = tc?.rule_id ?? null;
  const categorization_source: string | null = tc?.source ?? null;
  const category_id: string | null = tc?.category_id ?? null;
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
    flag_for_review: Boolean(r.flag_for_review),
    account_name,
    category_id,
    category_name,
    category_group,
    categorization_rule_id,
    categorization_source,
  };
}

function sortColumnForUncategorizedRpc(sort?: TransactionSort): string {
  if (!sort) return 'date';
  if (sort.column === 'amount' || sort.column === 'description') return sort.column;
  return 'date';
}

async function fetchUncategorizedTransactionsPage(opts: {
  filters: TransactionFilters;
  sort?: TransactionSort;
  page: number;
  pageSize: number;
  schemeId: string;
}): Promise<{ rows: TransactionRow[]; totalCount: number }> {
  const { filters, sort, page, pageSize, schemeId } = opts;
  const from = page * pageSize;
  const { data, error } = await supabase.rpc('tf_uncategorized_transaction_page', {
    p_scheme_id: schemeId,
    p_start: filters.startDate ?? null,
    p_end: filters.endDate ?? null,
    p_account_ids:
      filters.accountIds && filters.accountIds.length > 0 ? filters.accountIds : null,
    p_search: filters.search?.trim() || null,
    p_limit: pageSize,
    p_offset: from,
    p_sort_column: sortColumnForUncategorizedRpc(sort),
    p_sort_asc: sort?.direction === 'asc',
  });
  if (error) throw error;

  const payload = data as { total: number; ids: string[] } | null;
  const totalCount = Number(payload?.total ?? 0);
  const ids = Array.isArray(payload?.ids) ? payload!.ids : [];

  if (ids.length === 0) {
    return { rows: [], totalCount };
  }

  const { data: raw, error: e2 } = await supabase
    .from('tf_transactions')
    .select(TRANSACTION_LIST_SELECT)
    .in('id', ids);
  if (e2) throw e2;

  const byId = new Map(
    (raw ?? []).map((r: any) => [r.id as string, mapTransactionListRow(r, schemeId)]),
  );
  let rows = ids.map((id) => byId.get(id)).filter(Boolean) as TransactionRow[];

  if (sort && (sort.column === 'account_name' || sort.column === 'category_name')) {
    rows = [...rows].sort((a, b) => {
      const av = a[sort.column] ?? '';
      const bv = b[sort.column] ?? '';
      const cmp = String(av).localeCompare(String(bv));
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }

  return { rows, totalCount };
}

async function fetchCategoryFilteredTransactionsPage(opts: {
  filters: TransactionFilters;
  sort?: TransactionSort;
  page: number;
  pageSize: number;
  schemeId: string;
  categoryIds: string[];
  includeUncategorized: boolean;
}): Promise<{ rows: TransactionRow[]; totalCount: number }> {
  const { filters, sort, page, pageSize, schemeId, categoryIds, includeUncategorized } = opts;
  const from = page * pageSize;
  const { data, error } = await supabase.rpc('tf_transaction_category_filter_page', {
    p_scheme_id: schemeId,
    p_category_ids: categoryIds,
    p_include_uncategorized: includeUncategorized,
    p_start: filters.startDate ?? null,
    p_end: filters.endDate ?? null,
    p_account_ids:
      filters.accountIds && filters.accountIds.length > 0 ? filters.accountIds : null,
    p_search: filters.search?.trim() || null,
    p_limit: pageSize,
    p_offset: from,
    p_sort_column: sortColumnForUncategorizedRpc(sort),
    p_sort_asc: sort?.direction === 'asc',
  });
  if (error) throw error;

  const payload = data as { total: number; ids: string[] } | null;
  const totalCount = Number(payload?.total ?? 0);
  const ids = Array.isArray(payload?.ids) ? payload!.ids : [];

  if (ids.length === 0) {
    return { rows: [], totalCount };
  }

  const { data: raw, error: e2 } = await supabase
    .from('tf_transactions')
    .select(TRANSACTION_LIST_SELECT)
    .in('id', ids);
  if (e2) throw e2;

  const byId = new Map(
    (raw ?? []).map((r: any) => [r.id as string, mapTransactionListRow(r, schemeId)]),
  );
  let rows = ids.map((id) => byId.get(id)).filter(Boolean) as TransactionRow[];

  if (sort && (sort.column === 'account_name' || sort.column === 'category_name')) {
    rows = [...rows].sort((a, b) => {
      const av = a[sort.column] ?? '';
      const bv = b[sort.column] ?? '';
      const cmp = String(av).localeCompare(String(bv));
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }

  return { rows, totalCount };
}

/** Date / account / search only — category narrowing uses RPCs when category chips apply. */
function applyTransactionListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: TransactionFilters,
) {
  let q = query;
  if (filters.startDate) q = q.gte('date', filters.startDate);
  if (filters.endDate) q = q.lte('date', filters.endDate);
  if (filters.accountIds && filters.accountIds.length > 0) {
    q = q.in('account_id', filters.accountIds);
  }
  if (filters.search && filters.search.trim().length > 0) {
    q = q.ilike('description', `%${filters.search.trim()}%`);
  }
  return q;
}

/**
 * Total transactions matching list filters, and how many have no category for
 * the given scheme (no row, null category_id, or only null category).
 */
export async function fetchTransactionCountSummary(args: {
  filters: TransactionFilters;
  schemeId: string;
}): Promise<{ total: number; uncategorized: number }> {
  const { filters, schemeId } = args;

  let totalQ = supabase.from('tf_transactions').select('id', { count: 'exact', head: true });
  totalQ = applyTransactionListFilters(totalQ, filters);
  const { count: totalRaw, error: e1 } = await totalQ;
  if (e1) throw e1;
  const total = totalRaw ?? 0;

  let catQ = supabase
    .from('tf_transactions')
    .select('id, tf_transaction_categories!inner(scheme_id, category_id)', {
      count: 'exact',
      head: true,
    });
  catQ = applyTransactionListFilters(catQ, filters);
  catQ = catQ
    .eq('tf_transaction_categories.scheme_id', schemeId)
    .not('tf_transaction_categories.category_id', 'is', null);
  const { count: catRaw, error: e2 } = await catQ;
  if (e2) throw e2;
  const categorized = catRaw ?? 0;

  return { total, uncategorized: Math.max(0, total - categorized) };
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
  /** Required for correct pagination when filtering to uncategorized only. */
  schemeId?: string | null;
}): Promise<{ rows: TransactionRow[]; totalCount: number }> {
  const { filters = {}, sort, page, pageSize, schemeId } = opts;

  if (isUncategorizedOnlyFilter(filters) && schemeId) {
    return fetchUncategorizedTransactionsPage({
      filters,
      sort,
      page,
      pageSize,
      schemeId,
    });
  }

  const schemeCats = filters.schemeCategoryIds;
  if (schemeId && schemeCats && schemeCats.length > 0) {
    return fetchCategoryFilteredTransactionsPage({
      filters,
      sort,
      page,
      pageSize,
      schemeId,
      categoryIds: schemeCats,
      includeUncategorized: Boolean(filters.includeUncategorized),
    });
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;

  // Embed account name and the joined category via transaction_categories.
  // PostgREST will return transaction_categories as an array (could be empty
  // when uncategorized); we collapse it client-side.
  let query = supabase
    .from('tf_transactions')
    .select(TRANSACTION_LIST_SELECT, { count: 'exact' });

  query = applyTransactionListFilters(query, filters);

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
  const rows: TransactionRow[] = (data ?? []).map((r: any) =>
    mapTransactionListRow(r, schemeId ?? undefined),
  );

  let filtered = rows;

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
  quick_assign: boolean;
  status: string;
}

export async function fetchCategories(schemeId: string): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from('tf_categories')
    .select('id, name, group_name, sort_order, is_yearly, quick_assign, status')
    .eq('scheme_id', schemeId)
    .eq('status', 'active')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as unknown as CategoryOption[];
}

/**
 * Set category for transactions that match a description pattern and have no
 * category (or null category_id) in the scheme. Used after creating a rule
 * with "apply to history". Skips `regex` (caller should omit).
 */
export async function backfillUncategorizedByDescriptionMatch(args: {
  household_id: string;
  scheme_id: string;
  category_id: string;
  op: 'contains' | 'starts_with' | 'equals';
  pattern: string;
}): Promise<number> {
  const raw = args.pattern.trim();
  if (!raw) return 0;

  let q = supabase
    .from('tf_transactions')
    .select('id, description')
    .eq('household_id', args.household_id);

  if (args.op === 'equals') {
    q = q.eq('description', raw);
  } else {
    const esc = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    if (args.op === 'contains') q = q.ilike('description', `%${esc}%`);
    else q = q.ilike('description', `${esc}%`);
  }

  const { data: txs, error } = await q;
  if (error) throw error;
  const ids = (txs ?? []).map((t) => t.id as string);
  if (ids.length === 0) return 0;

  const CHUNK = 400;
  let moved = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data: tcs, error: tcErr } = await supabase
      .from('tf_transaction_categories')
      .select('transaction_id, category_id')
      .eq('scheme_id', args.scheme_id)
      .in('transaction_id', slice);
    if (tcErr) throw tcErr;
    const unc: string[] = [];
    for (const tid of slice) {
      const row = (tcs ?? []).find((x) => x.transaction_id === tid);
      if (!row || row.category_id == null) unc.push(tid);
    }
    if (unc.length > 0) {
      await applyBulkAction(args.scheme_id, unc, {
        type: 'set_category',
        category_id: args.category_id,
      });
      moved += unc.length;
    }
  }
  return moved;
}

/**
 * Single transaction with account + default-scheme category (same shape as list rows).
 */
export async function fetchTransactionById(
  schemeId: string,
  id: string,
): Promise<TransactionRow | null> {
  const { data, error } = await supabase
    .from('tf_transactions')
    .select(TRANSACTION_LIST_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapTransactionListRow(data, schemeId);
}

function emptyToNull(s: string | null | undefined): string | null {
  const t = s?.trim() ?? '';
  return t === '' ? null : t;
}

/**
 * Full edit of a transaction row + default-scheme category assignment.
 * Recomputes `dedupe_hash` from account, date, amount, and description (same as imports).
 */
export async function updateTransaction(args: {
  id: string;
  scheme_id: string;
  date: string;
  description: string;
  amount: number;
  account_id: string;
  source_category: string | null;
  card_member: string | null;
  external_id: string | null;
  notes: string | null;
  tag: string | null;
  trip_id: string | null;
  flag_for_review: boolean;
  category_id: string | null;
}): Promise<void> {
  const description = args.description.trim();
  if (!description) throw new Error('Description is required');
  if (!Number.isFinite(args.amount)) throw new Error('Amount must be a valid number');

  const dedupe_hash = await dedupeHash(args.account_id, args.date, args.amount, description);

  const { error: txErr } = await supabase
    .from('tf_transactions')
    .update({
      date: args.date,
      description,
      amount: args.amount,
      account_id: args.account_id,
      source_category: emptyToNull(args.source_category),
      card_member: emptyToNull(args.card_member),
      external_id: emptyToNull(args.external_id),
      notes: emptyToNull(args.notes),
      tag: emptyToNull(args.tag),
      trip_id: args.trip_id,
      flag_for_review: args.flag_for_review,
      dedupe_hash,
    })
    .eq('id', args.id);
  if (txErr) throw txErr;

  if (args.category_id) {
    const { error: upErr } = await supabase.from('tf_transaction_categories').upsert(
      {
        transaction_id: args.id,
        scheme_id: args.scheme_id,
        category_id: args.category_id,
        source: 'manual',
        rule_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'transaction_id,scheme_id' },
    );
    if (upErr) throw upErr;
  } else {
    const { error: delErr } = await supabase
      .from('tf_transaction_categories')
      .delete()
      .eq('transaction_id', args.id)
      .eq('scheme_id', args.scheme_id);
    if (delErr) throw delErr;
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('tf_transactions').delete().eq('id', id);
  if (error) throw error;
}
