import type {
  Rule,
  MatchableTransaction,
  DryRunRow,
  DryRunSummary,
  CategorySource,
} from '../../types/phase2';
import { evaluateRulesBatch } from './engine';

/**
 * Inputs for the dry run. Caller assembles these from DB queries.
 *
 * `scope_transactions` is whatever the user selected: all uncategorized,
 * a date range, or a hand-picked selection from the grid. We don't filter
 * here — we compute the impact of running rules on whatever you give us.
 */
export interface DryRunInput {
  rules: Rule[];
  scope_transactions: Array<MatchableTransaction & {
    date: string;
    current_category_id: string | null;
    current_category_name: string | null;
    current_source: CategorySource;
  }>;
  /** category_id → display name lookup */
  category_names: Map<string, string>;
}

export function computeDryRun(input: DryRunInput): DryRunSummary {
  const { rules, scope_transactions, category_names } = input;

  // Build matchable view for rule engine
  const matchable = scope_transactions.map(t => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    account_name: t.account_name,
    source_category: t.source_category,
  }));

  const ruleMatches = evaluateRulesBatch(rules, matchable);

  const rows: DryRunRow[] = [];
  let newly_categorized = 0;
  let rule_to_rule = 0;
  let manual_to_rule = 0;
  let rule_match_count = 0;
  let no_match = 0;

  for (const tx of scope_transactions) {
    const ruleHit = ruleMatches.get(tx.id);
    if (!ruleHit) {
      no_match++;
      continue; // not part of the dry-run preview rows
    }

    const proposed_category_id = ruleHit.category_id;
    const proposed_category_name = category_names.get(ruleHit.category_id) ?? '(unknown)';
    const matched_rule_id = ruleHit.rule_id;
    const matched_rule_name = ruleHit.rule_name;
    rule_match_count++;

    // Skip rows where the proposal matches the current category — no change
    if (
      tx.current_category_id === proposed_category_id &&
      tx.current_source !== 'none'
    ) {
      continue;
    }

    const overwrites_manual = tx.current_source === 'manual';

    if (tx.current_source === 'none') {
      newly_categorized++;
    } else if (tx.current_source === 'rule') {
      rule_to_rule++;
    } else if (tx.current_source === 'manual') {
      manual_to_rule++;
    }

    rows.push({
      transaction_id: tx.id,
      description: tx.description,
      date: tx.date,
      amount: tx.amount,
      account_name: tx.account_name,

      current_category_id: tx.current_category_id,
      current_category_name: tx.current_category_name,
      current_source: tx.current_source,

      proposed_category_id,
      proposed_category_name,
      proposed_source: 'rule',
      matched_rule_id,
      matched_rule_name,

      overwrites_manual,
      // Default: include unless it overwrites a manual selection
      default_included: !overwrites_manual,
    });
  }

  return {
    total_in_scope: scope_transactions.length,
    newly_categorized,
    rule_to_rule,
    manual_to_rule,
    by_source: {
      rule_matches: rule_match_count,
      no_match,
    },
    rows,
  };
}
