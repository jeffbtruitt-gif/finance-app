// Hand-rolled minimal types for Phase 1.
// In a later phase, replace with `npx supabase gen types typescript` output.

export type Database = {
  public: {
    Tables: {
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
        };
        Insert: never;
        Update: never;
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
        Insert: never;
        Update: never;
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
          status: string;
          merged_into_id: string | null;
          archived_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
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
        Insert: never;
        Update: never;
      };
      tf_household_members: {
        Row: {
          household_id: string;
          user_id: string;
          role: string;
        };
        Insert: never;
        Update: never;
      };
    };
  };
};
