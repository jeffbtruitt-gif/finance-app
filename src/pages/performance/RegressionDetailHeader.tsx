import { type RegressionRow } from '@/api/performance';
import { Card, Badge } from '@/components/ds';
import { MONTH_NAMES_SHORT } from '@/lib/period';

interface Props {
  accountName: string;
  row: RegressionRow;
}

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatMonthLabel(iso: string): string {
  const [y, m] = iso.split('-');
  return `${MONTH_NAMES_SHORT[Number(m) - 1]} ${y}`;
}

function computeStartMonth(periodEnd: string, months: number): string {
  const d = new Date(periodEnd);
  d.setMonth(d.getMonth() - months + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function RegressionDetailHeader({ accountName, row }: Props) {
  const startMonth = computeStartMonth(row.period_end, row.period_months);

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5">
        <div className="flex items-center gap-3 min-w-[260px]">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-navy-50 text-navy-700">
            <span className="text-base font-bold">{monogram(accountName)}</span>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">Portfolio</div>
            <div className="text-[18px] font-bold text-navy-900 leading-tight">{accountName}</div>
          </div>
        </div>
        <div className="h-10 w-px bg-gray-200 hidden md:block" />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">Window</div>
          <div className="mt-0.5 flex items-center gap-2">
            <Badge tone="navy">{row.period_months}mo</Badge>
            <span className="text-sm font-semibold text-navy-800 tabular-nums">
              {formatMonthLabel(startMonth)} → {formatMonthLabel(row.period_end.slice(0, 7))}
            </span>
          </div>
        </div>
        <div className="h-10 w-px bg-gray-200 hidden md:block" />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">Observations</div>
          <div className="mt-0.5 text-sm font-semibold text-navy-800 tabular-nums">{row.n_observations} months</div>
        </div>
        <div className="h-10 w-px bg-gray-200 hidden md:block" />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">Run on</div>
          <div className="mt-0.5 text-sm font-semibold text-navy-800 tabular-nums">{row.run_date}</div>
        </div>
        <div className="h-10 w-px bg-gray-200 hidden md:block" />
        <div className="ml-auto">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">Model</div>
          <div className="mt-0.5 text-sm font-semibold text-navy-800">Fama-French 3-Factor + CAPM</div>
        </div>
      </div>
    </Card>
  );
}
