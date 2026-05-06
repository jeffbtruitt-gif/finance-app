import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchMonthlyActuals,
  fetchBudgetYear,
  fetchSchemeCategories,
  fetchReportShellTransactions,
  actualsToLookup,
  budgetsToLookup,
} from '@/api/reports';
import type { ReportShellTransaction } from '@/api/reports';
import {
  buildMonthlyReportGroups,
  buildYearlyReportRows,
  buildTrendTotals,
  monthlySpendTotals,
  isFuturePeriod,
  type ReportMonthGroup,
} from '@/features/reports/monthlyReportModel';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { formatPeriod, periodEndIso, periodStartIso, shiftPeriod } from '@/lib/period';
import { fmtUsd, moneyClass } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { StatusPanel } from '@/components/StatusPanel';
import { Button, Card, CategoryChip, RT } from '@/components/ds';
import { ReportsDashboard } from '@/pages/reports/ReportsDashboard';
import { ReportsSpendTable } from '@/pages/reports/ReportsSpendTable';
import { ReportsTreemap } from '@/pages/reports/ReportsTreemap';
import { accountStripeHex } from '@/pages/transactions/txAccountColor';
import { TransactionPropertiesDrawer } from '@/pages/transactions/TransactionPropertiesDrawer';

type TabId = 'dashboard' | 'table' | 'tree' | 'detail';

type DrillState =
  | null
  | { kind: 'category'; id: string; name: string }
  | { kind: 'group'; key: string; label: string };

function txMatchesGroup(t: ReportShellTransaction, drillKey: string): boolean {
  const g = t.category_group;
  if (!g) return false;
  if (drillKey === 'Yearly') return g === 'Yearly';
  if (drillKey === 'Rent & House Maintenance') {
    return g === 'Rent & House Maintenance' || g === 'Rent & Utilities';
  }
  return g === drillKey;
}

export function ReportsPage() {
  const household = useHousehold();
  const { period } = useAppPeriod();
  const [tab, setTab] = useState<TabId>('dashboard');
  const [drill, setDrill] = useState<DrillState>(null);
  const [detailTxnId, setDetailTxnId] = useState<string | null>(null);

  const schemeQ = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });

  const categoriesQ = useQuery({
    queryKey: ['scheme-categories', schemeQ.data],
    enabled: !!schemeQ.data,
    queryFn: () => fetchSchemeCategories(schemeQ.data!),
  });

  const trendFrom = useMemo(() => shiftPeriod(period, -11), [period]);

  const actualsQ = useQuery({
    queryKey: ['reports-monthly-actuals', household?.id, schemeQ.data, trendFrom, period],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: trendFrom,
        to: period,
      }),
  });

  const budgetQ = useQuery({
    queryKey: ['budget-year', household?.id, period.year],
    enabled: !!household?.id,
    queryFn: () => fetchBudgetYear({ household_id: household!.id, year: period.year }),
  });

  const txQ = useQuery({
    queryKey: ['reports-shell-tx', household?.id, schemeQ.data, period],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchReportShellTransactions({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: periodStartIso(period),
        to: periodEndIso(period),
      }),
  });

  const label = formatPeriod(period);
  const isFuture = isFuturePeriod(period);

  const model = useMemo(() => {
    if (!categoriesQ.data || !actualsQ.data || !budgetQ.data) return null;
    const actuals = actualsToLookup(actualsQ.data);
    const budgets = budgetsToLookup(budgetQ.data);
    const monthlyGroups = buildMonthlyReportGroups({
      categories: categoriesQ.data,
      period,
      actuals,
      budgets,
    });
    const yearlyItems = buildYearlyReportRows({
      categories: categoriesQ.data,
      period,
      actuals,
      budgets,
    });
    const yearlyGroup: ReportMonthGroup | null =
      yearlyItems.length > 0
        ? { name: 'YEARLY', drillKey: 'Yearly', items: yearlyItems }
        : null;
    const trend = buildTrendTotals({
      categories: categoriesQ.data,
      anchor: period,
      actuals,
      budgets,
    });
    const monthly = monthlySpendTotals({ categories: categoriesQ.data, period, actuals, budgets });
    return {
      monthlyGroups,
      yearlyGroup,
      yearlyItems,
      trend,
      monthly,
      actuals,
      budgets,
    };
  }, [categoriesQ.data, actualsQ.data, budgetQ.data, period]);

  const filteredTx = useMemo(() => {
    const rows = txQ.data ?? [];
    let filtered = rows;
    if (drill?.kind === 'category') {
      filtered = rows.filter((t) => t.category_id === drill.id);
    } else if (drill?.kind === 'group') {
      filtered = rows.filter((t) => txMatchesGroup(t, drill.key));
    }
    return [...filtered].sort((a, b) => b.amount - a.amount);
  }, [txQ.data, drill]);

  const drillToDetail = useCallback((next: DrillState) => {
    setDrill(next);
    setTab('detail');
  }, []);

  const onDrillCategory = useCallback(
    (id: string, name: string) => {
      drillToDetail({ kind: 'category', id, name });
    },
    [drillToDetail],
  );

  const onDrillGroup = useCallback(
    (drillKey: string, displayLabel: string) => {
      drillToDetail({ kind: 'group', key: drillKey, label: displayLabel });
    },
    [drillToDetail],
  );

  const exportCsv = useCallback(() => {
    if (!model) return;
    const lines: string[] = [['Section', 'Group', 'Category', 'Actual', 'Budget'].join(',')];
    for (const g of model.monthlyGroups) {
      for (const it of g.items) {
        lines.push(
          ['Monthly', csvEscape(g.name), csvEscape(it.name), it.actual, it.budget].join(','),
        );
      }
    }
    if (model.yearlyGroup) {
      for (const it of model.yearlyGroup.items) {
        lines.push(['Yearly', 'YEARLY', csvEscape(it.name), it.actual, it.budget].join(','));
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `monthly-report-${period.year}-${String(period.month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [model, period]);

  const loading =
    schemeQ.isLoading ||
    categoriesQ.isLoading ||
    actualsQ.isLoading ||
    budgetQ.isLoading;
  const err = schemeQ.error ?? categoriesQ.error ?? actualsQ.error ?? budgetQ.error;

  const displayMonthlyActual = isFuture ? 0 : (model?.monthly.actual ?? 0);
  const displayMonthlyBudget = model?.monthly.budget ?? 0;

  return (
    <div className="display-num min-h-full bg-navy-50">
      <header className="sticky top-0 z-20 border-b border-navy-100 bg-navy-50/95 px-8 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex gap-1">
              <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
                Dashboard
              </TabButton>
              <TabButton active={tab === 'table'} onClick={() => setTab('table')}>
                Table
              </TabButton>
              <TabButton active={tab === 'tree'} onClick={() => setTab('tree')}>
                Tree
              </TabButton>
              <TabButton active={tab === 'detail'} onClick={() => setTab('detail')} showDot={!!drill}>
                Detail
              </TabButton>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={exportCsv} disabled={!model}>
              Export CSV
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-8 py-8">
        {loading && <StatusPanel kind="loading" message="Loading report…" />}
        {!loading && err && (
          <StatusPanel kind="error" message="Couldn't load the report." detail={(err as Error).message} />
        )}
        {!loading && !err && model && (
          <>
            {tab === 'dashboard' && (
              <ReportsDashboard
                label={label}
                monthlyActual={displayMonthlyActual}
                monthlyBudget={displayMonthlyBudget}
                groups={model.monthlyGroups}
                trend={model.trend}
                onDrillCategory={onDrillCategory}
                onDrillGroup={onDrillGroup}
              />
            )}
            {tab === 'table' && (
              <ReportsSpendTable
                monthlyGroups={model.monthlyGroups}
                yearlyGroup={model.yearlyGroup}
                isFuture={isFuture}
                onDrillCategory={onDrillCategory}
                onDrillGroup={onDrillGroup}
              />
            )}
            {tab === 'tree' && (
              <div className="space-y-4">
                <p className="text-caption text-gray-500">
                  Each card follows the Spend Treemap pattern: tile area matches share of that group&apos;s spend.
                  Click a tile for Detail; double-click the group label under the subtitle to filter the whole group.
                </p>
                <ReportsTreemap
                  groups={model.monthlyGroups}
                  onDrillItem={onDrillCategory}
                  onDrillGroup={onDrillGroup}
                />
              </div>
            )}
            {tab === 'detail' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDrill(null)}
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
                      onRemove={() => setDrill(null)}
                    />
                  )}
                  {drill?.kind === 'group' && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-navy-100 px-2 py-0.5 text-[11px] font-semibold text-navy-800">
                      Group: {drill.label}
                      <button
                        type="button"
                        className="ml-1 rounded-full px-1 hover:bg-navy-200"
                        aria-label="Clear group filter"
                        onClick={() => setDrill(null)}
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>

                {txQ.isLoading && <StatusPanel kind="loading" message="Loading transactions…" />}
                {txQ.error && (
                  <StatusPanel kind="error" message="Couldn't load transactions." detail={(txQ.error as Error).message} />
                )}
                {txQ.data && filteredTx.length === 0 && (
                  <Card>
                    <p className="text-sm text-gray-700">
                      No transactions match this filter. Clear the filter or pick another category from the
                      Dashboard or Table tab.
                    </p>
                  </Card>
                )}
                {txQ.data && filteredTx.length > 0 && (
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
                        {filteredTx.map((t) => (
                          <tr
                            key={t.id}
                            className={`${RT.detailRow} cursor-pointer hover:bg-navy-50/50`}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('[data-no-row-select]')) return;
                              setDetailTxnId(t.id);
                            }}
                          >
                            <td className={`${RT.cellLeft} tabular-nums text-gray-600`}>
                              {formatDate(t.date)}
                            </td>
                            <td className={`${RT.cellLeft} font-medium text-navy-900`}>{t.description}</td>
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
            )}
          </>
        )}
      </div>

      <TransactionPropertiesDrawer
        open={detailTxnId !== null}
        onClose={() => setDetailTxnId(null)}
        transactionId={detailTxnId}
        schemeId={schemeQ.data ?? null}
      />
    </div>
  );
}

function TabButton({
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

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
