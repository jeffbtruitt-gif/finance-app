import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTrip, deleteTrip, fetchTrips } from '@/api/trips';
import { useHousehold } from '@/api/household';
import { Button, Card } from '@/components/ds';
import { formatDate } from '@/lib/date';

export function TripsPage() {
  const qc = useQueryClient();
  const household = useHousehold();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const tripsQ = useQuery({
    queryKey: ['trips', household?.id],
    enabled: !!household?.id,
    queryFn: () => fetchTrips(household!.id),
  });

  const createMut = useMutation({
    mutationFn: () => {
      if (!household) throw new Error('No household');
      return createTrip(household.id, { name, start_date: startDate, end_date: endDate });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips', household?.id] });
      setName('');
      setStartDate('');
      setEndDate('');
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteTrip,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips', household?.id] }),
  });

  const canSubmit = useMemo(() => {
    if (!name.trim() || !startDate || !endDate) return false;
    if (endDate < startDate) return false;
    return true;
  }, [name, startDate, endDate]);

  const onAdd = () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError('Enter a trip name.');
      return;
    }
    if (!startDate || !endDate) {
      setFormError('Choose leave and return dates.');
      return;
    }
    if (endDate < startDate) {
      setFormError('Return date must be on or after leave date.');
      return;
    }
    createMut.mutate();
  };

  if (!household) {
    return <p className="text-gray-500">Loading household…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <h2 className="mb-1 text-h3 font-semibold text-navy-900">Add a trip</h2>
        <p className="mb-4 text-sm text-gray-500">
          Transactions whose date falls between leave and return (inclusive) show a plane icon and
          light highlight on the Transactions page.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-label text-gray-600">Trip name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring break"
              className="rounded-md border border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label text-gray-600">Date leave</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-navy-200 bg-white px-3 py-2 text-sm tabular-nums text-navy-900 shadow-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label text-gray-600">Date return</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-navy-200 bg-white px-3 py-2 text-sm tabular-nums text-navy-900 shadow-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
            />
          </label>
        </div>
        {startDate && endDate && endDate < startDate && (
          <p className="mt-3 text-sm text-neg">Return date must be on or after leave date.</p>
        )}
        {formError && <p className="mt-3 text-sm text-neg">{formError}</p>}
        <div className="mt-4">
          <Button
            variant="primary"
            size="sm"
            disabled={!canSubmit || createMut.isPending}
            onClick={onAdd}
          >
            {createMut.isPending ? 'Saving…' : 'Add trip'}
          </Button>
        </div>
      </Card>

      <Card padded={false}>
        <div className="border-b border-navy-100 px-4 py-3">
          <h2 className="text-h3 font-semibold text-navy-900">Your trips</h2>
        </div>
        {tripsQ.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">Loading…</p>
        ) : tripsQ.error ? (
          <p className="px-4 py-8 text-center text-sm text-neg">
            {(tripsQ.error as Error).message}
          </p>
        ) : (tripsQ.data?.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No trips yet.</p>
        ) : (
          <ul className="divide-y divide-navy-100">
            {tripsQ.data!.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-navy-900">{t.name}</div>
                  <div className="num-tab text-xs text-gray-600">
                    {formatDate(t.start_date)} → {formatDate(t.end_date)}
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  className="shrink-0"
                  disabled={deleteMut.isPending}
                  onClick={() => {
                    if (confirm(`Delete trip “${t.name}”?`)) deleteMut.mutate(t.id);
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
