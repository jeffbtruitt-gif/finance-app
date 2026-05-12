/**
 * Upcoming trips quick-links — shows trips that haven't ended yet,
 * with a countdown badge or "Now" indicator.
 */

import { Link } from 'react-router-dom';

export interface TripItem {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface Props {
  trips: TripItem[];
  todayIso: string;
  maxRows?: number;
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export function TripsQuickLinks({ trips, todayIso, maxRows = 4 }: Props) {
  const upcoming = trips
    .filter((t) => t.end_date >= todayIso)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const visible = upcoming.slice(0, maxRows);
  const hidden = upcoming.length - visible.length;

  if (upcoming.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-400">
        No upcoming trips
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-navy-100">
        {visible.map((trip) => {
          const started = todayIso >= trip.start_date;
          const daysAway = daysBetween(todayIso, trip.start_date);

          return (
            <div
              key={trip.id}
              className="flex items-center gap-3 px-5 py-3"
            >
              {/* countdown badge */}
              <div className="flex w-14 shrink-0 flex-col items-center">
                {started ? (
                  <span className="rounded-full bg-pos-soft px-2.5 py-0.5 text-[11px] font-bold text-pos">
                    Now
                  </span>
                ) : (
                  <span className="text-center text-[11px] font-semibold text-navy-700">
                    In {daysAway}d
                  </span>
                )}
              </div>

              {/* name + dates */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-navy-900">
                  {trip.name}
                </div>
                <div className="text-[11px] text-gray-500">
                  {fmtShortDate(trip.start_date)} – {fmtShortDate(trip.end_date)}
                </div>
              </div>

              <Link
                to="/trips"
                className="shrink-0 text-xs font-medium text-navy-700 hover:text-navy-900"
              >
                Edit
              </Link>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <div className="border-t border-navy-100 px-5 py-2 text-center">
          <Link
            to="/trips"
            className="text-xs font-medium text-navy-700 hover:text-navy-900"
          >
            +{hidden} more trips →
          </Link>
        </div>
      )}
    </div>
  );
}
