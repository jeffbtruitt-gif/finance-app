import { supabase } from '@/api/supabase';
import { listRules, loadScope, applyCategorizations } from '@/api/phase2';
import { computeDryRun } from './dryRun';

/**
 * Applies the active rules to every uncategorized transaction and saves the
 * result. The scope is "uncategorized" only, so this can never overwrite a
 * manual selection or reassign a row that a rule already categorized.
 *
 * Returns the number of transactions categorized.
 */
export async function runRulesOnUncategorized(
  householdId: string,
  schemeId: string,
): Promise<number> {
  const [rules, scopeData, categories] = await Promise.all([
    listRules(schemeId),
    loadScope(householdId, { kind: 'uncategorized', scheme_id: schemeId }),
    supabase
      .from('tf_categories')
      .select('id, name')
      .eq('scheme_id', schemeId)
      .then((r) => {
        if (r.error) throw r.error;
        return r.data ?? [];
      }),
  ]);

  const dryRun = computeDryRun({
    rules,
    scope_transactions: scopeData.transactions,
    category_names: new Map(categories.map((c) => [c.id, c.name])),
  });

  const assignments = dryRun.rows.map((r) => ({
    transaction_id: r.transaction_id,
    category_id: r.proposed_category_id,
    source: 'rule' as const,
    rule_id: r.matched_rule_id,
  }));
  if (assignments.length > 0) {
    await applyCategorizations({ scheme_id: schemeId, assignments });
  }
  return assignments.length;
}
