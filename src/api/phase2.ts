import { supabase } from '@/api/supabase';
import type {
  ImportPreviewRow,
  Rule,
  RuleCondition,
  BulkAction,
  CategorySource,
  MatchableTransaction,
} from '../types/phase2';

// ============================================================================
// Imports
// ============================================================================

/**
 * Lightweight existing-row shape returned for matched duplicates. Has just
 * enough for the import preview to show the user "what does this look like
 * a duplicate of?".
 */
export interface ExistingTxnMatch {
  id: string;
  date: string;
  description: string;
  amount: number;
  external_id: string | null;
  dedupe_hash: string;
  account_id: string;
  imported_at: string | null;
}

export interface ExistingTransactionsResult {
  /** All external_ids that matched (back-compat with the old set API). */
  existing_external_ids: Set<string>;
  /** All hashes that matched (back-compat). */
  existing_hashes: Set<string>;
  /** Full row data for each matched hash. Multiple matches per hash possible
   *  if the user has previously imported the same fingerprint twice. */
  matchesByHash: Map<string, ExistingTxnMatch[]>;
  /** Full row data for each matched external_id. */
  matchesByExternalId: Map<string, ExistingTxnMatch>;
}

/**
 * Look up which of the given (external_ids, hashes) already exist in the DB
 * for this household. Returns sets of matched keys (back-compat) AND full
 * row data so the import preview can show the user the existing rows that
 * triggered a duplicate flag.
 */
export async function findExistingTransactions(
  household_id: string,
  account_id: string,
  external_ids: string[],
  hashes: string[],
): Promise<ExistingTransactionsResult> {
  const existing_external_ids = new Set<string>();
  const existing_hashes = new Set<string>();
  const matchesByHash = new Map<string, ExistingTxnMatch[]>();
  const matchesByExternalId = new Map<string, ExistingTxnMatch>();

  const SELECT_COLS =
    'id, date, description, amount, external_id, dedupe_hash, account_id, imported_at';

  if (external_ids.length > 0) {
    const { data, error } = await supabase
      .from('tf_transactions')
      .select(SELECT_COLS)
      .eq('household_id', household_id)
      .eq('account_id', account_id)
      .in('external_id', external_ids);
    if (error) throw error;
    for (const row of (data ?? []) as ExistingTxnMatch[]) {
      if (row.external_id) {
        existing_external_ids.add(row.external_id);
        matchesByExternalId.set(row.external_id, {
          ...row,
          amount: Number(row.amount),
        });
      }
    }
  }

  if (hashes.length > 0) {
    // Postgres `in` clause has practical limits (~1000); chunk for safety.
    // We dedupe the slice to keep the query small when many parsed rows
    // share the same hash (within-file collisions).
    const uniqueHashes = Array.from(new Set(hashes));
    const CHUNK = 500;
    for (let i = 0; i < uniqueHashes.length; i += CHUNK) {
      const slice = uniqueHashes.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('tf_transactions')
        .select(SELECT_COLS)
        .eq('household_id', household_id)
        .in('dedupe_hash', slice);
      if (error) throw error;
      for (const raw of (data ?? []) as ExistingTxnMatch[]) {
        const row: ExistingTxnMatch = { ...raw, amount: Number(raw.amount) };
        existing_hashes.add(row.dedupe_hash);
        const arr = matchesByHash.get(row.dedupe_hash);
        if (arr) arr.push(row);
        else matchesByHash.set(row.dedupe_hash, [row]);
      }
    }
  }

  return { existing_external_ids, existing_hashes, matchesByHash, matchesByExternalId };
}

/**
 * Commit the import: bulk-insert the new (non-duplicate) rows and write an
 * import_batches audit row. Returns the inserted transaction IDs so the UI
 * can navigate to /transactions filtered to "just imported".
 */
export async function commitImport(args: {
  household_id: string;
  account_id: string;
  source_file: string;
  total_rows: number;
  new_rows: ImportPreviewRow[];
  imported_by: string;
}): Promise<{ batch_id: string; inserted_ids: string[] }> {
  const {
    household_id, account_id, source_file, total_rows, new_rows, imported_by,
  } = args;

  // 1. Insert transactions in chunks (Supabase allows ~1000/insert; 500 is safe)
  const CHUNK = 500;
  const inserted_ids: string[] = [];

  for (let i = 0; i < new_rows.length; i += CHUNK) {
    const slice = new_rows.slice(i, i + CHUNK);
    const payload = slice.map(r => ({
      household_id,
      account_id,
      date: r.parsed.date,
      description: r.parsed.description,
      amount: r.parsed.amount,
      source_category: r.parsed.source_category ?? null,
      card_member: r.parsed.card_member ?? null,
      external_id: r.parsed.external_id ?? null,
      dedupe_hash: r.dedupe_hash,
      trip_id: r.trip_match?.trip_id ?? null,
    }));

    const { data, error } = await supabase
      .from('tf_transactions')
      .insert(payload)
      .select('id');
    if (error) throw error;
    for (const row of data ?? []) inserted_ids.push(row.id);
  }

  // 2. Audit row
  const { data: batch, error: batchErr } = await supabase
    .from('tf_import_batches')
    .insert({
      household_id,
      account_id,
      source_file,
      row_count: total_rows,
      new_count: new_rows.length,
      imported_by,
    })
    .select('id')
    .single();
  if (batchErr) throw batchErr;

  return { batch_id: batch.id, inserted_ids };
}

// ============================================================================
// Rules
// ============================================================================

export async function listRules(scheme_id: string): Promise<Rule[]> {
  const { data, error } = await supabase
    .from('tf_rules')
    .select('*')
    .eq('scheme_id', scheme_id)
    .order('priority', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Rule[];
}

export async function getRule(id: string): Promise<Rule> {
  const { data, error } = await supabase
    .from('tf_rules')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Rule;
}

export async function createRule(args: {
  household_id: string;
  scheme_id: string;
  name: string;
  conditions: RuleCondition[];
  action_category_id: string;
  priority?: number;
}): Promise<Rule> {
  let priority = args.priority;
  if (priority == null) {
    // Default: place at the end
    const { data, error } = await supabase
      .from('tf_rules')
      .select('priority')
      .eq('scheme_id', args.scheme_id)
      .order('priority', { ascending: false })
      .limit(1);
    if (error) throw error;
    priority = (data?.[0]?.priority ?? 0) + 10;
  }

  const { data, error } = await supabase
    .from('tf_rules')
    .insert({
      household_id: args.household_id,
      scheme_id: args.scheme_id,
      priority,
      name: args.name,
      conditions: args.conditions,
      action_category_id: args.action_category_id,
      is_active: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Rule;
}

export async function updateRule(id: string, patch: Partial<Rule>): Promise<void> {
  const { error } = await supabase
    .from('tf_rules')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from('tf_rules').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderRules(
  ordered_ids: string[],
): Promise<void> {
  // Simple priority assignment: 10, 20, 30, ...
  // (Gaps allow inserting later without renumbering everything.)
  await Promise.all(
    ordered_ids.map((id, i) =>
      supabase.from('tf_rules').update({ priority: (i + 1) * 10 }).eq('id', id)
    )
  );
}

// ============================================================================
// Scope queries for dry-run
// ============================================================================

export type ScopeKind =
  | { kind: 'uncategorized'; scheme_id: string }
  | { kind: 'date_range'; scheme_id: string; from: string; to: string }
  | { kind: 'selection'; transaction_ids: string[] };

export interface ScopeTransaction extends MatchableTransaction {
  date: string;
  current_category_id: string | null;
  current_category_name: string | null;
  current_source: CategorySource;
}

/** PostgREST `in` filters can exceed URL limits; keep chunks conservative. */
const SCOPE_TX_IN_CHUNK = 200;

const TX_SELECT_FOR_SCOPE =
  'id, date, description, amount, source_category, account_id, account:tf_accounts(name)';

async function fetchTransactionsByIdChunks(
  household_id: string,
  ids: string[],
): Promise<any[]> {
  if (ids.length === 0) return [];
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += SCOPE_TX_IN_CHUNK) {
    const slice = ids.slice(i, i + SCOPE_TX_IN_CHUNK);
    const { data: txRows, error: txErr } = await supabase
      .from('tf_transactions')
      .select(TX_SELECT_FOR_SCOPE)
      .eq('household_id', household_id)
      .in('id', slice);
    if (txErr) throw txErr;
    out.push(...((txRows as any[]) ?? []));
  }
  return out;
}

/**
 * All uncategorized transaction IDs for a scheme (same definition as the
 * Transactions list RPC), then full rows in bounded chunks.
 */
async function loadUncategorizedTransactionRows(
  household_id: string,
  scheme_id: string,
): Promise<any[]> {
  const allIds: string[] = [];
  const pageSize = 1000;
  let offset = 0;
  let total: number | null = null;

  for (;;) {
    const { data, error } = await supabase.rpc('tf_uncategorized_transaction_page', {
      p_scheme_id: scheme_id,
      p_start: null,
      p_end: null,
      p_account_ids: null,
      p_search: null,
      p_limit: pageSize,
      p_offset: offset,
      p_sort_column: 'date',
      p_sort_asc: false,
    });
    if (error) throw error;

    const payload = data as { total?: number; ids?: unknown } | null;
    if (total === null) total = Number(payload?.total ?? 0);
    const rawIds = payload?.ids;
    const ids = Array.isArray(rawIds) ? rawIds.filter((x): x is string => typeof x === 'string') : [];
    if (ids.length === 0) break;
    allIds.push(...ids);
    offset += ids.length;
    if (total !== null && offset >= total) break;
  }

  return fetchTransactionsByIdChunks(household_id, allIds);
}

async function fetchCategorizationsChunked(
  scheme_id: string,
  tx_ids: string[],
): Promise<any[]> {
  if (tx_ids.length === 0) return [];
  const out: any[] = [];
  for (let i = 0; i < tx_ids.length; i += SCOPE_TX_IN_CHUNK) {
    const slice = tx_ids.slice(i, i + SCOPE_TX_IN_CHUNK);
    const { data: catRows, error: catErr } = await supabase
      .from('tf_transaction_categories')
      .select('transaction_id, category_id, source, category:tf_categories(name)')
      .eq('scheme_id', scheme_id)
      .in('transaction_id', slice);
    if (catErr) throw catErr;
    out.push(...((catRows as any[]) ?? []));
  }
  return out;
}

/**
 * Loads the transactions in scope for a dry-run, joined with their current
 * category assignment in the active scheme.
 */
export async function loadScope(
  household_id: string,
  scope: ScopeKind,
): Promise<{
  transactions: ScopeTransaction[];
  source_categories: Map<string, string | undefined>;
}> {
  let txs: any[];

  if (scope.kind === 'uncategorized') {
    txs = await loadUncategorizedTransactionRows(household_id, scope.scheme_id);
  } else if (scope.kind === 'selection') {
    if (scope.transaction_ids.length === 0) {
      return { transactions: [], source_categories: new Map() };
    }
    txs = await fetchTransactionsByIdChunks(household_id, scope.transaction_ids);
  } else {
    const { data: txRows, error: txErr } = await supabase
      .from('tf_transactions')
      .select(TX_SELECT_FOR_SCOPE)
      .eq('household_id', household_id)
      .gte('date', scope.from)
      .lte('date', scope.to);
    if (txErr) throw txErr;
    txs = (txRows as any[]) ?? [];
  }

  if (txs.length === 0) {
    return { transactions: [], source_categories: new Map() };
  }

  const tx_ids = txs.map(t => t.id);

  const scheme_id =
    scope.kind === 'selection'
      ? await getDefaultSchemeId(household_id)
      : scope.scheme_id;

  const catRows = await fetchCategorizationsChunked(scheme_id, tx_ids);

  const catMap = new Map<
    string,
    { category_id: string | null; category_name: string; source: CategorySource }
  >();
  for (const r of catRows) {
    const name = Array.isArray(r.category)
      ? r.category[0]?.name ?? '(unknown)'
      : r.category?.name ?? '(unknown)';
    catMap.set(r.transaction_id, {
      category_id: r.category_id,
      category_name: name,
      source: (r.source as CategorySource) ?? 'manual',
    });
  }

  const inScope = txs;

  const source_categories = new Map<string, string | undefined>();
  const transactions: ScopeTransaction[] = inScope.map(t => {
    const cat = catMap.get(t.id);
    source_categories.set(t.id, t.source_category ?? undefined);
    return {
      id: t.id,
      date: t.date,
      description: t.description,
      amount: Number(t.amount),
      account_name: Array.isArray(t.account) ? t.account[0]?.name ?? '' : t.account?.name ?? '',
      source_category: t.source_category ?? undefined,
      current_category_id: cat?.category_id ?? null,
      current_category_name: cat?.category_name ?? null,
      current_source: cat?.source ?? 'none',
    };
  });

  return { transactions, source_categories };
}

async function getDefaultSchemeId(household_id: string): Promise<string> {
  const { data, error } = await supabase
    .from('tf_category_schemes')
    .select('id')
    .eq('household_id', household_id)
    .eq('is_default', true)
    .single();
  if (error) throw error;
  return data.id;
}

// ============================================================================
// Apply categorizations (commit a dry-run)
// ============================================================================

export async function applyCategorizations(args: {
  scheme_id: string;
  assignments: Array<{
    transaction_id: string;
    category_id: string;
    source: 'rule' | 'manual';
    rule_id?: string;
  }>;
}): Promise<void> {
  const { scheme_id, assignments } = args;
  if (assignments.length === 0) return;

  const CHUNK = 500;
  for (let i = 0; i < assignments.length; i += CHUNK) {
    const slice = assignments.slice(i, i + CHUNK);
    const payload = slice.map(a => ({
      transaction_id: a.transaction_id,
      scheme_id,
      category_id: a.category_id,
      source: a.source,
      rule_id: a.rule_id ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from('tf_transaction_categories')
      .upsert(payload, { onConflict: 'transaction_id,scheme_id' });
    if (error) throw error;
  }
}

// ============================================================================
// Bulk edit
// ============================================================================

export async function applyBulkAction(
  scheme_id: string,
  transaction_ids: string[],
  action: BulkAction,
): Promise<void> {
  if (transaction_ids.length === 0) return;

  switch (action.type) {
    case 'set_category': {
      const payload = transaction_ids.map(tid => ({
        transaction_id: tid,
        scheme_id,
        category_id: action.category_id,
        source: 'manual' as const,
        rule_id: null,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('tf_transaction_categories')
        .upsert(payload, { onConflict: 'transaction_id,scheme_id' });
      if (error) throw error;
      return;
    }
    case 'set_trip': {
      const { error } = await supabase
        .from('tf_transactions')
        .update({ trip_id: action.trip_id })
        .in('id', transaction_ids);
      if (error) throw error;
      return;
    }
    case 'set_tag': {
      const { error } = await supabase
        .from('tf_transactions')
        .update({ tag: action.tag })
        .in('id', transaction_ids);
      if (error) throw error;
      return;
    }
    case 'delete': {
      const { error } = await supabase
        .from('tf_transactions')
        .delete()
        .in('id', transaction_ids);
      if (error) throw error;
      return;
    }
  }
}
