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
import { formatPeriod, ytdPeriods, type Period } from '@/lib/period';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { StatusPanel } from '@/components/StatusPanel';
import { Card, RT } from '@/components/ds';

export function YtdReportPage() {
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

  return (
    <div>
      <p className="mb-4 text-sm text-gray-600">
        January through{' '}
        <span className="font-semibold text-navy-900">{formatPeriod(period)}</span> vs same
        period prior year.
      </p>

      {loading && <StatusPanel kind="loading" message="Loading…" />}

      {!loading && firstError && (
        <StatusPanel
          kind="error"
          message="Couldn't load the YTD report."
          detail={(firstError as Error).message}
        />
      )}

      {!loading && !firstError && report && !hasAnyData && (
        <StatusPanel
          kind="empty"
          message={`No spend or budget data for Jan – ${formatPeriod(period)}.`}
          detail="Pick a different period, or import transactions and set a budget."
        />
      )}

      {!loading && !firstError && report && hasAnyData && (
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
                <YtdSection key={section.group} section={section} />
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
    </div>
  );
}

function YtdSection({
  section,
}: {
  section: ReturnType<typeof buildSpendReport>['sections'][number];
}) {
  return (
    <>
      <tr className={RT.groupRow}>
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
          <tr key={row.category.id} className={RT.detailRow}>
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
