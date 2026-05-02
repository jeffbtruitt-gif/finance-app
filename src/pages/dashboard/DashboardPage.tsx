export function DashboardPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mb-6 text-sm text-slate-500">
        Spending vs budget, net worth, FI metric, income vs actual. Comes online in Phase 5.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[
          'Monthly spend vs budget',
          'YTD vs budget',
          'Savings YTD',
          'Net worth',
          'FI multiplier (25× spend)',
          'Income projected vs actual',
        ].map((title) => (
          <div
            key={title}
            className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm"
          >
            <div className="mb-1 font-medium text-slate-700">{title}</div>
            <div className="text-slate-400">Phase 5</div>
          </div>
        ))}
      </div>
    </div>
  );
}
