import type { Rule, RuleCondition, MatchableTransaction } from '../../types/phase2';

/**
 * Rule engine.
 *
 * Algorithm (per the master plan):
 *   1. Sort active rules by priority ascending
 *   2. For each transaction, walk the rules
 *   3. First rule whose ALL conditions match → assign that rule's category, stop
 *   4. If no rule matches → return null (caller can then check hint mapping)
 *
 * All conditions within a rule AND together. There is no OR — to express OR,
 * the user creates two rules.
 */

function matchCondition(c: RuleCondition, t: MatchableTransaction): boolean {
  switch (c.field) {
    case 'description': {
      const haystack = c.case_insensitive !== false
        ? t.description.toLowerCase()
        : t.description;
      const needle = c.case_insensitive !== false
        ? c.value.toLowerCase()
        : c.value;
      switch (c.op) {
        case 'contains':    return haystack.includes(needle);
        case 'equals':      return haystack === needle;
        case 'starts_with': return haystack.startsWith(needle);
        case 'regex': {
          try {
            const flags = c.case_insensitive !== false ? 'i' : '';
            return new RegExp(c.value, flags).test(t.description);
          } catch {
            return false; // bad regex = never matches
          }
        }
      }
      return false; // exhaustive, but TS needs it
    }

    case 'amount': {
      switch (c.op) {
        case 'between': return t.amount >= c.min && t.amount <= c.max;
        case 'eq':      return t.amount === c.value;
        case 'gt':      return t.amount > c.value;
        case 'lt':      return t.amount < c.value;
      }
      return false;
    }

    case 'account': {
      // op is 'is'
      return t.account_name === c.value;
    }
  }
  return false;
}

export interface RuleMatch {
  rule_id: string;
  rule_name: string;
  category_id: string;
}

/**
 * Evaluate one transaction against the (priority-sorted) rule list.
 * Returns the first match or null.
 */
export function evaluateRules(
  rules: Rule[],
  tx: MatchableTransaction,
): RuleMatch | null {
  for (const rule of rules) {
    if (!rule.is_active) continue;
    if (rule.conditions.length === 0) continue;
    const allMatch = (rule.conditions as RuleCondition[]).every((c) => matchCondition(c, tx));
    if (allMatch) {
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        category_id: rule.action_category_id,
      };
    }
  }
  return null;
}

/**
 * Bulk version — evaluates many transactions against the rule list at once.
 * Sorts rules by priority once, then walks each transaction.
 */
export function evaluateRulesBatch(
  rules: Rule[],
  transactions: MatchableTransaction[],
): Map<string, RuleMatch> {
  const sorted = [...rules]
    .filter(r => r.is_active && r.conditions.length > 0)
    .sort((a, b) => a.priority - b.priority);

  const results = new Map<string, RuleMatch>();
  for (const tx of transactions) {
    for (const rule of sorted) {
      if ((rule.conditions as RuleCondition[]).every((c) => matchCondition(c, tx))) {
        results.set(tx.id, {
          rule_id: rule.id,
          rule_name: rule.name,
          category_id: rule.action_category_id,
        });
        break;
      }
    }
  }
  return results;
}

/** Useful for the live preview in the rule builder. */
export function countMatches(
  rule: Pick<Rule, 'conditions'>,
  transactions: MatchableTransaction[],
): number {
  if (rule.conditions.length === 0) return 0;
  let n = 0;
  for (const tx of transactions) {
    if ((rule.conditions as RuleCondition[]).every((c) => matchCondition(c, tx))) n++;
  }
  return n;
}

/** Transactions that satisfy every condition on the draft rule (rule builder preview list). */
export function listMatchingTransactions(
  rule: Pick<Rule, 'conditions'>,
  transactions: MatchableTransaction[],
): MatchableTransaction[] {
  if (rule.conditions.length === 0) return [];
  const conds = rule.conditions as RuleCondition[];
  return transactions.filter((tx) => conds.every((c) => matchCondition(c, tx)));
}
