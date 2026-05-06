// ============================================================================
// Phase 2 shared types
// ============================================================================

export type SourceType = 'discover' | 'amex' | 'bcu_visa' | 'bcu_powerplus' | 'manual';

/**
 * The internal shape every parser produces. Sign convention is already
 * normalized here (out = positive). Sources that report "in = positive"
 * (BCU) are flipped at parse time.
 */
export interface ParsedTransaction {
  date: string;              // ISO YYYY-MM-DD
  description: string;
  amount: number;            // out = positive, in = negative
  source_category?: string;  // raw category from bank export, kept as a hint
  card_member?: string;      // Amex only
  external_id?: string;      // bank's transaction ID if available (BCU)
  raw_row: Record<string, string>; // original CSV row, for debugging
}

export interface ParseResult {
  source_type: SourceType;
  transactions: ParsedTransaction[];
  warnings: string[];        // non-fatal issues (skipped rows, format quirks)
  errors: string[];          // fatal issues that prevented parsing
}

/** What a parser exports */
export interface SourceParser {
  source_type: SourceType;
  /** Returns true if the CSV header looks like this source's format. */
  detect: (headerRow: string[]) => boolean;
  /** Parses all rows; assumes detect() returned true. */
  parse: (rows: Record<string, string>[]) => ParseResult;
}

// ============================================================================
// Import preview / commit shapes
// ============================================================================

/**
 * A row in the import preview that has been matched against either an
 * existing DB row or another row earlier in the same import batch. Used by
 * the duplicates panel to show the user "what does this look like a
 * duplicate of?" so they can decide whether to override the dup flag.
 */
export interface DuplicateMatch {
  /** Where the matching row came from. */
  source: 'db' | 'batch';
  /** Why we matched on this — same as the duplicate_match_type at the row level. */
  via: 'external_id' | 'hash';
  date: string;
  description: string;
  amount: number;
  /** For `source: 'db'`: when the row was originally imported. */
  imported_at?: string | null;
  /** For `source: 'batch'`: the file this row came from. */
  file_name?: string;
  /** For `source: 'db'`: the existing transaction id (so we can deep-link if useful later). */
  txn_id?: string;
}

export interface ImportPreviewRow {
  parsed: ParsedTransaction;
  dedupe_hash: string;
  is_duplicate: boolean;          // exists in DB already
  duplicate_match_type?: 'external_id' | 'hash';
  /**
   * The actual rows this preview row is matching against — either previously
   * imported DB rows, or earlier rows in the current batch with the same
   * hash. Empty/undefined when `is_duplicate === false`.
   */
  duplicate_matches?: DuplicateMatch[];
  trip_match?: { trip_id: string; trip_name: string };
}

export interface ImportPreview {
  source_type: SourceType;
  account_id: string;
  source_file: string;
  total_rows: number;
  new_rows: ImportPreviewRow[];
  duplicate_rows: ImportPreviewRow[];
  trip_tagged_count: number;
  warnings: string[];
}

// ============================================================================
// Rule engine types
// ============================================================================

export type RuleCondition =
  | { field: 'description'; op: 'contains' | 'equals' | 'starts_with' | 'regex';
      value: string; case_insensitive?: boolean }
  | { field: 'amount'; op: 'between'; min: number; max: number }
  | { field: 'amount'; op: 'eq' | 'gt' | 'lt'; value: number }
  | { field: 'account'; op: 'is'; value: string }; // account name

export interface Rule {
  id: string;
  household_id: string;
  scheme_id: string;
  priority: number;
  name: string;
  conditions: RuleCondition[];
  action_category_id: string;
  is_active: boolean;
}

/**
 * What a transaction looks like for the purpose of rule matching.
 * (Not the full DB row — just the fields rules care about.)
 */
export interface MatchableTransaction {
  id: string;
  description: string;
  amount: number;
  account_name: string;
  source_category?: string;
  /** ISO date; included when loaded for rule-builder preview. */
  date?: string;
  flag_for_review?: boolean;
}

// ============================================================================
// Dry-run preview types
// ============================================================================

export type CategorySource = 'rule' | 'manual' | 'none';

export interface DryRunRow {
  transaction_id: string;
  description: string;
  date: string;
  amount: number;
  account_name: string;

  current_category_id: string | null;
  current_category_name: string | null;
  current_source: CategorySource;

  proposed_category_id: string;
  proposed_category_name: string;
  proposed_source: 'rule';
  matched_rule_id?: string;
  matched_rule_name?: string;

  /** True if applying this would overwrite a manual selection. */
  overwrites_manual: boolean;
  /** Default include flag — false for manual overrides, true otherwise. */
  default_included: boolean;
}

export interface DryRunSummary {
  total_in_scope: number;
  newly_categorized: number;          // current_source = 'none'
  rule_to_rule: number;
  manual_to_rule: number;             // the warning bucket
  by_source: {
    rule_matches: number;
    no_match: number;
  };
  rows: DryRunRow[];
}

// ============================================================================
// Bulk edit
// ============================================================================

export type BulkAction =
  | { type: 'set_category'; category_id: string }
  | { type: 'set_trip'; trip_id: string | null }
  | { type: 'set_tag'; tag: string | null }
  | { type: 'delete' };
