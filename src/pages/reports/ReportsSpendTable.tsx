import { RT } from '@/components/ds';
import type { ReportMonthGroup, ReportMonthItem } from '@/features/reports/monthlyReportModel';
import { fmtUsd, variance, variancePct, fmtPct, varianceClass } from '@/lib/money';

export function ReportsSpendTable(props: {
  monthlyGroups: ReportMonthGroup[];
  yearlyGroup: ReportMonthGroup | null;
  isFuture: boolean;
  onDrillCategory: (id: string, name: string) => void;
  onDrillGroup: (drillKey: string, displayLabel: string) => void;
}) {
  const monthlyTotals = sumSection(props.monthlyGroups);
  const yearlyTotals = props.yearlyGroup ? sumItems(props.yearlyGroup.items) : null;

  return (
    <div className="overflow-x-auto rounded-lg border border-navy-100 bg-white shadow-sm">
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
          <SectionIntro
            eyebrow="Monthly categories"
            caption="Actual vs budget for the selected month."
          />
          {props.monthlyGroups.map((g) => (
            <GroupBlock
              key={g.drillKey}
              group={g}
              isFuture={props.isFuture}
              mode="monthly"
              onDrillCategory={props.onDrillCategory}
              onDrillGroup={props.onDrillGroup}
            />
          ))}
          <tr className={RT.totalRow}>
            <td className={RT.totalCell}>Total spend — monthly</td>
            <td className={RT.totalCellRight}>{fmtUsd(monthlyTotals.actual)}</td>
            <td className={RT.totalCellRight}>{fmtUsd(monthlyTotals.budget)}</td>
            <td className={`${RT.totalCellRight} ${varianceClass(variance(monthlyTotals.actual, monthlyTotals.budget))}`}>
              {fmtUsd(variance(monthlyTotals.actual, monthlyTotals.budget))}
            </td>
            <td className={RT.totalCellRight}>
              {fmtPct(variancePct(monthlyTotals.actual, monthlyTotals.budget))}
            </td>
          </tr>

          {props.yearlyGroup && props.yearlyGroup.items.length > 0 && (
            <>
              <SectionIntro
                eyebrow="Yearly categories"
                caption="Year-to-date spend vs full-year budget (does not reset each month)."
              />
              <GroupBlock
                group={props.yearlyGroup}
                isFuture={props.isFuture}
                mode="yearly"
                onDrillCategory={props.onDrillCategory}
                onDrillGroup={props.onDrillGroup}
              />
              <tr className={RT.totalRow}>
                <td className={RT.totalCell}>Total spend — yearly</td>
                <td className={RT.totalCellRight}>{fmtUsd(yearlyTotals!.actual)}</td>
                <td className={RT.totalCellRight}>{fmtUsd(yearlyTotals!.budget)}</td>
                <td
                  className={`${RT.totalCellRight} ${varianceClass(
                    variance(yearlyTotals!.actual, yearlyTotals!.budget),
                  )}`}
                >
                  {fmtUsd(variance(yearlyTotals!.actual, yearlyTotals!.budget))}
                </td>
                <td className={RT.totalCellRight}>
                  {fmtPct(variancePct(yearlyTotals!.actual, yearlyTotals!.budget))}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SectionIntro({ eyebrow, caption }: { eyebrow: string; caption: string }) {
  return (
    <tr className="bg-white">
      <td colSpan={5} className="px-4 pb-2 pt-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-600">{eyebrow}</div>
        <p className="mt-1 text-caption text-gray-500">{caption}</p>
      </td>
    </tr>
  );
}

function GroupBlock(props: {
  group: ReportMonthGroup;
  isFuture: boolean;
  mode: 'monthly' | 'yearly';
  onDrillCategory: (id: string, name: string) => void;
  onDrillGroup: (drillKey: string, displayLabel: string) => void;
}) {
  const { group } = props;
  const sub = sumItems(group.items);
  return (
    <>
      <tr
        className={`${RT.groupRow} cursor-pointer`}
        onDoubleClick={() => props.onDrillGroup(group.drillKey, group.name)}
      >
        <td colSpan={5} className={RT.groupCell}>
          {group.name}
        </td>
      </tr>
      {group.items.map((row) => (
        <ItemRow
          key={row.id}
          row={row}
          isFuture={props.isFuture}
          mode={props.mode}
          onDoubleClick={() => props.onDrillCategory(row.id, row.name)}
        />
      ))}
      <tr className={RT.subtotalRow}>
        <td className={RT.cellLeft}>{group.name} subtotal</td>
        <td className={RT.cellRight}>{fmtUsd(sub.actual)}</td>
        <td className={RT.cellRight}>{fmtUsd(sub.budget)}</td>
        <td className={`${RT.cellRight} ${varianceClass(variance(sub.actual, sub.budget))}`}>
          {fmtUsd(variance(sub.actual, sub.budget))}
        </td>
        <td className={`${RT.cellRight} ${varianceClass(variance(sub.actual, sub.budget))}`}>
          {fmtPct(variancePct(sub.actual, sub.budget))}
        </td>
      </tr>
    </>
  );
}

function ItemRow(props: {
  row: ReportMonthItem;
  isFuture: boolean;
  mode: 'monthly' | 'yearly';
  onDoubleClick: () => void;
}) {
  const { row } = props;
  const v = variance(row.actual, row.budget);
  const vp = variancePct(row.actual, row.budget);
  const showDash = props.isFuture && props.mode === 'monthly';
  const actualDisplay = showDash ? '—' : fmtUsd(row.actual);
  const varDisplay = showDash || row.budget === 0 ? '—' : fmtUsd(v);
  const pctDisplay = showDash || row.budget === 0 ? '—' : fmtPct(vp);
  const barPct =
    row.budget > 0 ? Math.min(100, Math.abs(v / row.budget) * 100) : v !== 0 ? 100 : 0;

  return (
    <tr className={`${RT.detailRow} cursor-pointer`} onDoubleClick={props.onDoubleClick}>
      <td className={RT.cellLeft}>{row.name}</td>
      <td className={RT.cellRight}>{actualDisplay}</td>
      <td className={RT.cellRightMuted}>{row.budget === 0 ? '—' : fmtUsd(row.budget)}</td>
      <td className={`${RT.cellRight} ${varianceClass(v)}`}>
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-navy-100">
            <div
              className={`h-full rounded-full ${v > 0 ? 'bg-neg' : v < 0 ? 'bg-pos' : 'bg-gray-300'}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
          <span>{varDisplay}</span>
        </div>
      </td>
      <td className={`${RT.cellRight} ${varianceClass(v)}`}>{pctDisplay}</td>
    </tr>
  );
}

function sumItems(items: ReportMonthItem[]): { actual: number; budget: number } {
  return items.reduce((a, r) => ({ actual: a.actual + r.actual, budget: a.budget + r.budget }), {
    actual: 0,
    budget: 0,
  });
}

function sumSection(groups: ReportMonthGroup[]): { actual: number; budget: number } {
  return groups.reduce(
    (acc, g) => {
      const s = sumItems(g.items);
      return { actual: acc.actual + s.actual, budget: acc.budget + s.budget };
    },
    { actual: 0, budget: 0 },
  );
}
