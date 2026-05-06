import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  defaultSchemeQueryKey,
  fetchDefaultSchemeId,
  fetchLatestActualPeriod,
  fetchMonthlyActuals,
  fetchSchemeCategories,
  actualsToLookup,
  type ReportCategory,
  type ActualLookup,
} from '@/api/reports';
import { fmtUsd } from '@/lib/money';
import {
  formatPeriod,
  prevNPeriods,
  periodKey,
  shiftPeriod,
  MONTH_NAMES_SHORT,
  type Period,
} from '@/lib/period';
import { useAppPeriod } from '@/lib/appPeriodContext';
import {
  canonicalSpendGroup,
  SPEND_GROUP_ORDER,
} from '@/features/reports/grouping';
import { StatusPanel } from '@/components/StatusPanel';
import { Card, RT } from '@/components/ds';

/**
 * Averages report.
 *
 * Two tables on this page:
 *
 * 1. SUMMARY (top): rolling 3 / 6 / 12-month averages ending at the
 *    app header month INCLUSIVE.
 * 2. HISTORY (below): per-category monthly history for the most recent
 *    12 months that contain ANY transaction data.
 */
export function AveragesReportPage() {
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

  const summaryFrom = useMemo(() => shiftPeriod(period, -11), [period]);
  const summaryMonths: Period[] = useMemo(() => {
    const arr = prevNPeriods(period, 11);
    arr.push(period);
    return arr;
  }, [period]);

  const summaryActualsQ = useQuery({
    queryKey: ['avg-summary-actuals', household?.id, schemeQ.data, period.year, period.month],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: summaryFrom,
        to: period,
      }),
  });

  const summaryLookup: ActualLookup = useMemo(
    () => (summaryActualsQ.data ? actualsToLookup(summaryActualsQ.data) : new Map()),
    [summaryActualsQ.data],
  );

  const latestPeriodQ = useQuery({
    queryKey: ['latest-actual-period', household?.id, schemeQ.data],
    enabled: !!household?.id && !!schemeQ.data,
    queryFn: () =>
      fetchLatestActualPeriod({ household_id: household!.id, scheme_id: schemeQ.data! }),
  });

  const historyMonths: Period[] = useMemo(() => {
    if (!latestPeriodQ.data) return [];
    const anchor = latestPeriodQ.data;
    const arr = prevNPeriods(anchor, 11);
    arr.push(anchor);
    return arr;
  }, [latestPeriodQ.data]);

  const historyActualsQ = useQuery({
    queryKey: [
      'avg-history-actuals',
      household?.id,
      schemeQ.data,
      latestPeriodQ.data?.year,
      latestPeriodQ.data?.month,
    ],
    enabled: !!household?.id && !!schemeQ.data && !!latestPeriodQ.data,
    queryFn: () => {
      const anchor = latestPeriodQ.data!;
      return fetchMonthlyActuals({
        household_id: household!.id,
        scheme_id: schemeQ.data!,
        from: shiftPeriod(anchor, -11),
        to: anchor,
      });
    },
  });

  const historyLookup: ActualLookup = useMemo(
    () => (historyActualsQ.data ? actualsToLookup(historyActualsQ.data) : new Map()),
    [historyActualsQ.data],
  );

  const spendCats: ReportCategory[] = useMemo(() => {
    if (!categoriesQ.data) return [];
    return categoriesQ.data.filter(
      (c) => canonicalSpendGroup(c.group_name) !== null,
    );
  }, [categoriesQ.data]);

  const loading =
    schemeQ.isLoading ||
    categoriesQ.isLoading ||
    summaryActualsQ.isLoading ||
    latestPeriodQ.isLoading ||
    historyActualsQ.isLoading;
  const firstError =
    schemeQ.error ??
    categoriesQ.error ??
    summaryActualsQ.error ??
    latestPeriodQ.error ??
    historyActualsQ.error;
  const hasAnyData =
    (!!summaryActualsQ.data && summaryActualsQ.data.length > 0) ||
    (!!historyActualsQ.data && historyActualsQ.data.length > 0);

  return (
    <div>
      <p className="mb-4 text-sm text-gray-600">
        Rolling 3 / 6 / 12-month per-category averages ending{' '}
        <span className="font-semibold text-navy-900">{formatPeriod(period)}</span>.
      </p>

      {loading && <StatusPanel kind="loading" message="Loading…" />}

      {!loading && firstError && (
        <StatusPanel
          kind="error"
          message="Couldn't load averages."
          detail={(firstError as Error).message}
        />
      )}

      {!loading && !firstError && !hasAnyData && (
        <StatusPanel
          kind="empty"
          message="No transaction data yet."
          detail="Once you import or categorize transactions, their averages appear here."
        />
      )}

      {!loading && !firstError && hasAnyData && spendCats.length > 0 && (
        <>
          <Card padded={false} className="mb-6">
            <table className={RT.table}>
              <thead className={RT.head}>
                <tr>
                  <th className={`${RT.th} ${RT.thLeft}`}>Category</th>
                  <th className={`${RT.th} ${RT.thRight}`}>3-mo avg</th>
                  <th className={`${RT.th} ${RT.thRight}`}>6-mo avg</th>
                  <th className={`${RT.th} ${RT.thRight}`}>12-mo avg</th>
                </tr>
              </thead>
              <tbody>
                {SPEND_GROUP_ORDER.map((group) => {
                  const cats = spendCats.filter(
                    (c) => canonicalSpendGroup(c.group_name) === group,
                  );
                  if (cats.length === 0) return null;
                  return (
                    <AveragesGroup
                      key={group}
                      group={group}
                      cats={cats}
                      months12={summaryMonths}
                      lookup={summaryLookup}
                    />
                  );
                })}
              </tbody>
            </table>
          </Card>

          {historyMonths.length > 0 && (
            <>
              <div className="mb-2 text-caption text-gray-500">
                Monthly history — most recent {historyMonths.length} months with data
                (anchor: {formatPeriod(latestPeriodQ.data!)}).
              </div>
              <Card padded={false} className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className={RT.head}>
                    <tr>
                      <th
                        className={`${RT.th} ${RT.thLeft} sticky left-0 z-10 bg-navy-50/80`}
                      >
                        Category
                      </th>
                      {historyMonths.map((p) => (
                        <th
                          key={periodKey(p)}
                          className={`${RT.th} ${RT.thRight}`}
                        >
                          {MONTH_NAMES_SHORT[p.month - 1]} {String(p.year).slice(-2)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SPEND_GROUP_ORDER.map((group) => {
                      const cats = spendCats.filter(
                        (c) => canonicalSpendGroup(c.group_name) === group,
                      );
                      if (cats.length === 0) return null;
                      return (
                        <HistoryGroup
                          key={group}
                          group={group}
                          cats={cats}
                          months12={historyMonths}
                          lookup={historyLookup}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AveragesGroup({
  group,
  cats,
  months12,
  lookup,
}: {
  group: string;
  cats: ReportCategory[];
  months12: Period[];
  lookup: ActualLookup;
}) {
  const last3 = months12.slice(-3);
  const last6 = months12.slice(-6);

  const avg = (cat: ReportCategory, periods: Period[]): number => {
    let total = 0;
    for (const p of periods) total += lookup.get(`${cat.id}|${periodKey(p)}`) ?? 0;
    return total / periods.length;
  };

  return (
    <>
      <tr className={RT.groupRow}>
        <td colSpan={4} className={RT.groupCell}>
          {group}
        </td>
      </tr>
      {cats.map((c) => (
        <tr key={c.id} className={RT.detailRow}>
          <td className={RT.cellLeft}>{c.name}</td>
          <td className={RT.cellRight}>{fmtUsd(avg(c, last3))}</td>
          <td className={RT.cellRight}>{fmtUsd(avg(c, last6))}</td>
          <td className={RT.cellRight}>{fmtUsd(avg(c, months12))}</td>
        </tr>
      ))}
    </>
  );
}

function HistoryGroup({
  group,
  cats,
  months12,
  lookup,
}: {
  group: string;
  cats: ReportCategory[];
  months12: Period[];
  lookup: ActualLookup;
}) {
  return (
    <>
      <tr className={RT.groupRow}>
        <td colSpan={months12.length + 1} className={RT.groupCell}>
          {group}
        </td>
      </tr>
      {cats.map((c) => (
        <tr key={c.id} className={`${RT.detailRow} group`}>
          <td
            className={`${RT.cellLeft} sticky left-0 z-10 bg-white group-hover:bg-navy-50/40`}
          >
            {c.name}
          </td>
          {months12.map((p) => {
            const v = lookup.get(`${c.id}|${periodKey(p)}`) ?? 0;
            return (
              <td
                key={periodKey(p)}
                className={`${RT.cellRight} ${v === 0 ? 'text-gray-300' : ''}`}
              >
                {v === 0 ? '—' : fmtUsd(v)}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
