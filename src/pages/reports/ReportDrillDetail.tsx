import { RT, Card, CategoryChip } from '@/components/ds';
import { StatusPanel } from '@/components/StatusPanel';
import type { ReportShellTransaction } from '@/api/reports';
import { fmtUsd, moneyClass } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { accountStripeHex } from '@/pages/transactions/txAccountColor';
import { DescriptionSearchLink } from '@/pages/transactions/DescriptionSearchLink';

/**
 * Shared "drill to transactions" pieces for the budget reports (1 MO and YTD):
 * double-click a category or group row in the table to open the Detail tab
 * filtered to it.
 */

export type DrillState =
  | null
  | { kind: 'category'; id: string; name: string }
  | { kind: 'group'; key: string; label: string };

export function txMatchesGroup(t: ReportShellTransaction, drillKey: string): boolean {
  const g = t.category_group;
  if (drillKey === 'Uncategorized') return !t.category_id;
  if (!g) return false;
  if (drillKey === 'Yearly') return g === 'Yearly';
  if (drillKey === 'Rent & House Maintenance') {
    return g === 'Rent & House Maintenance' || g === 'Rent & Utilities';
  }
  return g === drillKey;
}

/** Apply the drill filter and sort largest amount first. */
export function filterDrillTransactions(
  rows: ReportShellTransaction[] | undefined,
  drill: DrillState,
): ReportShellTransaction[] {
  let filtered = rows ?? [];
  if (drill?.kind === 'category') {
    filtered = filtered.filter((t) => t.category_id === drill.id);
  } else if (drill?.kind === 'group') {
    filtered = filtered.filter((t) => txMatchesGroup(t, drill.key));
  }
  return [...filtered].sort((a, b) => b.amount - a.amount);
}

export function ReportDrillDetail(props: {
  transactions: ReportShellTransaction[];
  isLoading: boolean;
  error: unknown;
  drill: DrillState;
  onClearDrill: () => void;
  onDrillCategory: (id: string, name: string) => void;
  onOpenTransaction: (id: string) => void;
  emptyHint: string;
}) {
  const {
    transactions,
    isLoading,
    error,
    drill,
    onClearDrill,
    onDrillCategory,
    onOpenTransaction,
    emptyHint,
  } = props;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onClearDrill}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            !drill
              ? 'border-navy-500 bg-navy-800 text-white'
              : 'border-navy-200 bg-white text-navy-700 hover:bg-navy-50'
          }`}
        >
          All transactions
        </button>
        {drill?.kind === 'category' && (
          <CategoryChip
            name={`Category: ${drill.name}`}
            onRemove={onClearDrill}
          />
        )}
        {drill?.kind === 'group' && (
          <span className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-navy-100 px-2 py-0.5 text-[11px] font-semibold text-navy-800">
            Group: {drill.label}
            <button
              type="button"
              className="ml-1 rounded-full px-1 hover:bg-navy-200"
              aria-label="Clear group filter"
              onClick={onClearDrill}
            >
              ×
            </button>
          </span>
        )}
      </div>

      {isLoading && <StatusPanel kind="loading" message="Loading transactions…" />}
      {error != null && (
        <StatusPanel kind="error" message="Couldn't load transactions." detail={(error as Error).message} />
      )}
      {!isLoading && error == null && transactions.length === 0 && (
        <Card>
          <p className="text-sm text-gray-700">
            No transactions match this filter. {emptyHint}
          </p>
        </Card>
      )}
      {transactions.length > 0 && (
        <Card padded={false}>
          <table className={RT.table}>
            <thead className={RT.head}>
              <tr>
                <th className={`${RT.th} ${RT.thLeft}`}>Date</th>
                <th className={`${RT.th} ${RT.thLeft}`}>Description</th>
                <th className={`${RT.th} ${RT.thLeft} w-[148px] max-w-[148px]`}>
                  Account
                </th>
                <th className={`${RT.th} ${RT.thLeft}`}>Category</th>
                <th className={`${RT.th} ${RT.thRight}`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr
                  key={t.id}
                  className={`${RT.detailRow} cursor-pointer hover:bg-navy-50/50`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-no-row-select]')) return;
                    onOpenTransaction(t.id);
                  }}
                >
                  <td className={`${RT.cellLeft} tabular-nums text-gray-600`}>
                    {formatDate(t.date)}
                  </td>
                  <td className={`${RT.cellLeft} font-medium text-navy-900`}>
                    <div className="group flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{t.description}</span>
                      <DescriptionSearchLink description={t.description} />
                    </div>
                  </td>
                  <td className={`${RT.cellLeft} w-[148px] max-w-[148px]`}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-6 w-1 shrink-0 rounded-full"
                        style={{
                          backgroundColor: accountStripeHex(t.account_id),
                        }}
                      />
                      <span className="truncate text-gray-700">{t.account_name}</span>
                    </div>
                  </td>
                  <td className={RT.cellLeft}>
                    {t.category_id && t.category_name ? (
                      <button
                        type="button"
                        data-no-row-select
                        className="text-left font-medium text-navy-700 underline decoration-navy-200 underline-offset-2 hover:text-navy-900"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onDrillCategory(t.category_id!, t.category_name!);
                        }}
                      >
                        {t.category_name}
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className={`${RT.cellRight} font-semibold tabular-nums ${moneyClass(t.amount)}`}>
                    {fmtUsd(t.amount, { decimals: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export function ReportTabButton({
  children,
  active,
  onClick,
  showDot,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  showDot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 pb-2 text-sm font-semibold transition-colors ${
        active ? 'text-navy-900' : 'text-gray-500 hover:text-navy-700'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {showDot && (
          <span
            className="inline-block h-2 w-2 rounded-full bg-gold-500"
            aria-label="Filter active"
            title="Detail filter active"
          />
        )}
      </span>
      {active && (
        <span className="absolute bottom-0 left-0 right-0 border-b-[3px] border-gold-500" />
      )}
    </button>
  );
}
