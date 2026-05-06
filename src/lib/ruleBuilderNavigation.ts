/** Passed when navigating to /rules/new so large selections are not clipped by URL limits. */
export type RuleBuilderLocationState = {
  ruleBuilderFromIds?: string[];
};

export const RULE_BUILDER_FROM_IDS_KEY = 'ruleBuilderFromIds' as const;
