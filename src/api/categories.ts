import { supabase } from '@/api/supabase';
import type { Category } from '@/types';

export type CategoryRow = Category;

export async function listCategories(schemeId: string): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from('tf_categories')
    .select('*')
    .eq('scheme_id', schemeId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

export async function createCategory(input: {
  household_id: string;
  scheme_id: string;
  name: string;
  group_name: string | null;
  is_yearly: boolean;
  quick_assign?: boolean;
  color_override?: string | null;
}): Promise<CategoryRow> {
  const { data: top } = await supabase
    .from('tf_categories')
    .select('sort_order')
    .eq('scheme_id', input.scheme_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (top?.sort_order ?? 0) + 10;

  const { data, error } = await supabase
    .from('tf_categories')
    .insert({
      household_id: input.household_id,
      scheme_id: input.scheme_id,
      name: input.name.trim(),
      group_name: input.group_name,
      is_yearly: input.is_yearly,
      quick_assign: input.quick_assign ?? false,
      sort_order: nextOrder,
      status: 'active',
      color_override: input.color_override ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as CategoryRow;
}

export async function updateCategory(
  id: string,
  patch: Partial<
    Pick<
      CategoryRow,
      'name' | 'group_name' | 'is_yearly' | 'quick_assign' | 'status' | 'color_override'
    >
  >,
): Promise<CategoryRow> {
  const { data, error } = await supabase
    .from('tf_categories')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as CategoryRow;
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('tf_categories').update({ sort_order: i + 1 }).eq('id', id),
    ),
  );
  for (const r of results) {
    if (r.error) throw r.error;
  }
}

export async function archiveCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('tf_categories')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function restoreCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('tf_categories')
    .update({
      status: 'active',
      archived_at: null,
      merged_into_id: null,
    })
    .eq('id', id);
  if (error) throw error;
}

export class CategoryInUseError extends Error {
  readonly code = 'IN_USE' as const;
  constructor() {
    super('Category is still referenced');
    this.name = 'CategoryInUseError';
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('tf_categories').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') throw new CategoryInUseError();
    throw error;
  }
}

export async function mergeCategory(
  sourceId: string,
  targetId: string,
): Promise<{ movedTxns: number; movedRules: number; movedBudgetCells: number }> {
  const { data, error } = await supabase.rpc('tf_merge_category', {
    p_source: sourceId,
    p_target: targetId,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) {
    return { movedTxns: 0, movedRules: 0, movedBudgetCells: 0 };
  }
  return {
    movedTxns: Number(row.moved_txns),
    movedRules: Number(row.moved_rules),
    movedBudgetCells: Number(row.moved_budget_cells),
  };
}

export async function fetchCategoryUsage(args: {
  categoryId: string;
  schemeId: string;
}): Promise<{ txnCount: number; ruleCount: number; budgetCellCount: number }> {
  const [txQ, rulesQ, budQ] = await Promise.all([
    supabase
      .from('tf_transaction_categories')
      .select('transaction_id', { count: 'exact', head: true })
      .eq('scheme_id', args.schemeId)
      .eq('category_id', args.categoryId),
    supabase
      .from('tf_rules')
      .select('id', { count: 'exact', head: true })
      .eq('action_category_id', args.categoryId),
    supabase
      .from('tf_budgets')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', args.categoryId),
  ]);
  if (txQ.error) throw txQ.error;
  if (rulesQ.error) throw rulesQ.error;
  if (budQ.error) throw budQ.error;
  return {
    txnCount: txQ.count ?? 0,
    ruleCount: rulesQ.count ?? 0,
    budgetCellCount: budQ.count ?? 0,
  };
}
