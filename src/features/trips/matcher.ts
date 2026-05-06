/**
 * Trip auto-stamping.
 *
 * Given a list of trips and a list of transactions (with ISO dates), returns
 * a Map of transaction-index → trip metadata for any transaction whose date
 * falls within a trip's [start_date, end_date] range (inclusive).
 *
 * If a transaction date matches multiple overlapping trips, the FIRST trip
 * (by sort order in input) wins. Overlapping trips should be rare, but worth
 * knowing the rule.
 */

export interface TripMatch {
  trip_id: string;
  trip_name: string;
}

export interface TripForMatching {
  id: string;
  name: string;
  start_date: string;  // ISO YYYY-MM-DD
  end_date: string;    // ISO YYYY-MM-DD
}

export function matchTrips<T extends { date: string }>(
  transactions: T[],
  trips: TripForMatching[],
): Map<number, TripMatch> {
  const matches = new Map<number, TripMatch>();
  if (trips.length === 0) return matches;

  // ISO YYYY-MM-DD strings compare correctly with <=/>=, no Date parse needed
  for (let i = 0; i < transactions.length; i++) {
    const d = transactions[i].date;
    const m = tripMatchForDate(d, trips);
    if (m) matches.set(i, m);
  }
  return matches;
}

/** First trip in list order whose range contains `date` (inclusive). */
export function tripMatchForDate(date: string, trips: TripForMatching[]): TripMatch | null {
  for (const trip of trips) {
    if (date >= trip.start_date && date <= trip.end_date) {
      return { trip_id: trip.id, trip_name: trip.name };
    }
  }
  return null;
}
