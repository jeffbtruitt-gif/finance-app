interface PlaceholderProps {
  title: string;
  phase: number;
}

export function Placeholder({ title, phase }: PlaceholderProps) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mb-6 text-sm text-slate-500">
        Coming in Phase {phase}. The route exists so the nav works end-to-end.
      </p>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-400">
        Nothing here yet.
      </div>
    </div>
  );
}
