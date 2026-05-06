// Hand-rolled types for the tf_* tables we read/write from the app.
// Replace with `npx supabase gen types typescript` output once the schema
// stabilizes; until then, keep this in sync as new tables/columns get used.
//
// NOTE: supabase-js v2.105+ requires every table entry to include a
// `Relationships: []` array (even if empty) and the schema to have
// `Functions: {}`. Otherwise type inference returns `never` and every
// .insert / .update / select-of-named-columns fails.

// supabase-js requires Relationships: GenericRelationship[] (a mutable array
// type, not `readonly []`). For our hand-rolled types we assert an empty
// array of the right shape — none of our tables have FK metadata defined here.
type EmptyRelationships = Array<{
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}>;

export type Database = {
  public: {
    Tables: {
      tf_households: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['tf_households']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_household_members: {
        Row: { household_id: string; user_id: string; role: string };
        Insert: { household_id: string; user_id: string; role?: string };
        Update: Partial<Database['public']['Tables']['tf_household_members']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_accounts: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          source_type: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          source_type: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tf_accounts']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_category_schemes: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          is_default: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          is_default?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tf_category_schemes']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_categories: {
        Row: {
          id: string;
          household_id: string;
          scheme_id: string;
          name: string;
          group_name: string | null;
          sort_order: number;
          is_yearly: boolean;
          quick_assign: boolean;
          status: string;
          merged_into_id: string | null;
          archived_at: string | null;
          created_at: string;
          color_override: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          scheme_id: string;
          name: string;
          group_name?: string | null;
          sort_order?: number;
          is_yearly?: boolean;
          quick_assign?: boolean;
          status?: string;
          merged_into_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          color_override?: string | null;
        };
        Update: Partial<Database['public']['Tables']['tf_categories']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_trips: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_work: boolean;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_work?: boolean;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tf_trips']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_rules: {
        Row: {
          id: string;
          household_id: string;
          scheme_id: string;
          priority: number;
          name: string;
          conditions: unknown;
          action_category_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          scheme_id: string;
          priority: number;
          name: string;
          conditions: unknown;
          action_category_id: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tf_rules']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_transactions: {
        Row: {
          id: string;
          household_id: string;
          account_id: string;
          date: string;
          description: string;
          amount: number;
          source_category: string | null;
          card_member: string | null;
          external_id: string | null;
          dedupe_hash: string;
          notes: string | null;
          tag: string | null;
          trip_id: string | null;
          imported_at: string;
          flag_for_review: boolean;
        };
        Insert: {
          id?: string;
          household_id: string;
          account_id: string;
          date: string;
          description: string;
          amount: number;
          source_category?: string | null;
          card_member?: string | null;
          external_id?: string | null;
          dedupe_hash: string;
          notes?: string | null;
          tag?: string | null;
          trip_id?: string | null;
          imported_at?: string;
          flag_for_review?: boolean;
        };
        Update: Partial<Database['public']['Tables']['tf_transactions']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_transaction_categories: {
        Row: {
          transaction_id: string;
          scheme_id: string;
          category_id: string | null;
          source: string | null;
          rule_id: string | null;
          updated_at: string;
        };
        Insert: {
          transaction_id: string;
          scheme_id: string;
          category_id?: string | null;
          source?: string | null;
          rule_id?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tf_transaction_categories']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_budgets: {
        Row: {
          id: string;
          household_id: string;
          year: number;
          month: number;
          category_id: string;
          amount: number;
        };
        Insert: {
          id?: string;
          household_id: string;
          year: number;
          month: number;
          category_id: string;
          amount: number;
        };
        Update: Partial<Database['public']['Tables']['tf_budgets']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_revised_budgets: {
        Row: {
          id: string;
          household_id: string;
          year: number;
          as_of_month: number;
          category_id: string;
          month: number;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          year: number;
          as_of_month: number;
          category_id: string;
          month: number;
          amount: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tf_revised_budgets']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_balance_sheet_items: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          type: 'asset' | 'liability';
          sort_order: number;
          is_active: boolean;
          equity_group: string | null;
          value_source_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          type: 'asset' | 'liability';
          sort_order?: number;
          is_active?: boolean;
          equity_group?: string | null;
          value_source_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tf_balance_sheet_items']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_balance_sheet_values: {
        Row: {
          id: string;
          item_id: string;
          as_of_month: string; // ISO date YYYY-MM-01
          value: number;
          notes: string | null;
        };
        Insert: {
          id?: string;
          item_id: string;
          as_of_month: string;
          value: number;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['tf_balance_sheet_values']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_household_settings: {
        Row: {
          household_id: string;
          data: Record<string, unknown>;
          updated_at: string;
        };
        Insert: {
          household_id: string;
          data?: Record<string, unknown>;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tf_household_settings']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_income_plan: {
        // Phase 6: annual projection rows use month=0; per-month actuals use 1..12.
        Row: {
          id: string;
          household_id: string;
          year: number;
          source_name: string;
          month: number;
          amount: number | null;
          is_actual: boolean;
          notes: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          year: number;
          source_name: string;
          month: number;
          amount?: number | null;
          is_actual?: boolean;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['tf_income_plan']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_savings_plan: {
        Row: {
          id: string;
          household_id: string;
          year: number;
          account_name: string;
          month: number;
          amount: number | null;
          is_actual: boolean;
          notes: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          year: number;
          account_name: string;
          month: number;
          amount?: number | null;
          is_actual?: boolean;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['tf_savings_plan']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_tax_assumptions: {
        Row: {
          id: string;
          household_id: string;
          year: number;
          key: string;
          value: number | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          year: number;
          key: string;
          value?: number | null;
        };
        Update: Partial<Database['public']['Tables']['tf_tax_assumptions']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_retire_inputs: {
        // Phase 7: pinned-key model — value stored as text so the same column
        // can hold rates ("0.078"), ages ("60"), and dollars ("180000").
        Row: {
          id: string;
          household_id: string;
          key: string;
          value: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          key: string;
          value: string;
        };
        Update: Partial<Database['public']['Tables']['tf_retire_inputs']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_college_kids: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          birth_year: number;
          current_balance: number;
          monthly_contrib: number;
          return_rate: number;
          start_year: number | null;
          duration_years: number;
          // Phase 7 additions (migration 10):
          annual_cost: number | null;
          cost_inflation: number | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          birth_year: number;
          current_balance: number;
          monthly_contrib: number;
          return_rate: number;
          start_year?: number | null;
          duration_years?: number;
          annual_cost?: number | null;
          cost_inflation?: number | null;
        };
        Update: Partial<Database['public']['Tables']['tf_college_kids']['Row']>;
        Relationships: EmptyRelationships;
      };
      tf_import_batches: {
        Row: {
          id: string;
          household_id: string;
          account_id: string;
          imported_at: string;
          source_file: string | null;
          row_count: number;
          new_count: number;
          imported_by: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          account_id: string;
          imported_at?: string;
          source_file?: string | null;
          row_count: number;
          new_count: number;
          imported_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['tf_import_batches']['Row']>;
        Relationships: EmptyRelationships;
      };
    };
    Views: {
      tf_v_monthly_category_actuals: {
        Row: {
          household_id: string;
          scheme_id: string;
          category_id: string;
          year: number;
          month: number;
          total: number;
          txn_count: number;
        };
        Relationships: EmptyRelationships;
      };
      tf_v_latest_actual_period: {
        Row: {
          household_id: string;
          year: number;
          month: number;
          latest_date: string;
        };
        Relationships: EmptyRelationships;
      };
    };
    Functions: {
      tf_merge_category: {
        Args: { p_source: string; p_target: string };
        Returns: Array<{
          moved_txns: number;
          moved_rules: number;
          moved_budget_cells: number;
        }>;
      };
      tf_uncategorized_transaction_page: {
        Args: {
          p_scheme_id: string;
          p_start: string | null;
          p_end: string | null;
          p_account_ids: string[] | null;
          p_search: string | null;
          p_limit: number;
          p_offset: number;
          p_sort_column: string;
          p_sort_asc: boolean;
        };
        Returns: { total: number; ids: string[] };
      };
      tf_transaction_category_filter_page: {
        Args: {
          p_scheme_id: string;
          p_category_ids: string[];
          p_include_uncategorized: boolean;
          p_start: string | null;
          p_end: string | null;
          p_account_ids: string[] | null;
          p_search: string | null;
          p_limit: number;
          p_offset: number;
          p_sort_column: string;
          p_sort_asc: boolean;
        };
        Returns: { total: number; ids: string[] };
      };
      tf_transaction_distinct_months: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      tf_transaction_import_stats_by_month: {
        Args: { p_household_id: string };
        Returns: Array<{
          account_id: string;
          account_name: string;
          period_month: string;
          txn_count: number;
          amount_sum: number;
        }>;
      };
    };
  };
};
