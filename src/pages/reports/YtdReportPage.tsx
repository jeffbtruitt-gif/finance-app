import { Fragment, useCallback, useMemo, useState } from 'react';
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
import { buildSpendReport } from '@/features/reports/grouping';
import { buildMonthlyReportGroups, buildTrendForPeriods } from '@/features/reports/monthlyReportModel';
import { ReportsDashboard } from '@/pages/reports/ReportsDashboard';
import { ReportsTreemap } from '@/pages/reports/ReportsTreemap';
import {
  fmtUsd,
  variance,
  variancePct,
  fmtPct,
  varianceClass,
} from '@/lib/money';
import { formatPeriod, periodEndIso, yearStartIso, ytdPeriods, type Period } from '@/lib/period';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { StatusPanel } from '@/components/StatusPanel';
import { Card, RT } from '@/components/ds';
import { TransactionPropertiesDrawer } from '@/pages/transactions/TransactionPropertiesDrawer';
import {
  ReportDrillDetail,
  ReportTabButton,
  filterDrillTransactions,
  type DrillState,
} from '@/pages/reports/ReportDrillDetail';

type DrillHandlers = {
  onDrillCategory: (id: string, name: string) => void;
  onDrillGroup: (drillKey: string, displayLabel: string) => void;
};

export function YtdReportPage() {
  const household = useHousehold();
  const { period } = useAppPeriod();
  const [tab, setTab] = useState<'dashboard' | 'table' | 'tree' | 'detail'>('dashboard');
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

  const periods = useMemo(() => ytdPeriods(period), [period]);
  const periodsPY: Period[] = useMemo(
    () => ytdPeriods({ year: period.year - 1, month: period.month }),
    [period],
  );

  const fromCY: Period = { year: period.year, month: 1 };
  const fromPY: Period = { year: period.year - 1, month: 1 };
  const toPY: Period = { year: period.year - 1, month: period.month };

  const actualsCYQ = useQuery({
    queryKey: ['ytd-actuals', household?.id, schemeQ.data, period.year, period.month],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: fromCY,
        to: period,
      }),
  });

  const actualsPYQ = useQuery({
    queryKey: ['ytd-actuals-py', household?.id, schemeQ.data, period.year - 1, period.month],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: fromPY,
        to: toPY,
      }),
  });

  const budgetQ = useQuery({
    queryKey: ['budget-year', household?.id, period.year],
    enabled: !!household?.id,
    queryFn: () => fetchBudgetYear({ household_id: household!.id, year: period.year }),
  });

  // Year-to-date transactions (Jan 1 → end of the selected month) for the Detail tab.
  const txQ = useQuery({
    queryKey: ['ytd-report-tx', household?.id, schemeQ.data, period.year, period.month],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchReportShellTransactions({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: yearStartIso(period.year),
        to: periodEndIso(period),
      }),
  });

  const filteredTx = useMemo(() => filterDrillTransactions(txQ.data, drill), [txQ.data, drill]);

  const onDrillCategory = useCallback((id: string, name: string) => {
    setDrill({ kind: 'category', id, name });
    setTab('detail');
  }, []);

  const onDrillGroup = useCallback((drillKey: string, displayLabel: string) => {
    setDrill({ kind: 'group', key: drillKey, label: displayLabel });
    setTab('detail');
  }, []);

  const report = useMemo(() => {
    if (!categoriesQ.data || !actualsCYQ.data || !actualsPYQ.data || !budgetQ.data)
      return null;
    return buildSpendReport({
      categories: categoriesQ.data,
      periods,
      actuals: actualsToLookup(actualsCYQ.data),
      budgets: budgetsToLookup(budgetQ.data),
      actualsB: actualsToLookup(actualsPYQ.data),
      periodsB: periodsPY,
    });
  }, [categoriesQ.data, actualsCYQ.data, actualsPYQ.data, budgetQ.data, periods, periodsPY]);

  // Dashboard / Treemap model: categories summed Jan → selected month (incl. Yearly).
  const ytdModel = useMemo(() => {
    if (!categoriesQ.data || !actualsCYQ.data || !budgetQ.data) return null;
    const actuals = actualsToLookup(actualsCYQ.data);
    const budgets = budgetsToLookup(budgetQ.data);
    return {
      groups: buildMonthlyReportGroups({
        categories: categoriesQ.data,
        period,
        periods,
        includeYearly: true,
        actuals,
        budgets,
      }),
      trend: buildTrendForPeriods({ categories: categoriesQ.data, periods, actuals, budgets }),
    };
  }, [categoriesQ.data, actualsCYQ.data, budgetQ.data, period, periods]);

  const loading =
    schemeQ.isLoading ||
    categoriesQ.isLoading ||
    actualsCYQ.isLoading ||
    actualsPYQ.isLoading ||
    budgetQ.isLoading;
  const firstError =
    schemeQ.error ??
    categoriesQ.error ??
    actualsCYQ.error ??
    actualsPYQ.error ??
    budgetQ.error;
  const hasAnyData =
    !!report &&
    (report.grandActual !== 0 ||
      report.grandBudget !== 0 ||
      (report.grandActualB ?? 0) !== 0);

  const preYearlyTotals = useMemo(() => {
    if (!report) return null;
    const idx = report.sections.findIndex((s) => s.group === 'Yearly');
    if (idx < 0) return null;
    const pre = report.sections.slice(0, idx);
    return {
      actual: pre.reduce((sum, s) => sum + s.actualTotal, 0),
      budget: pre.reduce((sum, s) => sum + s.budgetTotal, 0),
      actualB: pre.reduce((sum, s) => sum + (s.actualBTotal ?? 0), 0),
    };
  }, [report]);

  return (
    <div>
      <p className="mb-3 text-sm text-gray-600">
        January through{' '}
        <span className="font-semibold text-navy-900">{formatPeriod(period)}</span> vs same
        period prior year. Click a chart bar or tile, or double-click a table row, to see its transactions.
      </p>

      <div className="mb-4 flex gap-1 border-b border-navy-100">
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

      {(tab === 'dashboard' || tab === 'tree') && loading && (
        <StatusPanel kind="loading" message="Loading…" />
      )}
      {(tab === 'dashboard' || tab === 'tree') && !loading && firstError && (
        <StatusPanel kind="error" message="Couldn't load the report." detail={(firstError as Error).message} />
      )}

      {tab === 'dashboard' && !loading && !firstError && ytdModel && report && (
        <div className="max-w-6xl">
          <ReportsDashboard
            scope="ytd"
            label={`Jan – ${formatPeriod(period, 'short')}`}
            monthlyActual={report.grandActual}
            monthlyBudget={report.grandBudget}
            groups={ytdModel.groups}
            trend={ytdModel.trend}
            onDrillCategory={onDrillCategory}
            onDrillGroup={onDrillGroup}
          />
        </div>
      )}

      {tab === 'tree' && !loading && !firstError && ytdModel && (
        <div className="max-w-6xl space-y-4">
          <p className="text-caption text-gray-500">
            Tile area matches each category&apos;s share of its group&apos;s year-to-date spend. Click a tile
            for Detail; double-click the group label to filter the whole group.
          </p>
          <ReportsTreemap groups={ytdModel.groups} onDrillItem={onDrillCategory} onDrillGroup={onDrillGroup} />
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

      {tab === 'table' && loading && <StatusPanel kind="loading" message="Loading…" />}

      {tab === 'table' && !loading && firstError && (
        <StatusPanel
          kind="error"
          message="Couldn't load the YTD report."
          detail={(firstError as Error).message}
        />
      )}

      {tab === 'table' && !loading && !firstError && report && !hasAnyData && (
        <StatusPanel
          kind="empty"
          message={`No spend or budget data for Jan – ${formatPeriod(period)}.`}
          detail="Pick a different period, or import transactions and set a budget."
        />
      )}

      {tab === 'table' && !loading && !firstError && report && hasAnyData && (
        <Card padded={false}>
          <table className={RT.table}>
            <thead className={RT.head}>
              <tr>
                <th className={`${RT.th} ${RT.thLeft}`}>Category</th>
                <th className={`${RT.th} ${RT.thRight}`}>Actual YTD</th>
                <th className={`${RT.th} ${RT.thRight}`}>Budget YTD</th>
                <th className={`${RT.th} ${RT.thRight}`}>Variance</th>
                <th className={`${RT.th} ${RT.thRight}`}>Var %</th>
                <th className={`${RT.th} ${RT.thRight}`}>PY YTD</th>
                <th className={`${RT.th} ${RT.thRight}`}>vs PY</th>
              </tr>
            </thead>
            <tbody>
              {report.sections.map((section) => (
                <Fragment key={section.group}>
                  {section.group === 'Yearly' && preYearlyTotals && (
                    <tr className={RT.totalRow}>
                      <td className={RT.totalCell}>Total before Yearly</td>
                      <td className={RT.totalCellRight}>{fmtUsd(preYearlyTotals.actual)}</td>
                      <td className={RT.totalCellRight}>{fmtUsd(preYearlyTotals.budget)}</td>
                      <td className={RT.totalCellRight}>
                        {fmtUsd(variance(preYearlyTotals.actual, preYearlyTotals.budget))}
                      </td>
                      <td className={RT.totalCellRight}>
                        {fmtPct(variancePct(preYearlyTotals.actual, preYearlyTotals.budget))}
                      </td>
                      <td className={RT.totalCellRight}>{fmtUsd(preYearlyTotals.actualB)}</td>
                      <td className={RT.totalCellRight}>
                        {fmtPct(variancePct(preYearlyTotals.actual, preYearlyTotals.actualB))}
                      </td>
                    </tr>
                  )}
                  <YtdSection
                    section={section}
                    onDrillCategory={onDrillCategory}
                    onDrillGroup={onDrillGroup}
                  />
                </Fragment>
              ))}
              <tr className={RT.totalRow}>
                <td className={RT.totalCell}>Total Spend YTD</td>
                <td className={RT.totalCellRight}>{fmtUsd(report.grandActual)}</td>
                <td className={RT.totalCellRight}>{fmtUsd(report.grandBudget)}</td>
                <td className={RT.totalCellRight}>
                  {fmtUsd(variance(report.grandActual, report.grandBudget))}
                </td>
                <td className={RT.totalCellRight}>
                  {fmtPct(variancePct(report.grandActual, report.grandBudget))}
                </td>
                <td className={RT.totalCellRight}>
                  {fmtUsd(report.grandActualB ?? 0)}
                </td>
                <td className={RT.totalCellRight}>
                  {fmtPct(variancePct(report.grandActual, report.grandActualB ?? 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      <TransactionPropertiesDrawer
        open={detailTxnId !== null}
        onClose={() => setDetailTxnId(null)}
        transactionId={detailTxnId}
        schemeId={schemeQ.data ?? null}
      />
    </div>
  );
}

function YtdSection({
  section,
  onDrillCategory,
  onDrillGroup,
}: {
  section: ReturnType<typeof buildSpendReport>['sections'][number];
} & DrillHandlers) {
  return (
    <>
      <tr
        className={`${RT.groupRow} cursor-pointer`}
        title="Double-click to see this group's transactions"
        onDoubleClick={() => onDrillGroup(section.group, section.group)}
      >
        <td colSpan={7} className={RT.groupCell}>
          {section.group}
        </td>
      </tr>
      {section.rows.map((row) => {
        const v = variance(row.actual, row.budget);
        const vp = variancePct(row.actual, row.budget);
        const py = row.actualB ?? 0;
        const vsPy = variancePct(row.actual, py);
        return (
          <tr
            key={row.category.id}
            className={`${RT.detailRow} cursor-pointer`}
            title="Double-click to see this category's transactions"
            onDoubleClick={() => onDrillCategory(row.category.id, row.category.name)}
          >
            <td className={RT.cellLeft}>{row.category.name}</td>
            <td className={RT.cellRight}>{fmtUsd(row.actual)}</td>
            <td className={RT.cellRightMuted}>
              {row.budget === 0 ? '—' : fmtUsd(row.budget)}
            </td>
            <td className={`${RT.cellRight} ${varianceClass(v)}`}>
              {row.budget === 0 ? '—' : fmtUsd(v)}
            </td>
            <td className={`${RT.cellRight} ${varianceClass(v)}`}>{fmtPct(vp)}</td>
            <td className={RT.cellRightMuted}>
              {py === 0 ? '—' : fmtUsd(py)}
            </td>
            <td className={`${RT.cellRight} ${varianceClass(row.actual - py)}`}>
              {fmtPct(vsPy)}
            </td>
          </tr>
        );
      })}
      <tr
        className={`${RT.subtotalRow} cursor-pointer`}
        title="Double-click to see this group's transactions"
        onDoubleClick={() => onDrillGroup(section.group, section.group)}
      >
        <td className={RT.cellLeft}>{section.group} subtotal</td>
        <td className={RT.cellRight}>{fmtUsd(section.actualTotal)}</td>
        <td className={RT.cellRight}>{fmtUsd(section.budgetTotal)}</td>
        <td
          className={`${RT.cellRight} ${varianceClass(
            variance(section.actualTotal, section.budgetTotal),
          )}`}
        >
          {fmtUsd(variance(section.actualTotal, section.budgetTotal))}
        </td>
        <td
          className={`${RT.cellRight} ${varianceClass(
            variance(section.actualTotal, section.budgetTotal),
          )}`}
        >
          {fmtPct(variancePct(section.actualTotal, section.budgetTotal))}
        </td>
        <td className={RT.cellRightMuted}>
          {fmtUsd(section.actualBTotal ?? 0)}
        </td>
        <td
          className={`${RT.cellRight} ${varianceClass(
            section.actualTotal - (section.actualBTotal ?? 0),
          )}`}
        >
          {fmtPct(variancePct(section.actualTotal, section.actualBTotal ?? 0))}
        </td>
      </tr>
    </>
  );
}
