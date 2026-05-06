import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchMonthlyActuals,
  fetchBudgetYear,
  fetchSchemeCategories,
  actualsToLookup,
  budgetsToLookup,
} from '@/api/reports';
import { buildSpendReport } from '@/features/reports/grouping';
import {
  fmtUsd,
  variance,
  variancePct,
  fmtPct,
  varianceClass,
} from '@/lib/money';
import { formatPeriod } from '@/lib/period';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { StatusPanel } from '@/components/StatusPanel';
import { Card, RT } from '@/components/ds';

export function OneMonthReportPage() {
  const household = useHousehold();
  const { period } = useAppPeriod();

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

  const actualsQ = useQuery({
    queryKey: ['monthly-actuals', household?.id, schemeQ.data, period.year, period.month],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: period,
        to: period,
      }),
  });

  const budgetQ = useQuery({
    queryKey: ['budget-year', household?.id, period.year],
    enabled: !!household?.id,
    queryFn: () => fetchBudgetYear({ household_id: household!.id, year: period.year }),
  });

  const report = useMemo(() => {
    if (!categoriesQ.data || !actualsQ.data || !budgetQ.data) return null;
    return buildSpendReport({
      categories: categoriesQ.data,
      periods: [period],
      actuals: actualsToLookup(actualsQ.data),
      budgets: budgetsToLookup(budgetQ.data),
    });
  }, [categoriesQ.data, actualsQ.data, budgetQ.data, period]);

  const loading =
    schemeQ.isLoading || categoriesQ.isLoading || actualsQ.isLoading || budgetQ.isLoading;
  const firstError =
    schemeQ.error ?? categoriesQ.error ?? actualsQ.error ?? budgetQ.error;
  const hasAnyData =
    !!report && (report.grandActual !== 0 || report.grandBudget !== 0);

  return (
    <div>
      <p className="mb-4 text-sm text-gray-600">
        Spending by category for{' '}
        <span className="font-semibold text-navy-900">{formatPeriod(period)}</span>.
      </p>

      {loading && <StatusPanel kind="loading" message="Loading…" />}

      {!loading && firstError && (
        <StatusPanel
          kind="error"
          message="Couldn't load the report."
          detail={(firstError as Error).message}
        />
      )}

      {!loading && !firstError && report && !hasAnyData && (
        <StatusPanel
          kind="empty"
          message={`No spend or budget data for ${formatPeriod(period)}.`}
          detail="Pick a different month, or import transactions and set a budget for this period."
        />
      )}

      {!loading && !firstError && report && hasAnyData && (
        <Card padded={false}>
          <table className={RT.table}>
            <thead className={RT.head}>
              <tr>
                <th className={`${RT.th} ${RT.thLeft}`}>Category</th>
                <th className={`${RT.th} ${RT.thRight}`}>Actual</th>
                <th className={`${RT.th} ${RT.thRight}`}>Budget</th>
                <th className={`${RT.th} ${RT.thRight}`}>Variance</th>
                <th className={`${RT.th} ${RT.thRight}`}>Var %</th>
              </tr>
            </thead>
            <tbody>
              {report.sections.map((section) => (
                <ReportSection key={section.group} section={section} />
              ))}
              <tr className={RT.totalRow}>
                <td className={RT.totalCell}>Total Spend</td>
                <td className={RT.totalCellRight}>
                  {fmtUsd(report.grandActual)}
                </td>
                <td className={RT.totalCellRight}>
                  {fmtUsd(report.grandBudget)}
                </td>
                <td className={RT.totalCellRight}>
                  {fmtUsd(variance(report.grandActual, report.grandBudget))}
                </td>
                <td className={RT.totalCellRight}>
                  {fmtPct(variancePct(report.grandActual, report.grandBudget))}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function ReportSection({
  section,
}: {
  section: ReturnType<typeof buildSpendReport>['sections'][number];
}) {
  return (
    <>
      <tr className={RT.groupRow}>
        <td colSpan={5} className={RT.groupCell}>
          {section.group}
        </td>
      </tr>
      {section.rows.map((row) => {
        const v = variance(row.actual, row.budget);
        const vp = variancePct(row.actual, row.budget);
        return (
          <tr key={row.category.id} className={RT.detailRow}>
            <td className={RT.cellLeft}>{row.category.name}</td>
            <td className={RT.cellRight}>{fmtUsd(row.actual)}</td>
            <td className={RT.cellRightMuted}>
              {row.budget === 0 ? '—' : fmtUsd(row.budget)}
            </td>
            <td className={`${RT.cellRight} ${varianceClass(v)}`}>
              {row.budget === 0 ? '—' : fmtUsd(v)}
            </td>
            <td className={`${RT.cellRight} ${varianceClass(v)}`}>
              {fmtPct(vp)}
            </td>
          </tr>
        );
      })}
      <tr className={RT.subtotalRow}>
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
      </tr>
    </>
  );
}
