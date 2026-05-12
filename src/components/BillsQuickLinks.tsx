/**
 * Bills quick-links list — shows active recurring bills sorted by due day.
 * Truncates to maxRows with a "+N more" footer link.
 */

import { Link } from 'react-router-dom';
import type { Bill } from '@/api/bills';

interface Props {
  bills: Bill[];
  maxRows?: number;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ensureHttp(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export function BillsQuickLinks({ bills, maxRows = 8 }: Props) {
  const active = bills
    .filter((b) => b.is_active)
    .sort((a, b) => {
      if (a.due_day == null && b.due_day == null) return 0;
      if (a.due_day == null) return 1;
      if (b.due_day == null) return -1;
      return a.due_day - b.due_day;
    });

  const visible = active.slice(0, maxRows);
  const hidden = active.length - visible.length;

  if (active.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-400">
        No active bills
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-navy-100">
        {visible.map((bill) => (
          <div
            key={bill.id}
            className="flex items-center gap-3 px-5 py-2.5"
          >
            {/* due day badge */}
            <div className="flex w-9 shrink-0 flex-col items-center">
              <span className="text-[9px] uppercase tracking-wider text-gray-400">
                Due
              </span>
              <span className="text-sm font-bold text-navy-900">
                {bill.due_day != null ? ordinal(bill.due_day) : '—'}
              </span>
            </div>

            {/* name + notes */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-navy-900">
                {bill.name}
              </div>
              {bill.notes && (
                <div className="truncate text-[11px] text-gray-500">
                  {bill.notes}
                </div>
              )}
            </div>

            {/* Go button */}
            {bill.url && (
              <a
                href={ensureHttp(bill.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full bg-navy-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-navy-700"
              >
                Go&nbsp;↗
              </a>
            )}
          </div>
        ))}
      </div>

      {hidden > 0 && (
        <div className="border-t border-navy-100 px-5 py-2 text-center">
          <Link
            to="/bills"
            className="text-xs font-medium text-navy-700 hover:text-navy-900"
          >
            +{hidden} more bills →
          </Link>
        </div>
      )}
    </div>
  );
}
