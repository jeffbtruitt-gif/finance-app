import type { Database } from './database';

export type Transaction = Database['public']['Tables']['tf_transactions']['Row'];
export type Account = Database['public']['Tables']['tf_accounts']['Row'];
export type Category = Database['public']['Tables']['tf_categories']['Row'];
export type TransactionCategory =
  Database['public']['Tables']['tf_transaction_categories']['Row'];

// Joined shape we display in the grid
export interface TransactionRow extends Transaction {
  account_name: string;
  category_name: string | null;
  category_group: string | null;
}
