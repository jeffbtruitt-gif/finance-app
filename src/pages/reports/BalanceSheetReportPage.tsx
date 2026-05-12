import { type ReactNode, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useHousehold } from '@/api/household';
import { fetchBalanceSheetItems, fetchBalanceSheetValues } from '@/api/balanceSheet';
import { BalanceSheetChangeBars } from '@/features/balance-sheet/BalanceSheetChangeBars';
import {
  baselinePeriodForHorizon,
  buildAccountChangeRows,
  buildEquityGroupChangeRows,
  type BsChangeHorizon,
} from '@/features/balance-sheet/change';
import { netWorthSeries } from '@/features/balance-sheet/effective';
import { NetWorthHeaderCard } from '@/features/balance-sheet/NetWorthHeaderCard';
import { buildBalanceSheetReport } from '@/features/balance-sheet/report';
import { fmtPct, fmtUsd } from '@/lib/money';
import { formatPeriod, type Period } from '@/lib/period';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { EquityMixDonutChart } from '@/components/EquityMixDonutChart';
import { StatusPanel } from '@/components/StatusPanel';
import { Card, RT } from '@/components/ds';

/** December of the prior year — used as the baseline for YTD change. */
function ytdBaseline(p: Period): Period {
  return { year: p.year - 1, month: 12 };
}


type ReportTab = 'balance' | 'mix' | 'changeBar' | 'changeTable';

function deltaClassForAsset(delta: number | null): string {
  if (delta == null) return 'text-gray-400';
  if (delta > 0) return 'text-pos';
  if (delta < 0) return 'text-neg';
  return 'text-gray-600';
}

function deltaClassForLiability(delta: number | null): string {
  if (delta == null) return 'text-gray-400';
  if (delta > 0) return 'text-neg';
  if (delta < 0) return 'text-pos';
  return 'text-gray-600';
}

function deltaClassForNet(delta: number): string {
  if (delta > 0) return 'text-pos';
  if (delta < 0) return 'text-neg';
  return 'text-gray-600';
}

export function BalanceSheetReportPage() {
  const household = useHousehold();
  const { period } = useAppPeriod();
  const [tab, setTab] = useState<ReportTab>('balance');
  const [horizon, setHorizon] = useState<BsChangeHorizon>('1mo');

  const itemsQ = useQuery({
    queryKey: ['bs-items', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetItems(household!.id),
  });
  const valuesQ = useQuery({
    queryKey: ['bs-values', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchBalanceSheetValues(household!.id),
  });

  const report = useMemo(() => {
    if (!itemsQ.data || !valuesQ.data) return null;
    return buildBalanceSheetReport({
      items: itemsQ.data,
      values: valuesQ.data,
      asOf: period,
    });
  }, [itemsQ.data, valuesQ.data, period]);

  const priorPeriod: Period = useMemo(
    () =>
      period.month === 1
        ? { year: period.year - 1, month: 12 }
        : { year: period.year, month: period.month - 1 },
    [period],
  );

  const priorReport = useMemo(() => {
    if (!itemsQ.data || !valuesQ.data) return null;
    return buildBalanceSheetReport({
      items: itemsQ.data,
      values: valuesQ.data,
      asOf: priorPeriod,
    });
  }, [itemsQ.data, valuesQ.data, priorPeriod]);

  const ytdBasePeriod = useMemo(() => ytdBaseline(period), [period]);

  const ytdBaseReport = useMemo(() => {
    if (!itemsQ.data || !valuesQ.data) return null;
    return buildBalanceSheetReport({
      items: itemsQ.data,
      values: valuesQ.data,
      asOf: ytdBasePeriod,
    });
  }, [itemsQ.data, valuesQ.data, ytdBasePeriod]);

  const liabilityNames = useMemo(() => {
    if (!report) return [];
    return report.liabilities
      .filter((l) => l.value != null && l.value > 0)
      .map((l) => l.name);
  }, [report]);

  const baselinePeriod = useMemo(() => baselinePeriodForHorizon(period, horizon), [period, horizon]);

  const baselineReport = useMemo(() => {
    if (!itemsQ.data || !valuesQ.data) return null;
    return buildBalanceSheetReport({
      items: itemsQ.data,
      values: valuesQ.data,
      asOf: baselinePeriod,
    });
  }, [itemsQ.data, valuesQ.data, baselinePeriod]);

  const accountChangeRows = useMemo(() => {
    if (!itemsQ.data || !valuesQ.data) return null;
    return buildAccountChangeRows({
      items: itemsQ.data,
      values: valuesQ.data,
      asOf: period,
      horizon,
    });
  }, [itemsQ.data, valuesQ.data, period, horizon]);

  const equityChangeRows = useMemo(() => {
    if (!accountChangeRows) return null;
    return buildEquityGroupChangeRows(accountChangeRows);
  }, [accountChangeRows]);

  const assetRows = useMemo(
    () => accountChangeRows?.filter((r) => r.type === 'asset') ?? [],
    [accountChangeRows],
  );
  const liabilityRows = useMemo(
    () => accountChangeRows?.filter((r) => r.type === 'liability') ?? [],
    [accountChangeRows],
  );

  const totalAssetDelta =
    report && baselineReport ? report.totalAssets - baselineReport.totalAssets : null;
  const totalLiabDelta =
    report && baselineReport ? report.totalLiabilities - baselineReport.totalLiabilities : null;
  const netWorthDelta =
    report && baselineReport ? report.netWorth - baselineReport.netWorth : null;
  const netWorthPct =
    baselineReport && baselineReport.netWorth !== 0 && netWorthDelta != null
      ? (netWorthDelta / Math.abs(baselineReport.netWorth)) * 100
      : null;

  const netWorthSeries24 = useMemo(() => {
    if (!itemsQ.data || !valuesQ.data) return null;
    return netWorthSeries({
      items: itemsQ.data,
      values: valuesQ.data,
      endMonth: period,
      count: 24,
    });
  }, [itemsQ.data, valuesQ.data, period]);

  const loading = itemsQ.isLoading || valuesQ.isLoading;
  const firstError = itemsQ.error ?? valuesQ.error;
  const hasItems = (itemsQ.data?.length ?? 0) > 0;

  const horizonLabel =
    horizon === '1mo' ? '1 month' : horizon === 'ytd' ? 'year to date' : '12 months';

  return (
    <div className="display-num">
      <p className="mb-4 text-sm text-gray-600">
        Effective balances as of{' '}
        <span className="font-semibold text-navy-900">{formatPeriod(period)}</span>
        {' — '}
        each line uses the most recent value on or before that month (
        <Link to="/balance-sheet" className="text-navy-700 underline hover:text-navy-900">
          edit on Balance Sheet
        </Link>
        ).
      </p>

      {!loading && !firstError && hasItems && (
        <div className="mb-6 flex flex-wrap gap-1 border-b border-navy-100">
          <TabButton active={tab === 'balance'} onClick={() => setTab('balance')}>
            Balance
          </TabButton>
          <TabButton active={tab === 'mix'} onClick={() => setTab('mix')}>
            Mix
          </TabButton>
          <TabButton active={tab === 'changeTable'} onClick={() => setTab('changeTable')}>
            Change
          </TabButton>
          <TabButton active={tab === 'changeBar'} onClick={() => setTab('changeBar')}>
            Change Bar
          </TabButton>
        </div>
      )}

      {loading && <StatusPanel kind="loading" message="Loading…" />}

      {!loading && firstError && (
        <StatusPanel
          kind="error"
          message="Couldn't load balance sheet data."
          detail={(firstError as Error).message}
        />
      )}

      {!loading && !firstError && !hasItems && (
        <StatusPanel
          kind="empty"
          message="No balance sheet items yet."
          detail='Open Planning → Balance Sheet to add assets and liabilities.'
        />
      )}

      {!loading && !firstError && hasItems && report && priorReport && ytdBaseReport && netWorthSeries24 && (
        <div className="space-y-6">
          <NetWorthHeaderCard
            totals={{
              assets: report.totalAssets,
              liabilities: report.totalLiabilities,
              net: report.netWorth,
            }}
            totalsPrior={{
              assets: priorReport.totalAssets,
              liabilities: priorReport.totalLiabilities,
              net: priorReport.netWorth,
            }}
            totalsYtdStart={{
              assets: ytdBaseReport.totalAssets,
              liabilities: ytdBaseReport.totalLiabilities,
              net: ytdBaseReport.netWorth,
            }}
            period={period}
            series={netWorthSeries24}
            equityByGroup={report.equityByGroup}
            liabilityNames={liabilityNames}
          />

          {tab === 'balance' && (
            <>
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-700">
                  Assets
                </h2>
                <Card padded={false}>
                  <table className={RT.table}>
                    <thead className={RT.head}>
                      <tr>
                        <th className={`${RT.th} ${RT.thLeft}`}>Name</th>
                        <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
                        <th className={`${RT.th} ${RT.thRight}`}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.assets.map((row) => (
                        <tr key={row.id} className={RT.detailRow}>
                          <td className={RT.cellLeft}>{row.name}</td>
                          <td className={`${RT.cellLeft} text-gray-500`}>{row.groupLabel}</td>
                          <td className={RT.cellRight}>
                            {row.value == null ? '—' : fmtUsd(row.value)}
                          </td>
                        </tr>
                      ))}
                      <tr className={RT.totalRow}>
                        <td colSpan={2} className={RT.totalCell}>
                          Total assets
                        </td>
                        <td className={RT.totalCellRight}>{fmtUsd(report.totalAssets)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Card>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-700">
                  Liabilities
                </h2>
                <Card padded={false}>
                  <table className={RT.table}>
                    <thead className={RT.head}>
                      <tr>
                        <th className={`${RT.th} ${RT.thLeft}`}>Name</th>
                        <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
                        <th className={`${RT.th} ${RT.thRight}`}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.liabilities.map((row) => (
                        <tr key={row.id} className={RT.detailRow}>
                          <td className={RT.cellLeft}>{row.name}</td>
                          <td className={`${RT.cellLeft} text-gray-500`}>{row.groupLabel}</td>
                          <td className={RT.cellRight}>
                            {row.value == null ? '—' : fmtUsd(row.value)}
                          </td>
                        </tr>
                      ))}
                      <tr className={RT.totalRow}>
                        <td colSpan={2} className={RT.totalCell}>
                          Total liabilities
                        </td>
                        <td className={RT.totalCellRight}>{fmtUsd(report.totalLiabilities)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Card>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-700">
                  Equity by group
                </h2>
                <p className="mb-2 text-xs text-gray-500">
                  For each group: asset balances minus liability balances (same groups as on line items).
                </p>
                <Card padded={false}>
                  <table className={RT.table}>
                    <thead className={RT.head}>
                      <tr>
                        <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
                        <th className={`${RT.th} ${RT.thRight}`}>Assets</th>
                        <th className={`${RT.th} ${RT.thRight}`}>Liabilities</th>
                        <th className={`${RT.th} ${RT.thRight}`}>Net (equity)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.equityByGroup.map((row) => (
                        <tr key={row.groupLabel} className={RT.detailRow}>
                          <td className={RT.cellLeft}>{row.groupLabel}</td>
                          <td className={RT.cellRight}>{fmtUsd(row.assets)}</td>
                          <td className={RT.cellRight}>{fmtUsd(row.liabilities)}</td>
                          <td
                            className={`${RT.cellRight} ${
                              row.net < 0 ? 'text-neg' : 'text-gray-900'
                            }`}
                          >
                            {fmtUsd(row.net)}
                          </td>
                        </tr>
                      ))}
                      <tr className={RT.totalRow}>
                        <td className={RT.totalCell}>Total / net worth</td>
                        <td className={RT.totalCellRight}>{fmtUsd(report.totalAssets)}</td>
                        <td className={RT.totalCellRight}>{fmtUsd(report.totalLiabilities)}</td>
                        <td className={RT.totalCellRight}>{fmtUsd(report.netWorth)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Card>
              </section>
            </>
          )}

          {tab === 'mix' && (
            <section className="space-y-4">
              <Card padded={false}>
                <Card.Header
                  title="Equity mix"
                  subtitle={
                    <>
                      Where net worth sits across equity groups with positive net. Hover a slice for
                      the dollar amount and its share of total net worth. Uses the same effective
                      month as the Balance tab ({formatPeriod(period)}).
                    </>
                  }
                />
                <Card.Section className="flex flex-col items-center px-6 pb-12 pt-8">
                  <EquityMixDonutChart
                    netWorth={report.netWorth}
                    slices={report.equityByGroup.map((row) => ({
                      key: row.groupLabel,
                      label: row.groupLabel,
                      net: row.net,
                    }))}
                  />
                </Card.Section>
              </Card>
              {report.equityByGroup.some((r) => r.net < 0) && (
                <Card padded={false}>
                  <Card.Header
                    title="Negative net in group"
                    subtitle="These buckets owe more than asset balances assigned to them; they are excluded from slice angles above."
                  />
                  <Card.Section flush>
                    <table className={RT.table}>
                      <thead className={RT.head}>
                        <tr>
                          <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
                          <th className={`${RT.th} ${RT.thRight}`}>Net (equity)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.equityByGroup
                          .filter((r) => r.net < 0)
                          .map((row) => (
                            <tr key={row.groupLabel} className={RT.detailRow}>
                              <td className={RT.cellLeft}>{row.groupLabel}</td>
                              <td className={`${RT.cellRight} text-neg`}>{fmtUsd(row.net)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </Card.Section>
                </Card>
              )}
            </section>
          )}

          {tab !== 'balance' && tab !== 'mix' &&
            accountChangeRows &&
            equityChangeRows &&
            baselineReport && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-navy-700">
                    Comparison
                  </span>
                  <div className="flex flex-wrap gap-1 rounded-lg border border-navy-200 bg-white p-0.5">
                    <HorizonPill active={horizon === '1mo'} onClick={() => setHorizon('1mo')}>
                      1 mo
                    </HorizonPill>
                    <HorizonPill active={horizon === 'ytd'} onClick={() => setHorizon('ytd')}>
                      YTD
                    </HorizonPill>
                    <HorizonPill active={horizon === '1yr'} onClick={() => setHorizon('1yr')}>
                      1 YR
                    </HorizonPill>
                  </div>
                  <span className="text-sm text-gray-600">
                    vs{' '}
                    <span className="font-semibold text-navy-900">
                      {formatPeriod(baselinePeriod)}
                    </span>{' '}
                    <span className="text-gray-500">({horizonLabel})</span>
                  </span>
                </div>

                {tab === 'changeBar' && (
                  <Card>
                    <BalanceSheetChangeBars
                      assets={assetRows}
                      liabilities={liabilityRows}
                      equity={equityChangeRows}
                    />
                  </Card>
                )}

                {tab === 'changeTable' && (
                  <div className="space-y-6">
                    <ChangeTotalsStrip
                      totalAssetDelta={totalAssetDelta}
                      totalLiabDelta={totalLiabDelta}
                      netWorthDelta={netWorthDelta}
                      netWorthPct={netWorthPct}
                    />

                    <section>
                      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-700">
                        Assets
                      </h2>
                      <Card padded={false}>
                        <table className={RT.table}>
                          <thead className={RT.head}>
                            <tr>
                              <th className={`${RT.th} ${RT.thLeft}`}>Name</th>
                              <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Prior</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Current</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Δ $</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Δ %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assetRows.map((row) => (
                              <tr key={row.id} className={RT.detailRow}>
                                <td className={RT.cellLeft}>{row.name}</td>
                                <td className={`${RT.cellLeft} text-gray-500`}>{row.groupLabel}</td>
                                <td className={RT.cellRight}>
                                  {row.baseline == null ? '—' : fmtUsd(row.baseline)}
                                </td>
                                <td className={RT.cellRight}>
                                  {row.current == null ? '—' : fmtUsd(row.current)}
                                </td>
                                <td className={`${RT.cellRight} font-semibold ${deltaClassForAsset(row.delta)}`}>
                                  {row.delta == null ? '—' : fmtUsd(row.delta)}
                                </td>
                                <td className={`${RT.cellRight} ${deltaClassForAsset(row.delta)}`}>
                                  {fmtPct(row.pct, { decimals: 1 })}
                                </td>
                              </tr>
                            ))}
                            <tr className={RT.totalRow}>
                              <td colSpan={2} className={RT.totalCell}>
                                Total assets
                              </td>
                              <td className={RT.totalCellRight}>{fmtUsd(baselineReport.totalAssets)}</td>
                              <td className={RT.totalCellRight}>{fmtUsd(report.totalAssets)}</td>
                              <td
                                className={`${RT.totalCellRight} ${deltaClassForAsset(totalAssetDelta)}`}
                              >
                                {totalAssetDelta == null ? '—' : fmtUsd(totalAssetDelta)}
                              </td>
                              <td className={RT.totalCellRight}>
                                {baselineReport.totalAssets === 0
                                  ? '—'
                                  : fmtPct(
                                      (totalAssetDelta! / Math.abs(baselineReport.totalAssets)) * 100,
                                      { decimals: 1 },
                                    )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </Card>
                    </section>

                    <section>
                      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-700">
                        Liabilities
                      </h2>
                      <Card padded={false}>
                        <table className={RT.table}>
                          <thead className={RT.head}>
                            <tr>
                              <th className={`${RT.th} ${RT.thLeft}`}>Name</th>
                              <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Prior</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Current</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Δ $</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Δ %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {liabilityRows.map((row) => (
                              <tr key={row.id} className={RT.detailRow}>
                                <td className={RT.cellLeft}>{row.name}</td>
                                <td className={`${RT.cellLeft} text-gray-500`}>{row.groupLabel}</td>
                                <td className={RT.cellRight}>
                                  {row.baseline == null ? '—' : fmtUsd(row.baseline)}
                                </td>
                                <td className={RT.cellRight}>
                                  {row.current == null ? '—' : fmtUsd(row.current)}
                                </td>
                                <td
                                  className={`${RT.cellRight} font-semibold ${deltaClassForLiability(row.delta)}`}
                                >
                                  {row.delta == null ? '—' : fmtUsd(row.delta)}
                                </td>
                                <td className={`${RT.cellRight} ${deltaClassForLiability(row.delta)}`}>
                                  {fmtPct(row.pct, { decimals: 1 })}
                                </td>
                              </tr>
                            ))}
                            <tr className={RT.totalRow}>
                              <td colSpan={2} className={RT.totalCell}>
                                Total liabilities
                              </td>
                              <td className={RT.totalCellRight}>
                                {fmtUsd(baselineReport.totalLiabilities)}
                              </td>
                              <td className={RT.totalCellRight}>{fmtUsd(report.totalLiabilities)}</td>
                              <td
                                className={`${RT.totalCellRight} ${deltaClassForLiability(totalLiabDelta)}`}
                              >
                                {totalLiabDelta == null ? '—' : fmtUsd(totalLiabDelta)}
                              </td>
                              <td className={RT.totalCellRight}>
                                {baselineReport.totalLiabilities === 0
                                  ? '—'
                                  : fmtPct(
                                      (totalLiabDelta! / Math.abs(baselineReport.totalLiabilities)) * 100,
                                      { decimals: 1 },
                                    )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </Card>
                    </section>

                    <section>
                      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-700">
                        Equity by group
                      </h2>
                      <Card padded={false}>
                        <table className={RT.table}>
                          <thead className={RT.head}>
                            <tr>
                              <th className={`${RT.th} ${RT.thLeft}`}>Group</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Prior net</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Current net</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Δ $</th>
                              <th className={`${RT.th} ${RT.thRight}`}>Δ %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {equityChangeRows.map((row) => (
                              <tr key={row.groupLabel} className={RT.detailRow}>
                                <td className={RT.cellLeft}>{row.groupLabel}</td>
                                <td className={RT.cellRight}>{fmtUsd(row.baselineNet)}</td>
                                <td className={RT.cellRight}>{fmtUsd(row.currentNet)}</td>
                                <td className={`${RT.cellRight} font-semibold ${deltaClassForNet(row.delta)}`}>
                                  {fmtUsd(row.delta)}
                                </td>
                                <td className={`${RT.cellRight} ${deltaClassForNet(row.delta)}`}>
                                  {fmtPct(row.pct, { decimals: 1 })}
                                </td>
                              </tr>
                            ))}
                            <tr className={RT.totalRow}>
                              <td className={RT.totalCell}>Net worth</td>
                              <td className={RT.totalCellRight}>{fmtUsd(baselineReport.netWorth)}</td>
                              <td className={RT.totalCellRight}>{fmtUsd(report.netWorth)}</td>
                              <td className={`${RT.totalCellRight} ${deltaClassForNet(netWorthDelta ?? 0)}`}>
                                {netWorthDelta == null ? '—' : fmtUsd(netWorthDelta)}
                              </td>
                              <td className={RT.totalCellRight}>{fmtPct(netWorthPct, { decimals: 1 })}</td>
                            </tr>
                          </tbody>
                        </table>
                      </Card>
                    </section>
                  </div>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 pb-2 text-sm font-semibold transition-colors ${
        active ? 'text-navy-900' : 'text-gray-500 hover:text-navy-700'
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 border-b-[3px] border-gold-500" />
      )}
    </button>
  );
}

function HorizonPill({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? 'bg-navy-800 text-white shadow-sm'
          : 'text-navy-700 hover:bg-navy-50'
      }`}
    >
      {children}
    </button>
  );
}

function ChangeTotalsStrip(props: {
  totalAssetDelta: number | null;
  totalLiabDelta: number | null;
  netWorthDelta: number | null;
  netWorthPct: number | null;
}) {
  const { totalAssetDelta, totalLiabDelta, netWorthDelta, netWorthPct } = props;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card padded={false} className="border border-navy-100 bg-navy-50/40 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
          Assets Δ
        </div>
        <div className={`mt-1 text-lg font-bold tabular-nums ${deltaClassForAsset(totalAssetDelta)}`}>
          {totalAssetDelta == null ? '—' : fmtUsd(totalAssetDelta)}
        </div>
      </Card>
      <Card padded={false} className="border border-navy-100 bg-navy-50/40 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
          Liabilities Δ
        </div>
        <div className={`mt-1 text-lg font-bold tabular-nums ${deltaClassForLiability(totalLiabDelta)}`}>
          {totalLiabDelta == null ? '—' : fmtUsd(totalLiabDelta)}
        </div>
      </Card>
      <Card padded={false} className="border border-navy-100 bg-navy-50/40 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
          Net worth Δ
        </div>
        <div className={`mt-1 text-lg font-bold tabular-nums ${deltaClassForNet(netWorthDelta ?? 0)}`}>
          {netWorthDelta == null ? '—' : fmtUsd(netWorthDelta)}
        </div>
        <div className="mt-0.5 text-xs text-gray-600">{fmtPct(netWorthPct, { decimals: 1 })}</div>
      </Card>
    </div>
  );
}
