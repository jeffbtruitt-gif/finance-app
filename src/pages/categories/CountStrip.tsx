export interface CategoryCounts {
  active: number;
  groups: number;
  yearly: number;
  archived: number;
}

export function CountStrip({ counts }: { counts: CategoryCounts }) {
  const items: { label: string; value: number }[] = [
    { label: 'Active', value: counts.active },
    { label: 'Groups', value: counts.groups },
    { label: 'Yearly', value: counts.yearly },
    { label: 'Archived', value: counts.archived },
  ];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-6 rounded-lg border border-navy-100 bg-white px-4 py-3 shadow-sm">
      {items.map((k) => (
        <div key={k.label} className="flex items-baseline gap-2">
          <span className="num-tab text-h3 text-navy-900">{k.value}</span>
          <span className="text-caption uppercase tracking-wider text-gray-500">
            {k.label}
          </span>
        </div>
      ))}
    </div>
  );
}
