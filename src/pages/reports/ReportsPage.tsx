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
import { StatusPanel } from '@/components/StatusPanel';
import { Button } from '@/components/ds';
import { ReportsDashboard } from '@/pages/reports/ReportsDashboard';
import { ReportsSpendTable } from '@/pages/reports/ReportsSpendTable';
import { ReportsTreemap } from '@/pages/reports/ReportsTreemap';
import { TransactionPropertiesDrawer } from '@/pages/transactions/TransactionPropertiesDrawer';
import {
  ReportDrillDetail,
  ReportTabButton,
  filterDrillTransactions,
  type DrillState,
} from '@/pages/reports/ReportDrillDetail';

type TabId = 'dashboard' | 'table' | 'tree' | 'detail';

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

  const filteredTx = useMemo(() => filterDrillTransactions(txQ.data, drill), [txQ.data, drill]);

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

  // Header (tabs) is always full width and left-aligned. Content is left-aligned too; the
  // Table tab uses the full width (like the YTD table), the others cap at 6xl.
  const contentWidth = tab === 'table' ? 'max-w-none' : 'max-w-6xl';

  const displayMonthlyActual = isFuture ? 0 : (model?.monthly.actual ?? 0);
  const displayMonthlyBudget = model?.monthly.budget ?? 0;

  return (
    <div className="display-num min-h-full bg-navy-50">
      <header className="sticky top-0 z-20 border-b border-navy-100 bg-navy-50/95 px-8 py-4 backdrop-blur-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex gap-1">
              <ReportTabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
                Dashboard
              </ReportTabButton>
              <ReportTabButton active={tab === 'table'} onClick={() => setTab('table')}>
                Table
              </ReportTabButton>
              <ReportTabButton active={tab === 'tree'} onClick={() => setTab('tree')}>
                Tree
              </ReportTabButton>
              <ReportTabButton active={tab === 'detail'} onClick={() => setTab('detail')} showDot={!!drill}>
                Detail
              </ReportTabButton>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={exportCsv} disabled={!model}>
              Export CSV
            </Button>
          </div>
        </div>
      </header>

      <div className={`${contentWidth} px-8 py-8`}>
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
              <ReportDrillDetail
                transactions={filteredTx}
                isLoading={txQ.isLoading}
                error={txQ.error}
                drill={drill}
                onClearDrill={() => setDrill(null)}
                onDrillCategory={onDrillCategory}
                onOpenTransaction={setDetailTxnId}
                emptyHint="Clear the filter or pick another category from the Dashboard or Table tab."
              />
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

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
