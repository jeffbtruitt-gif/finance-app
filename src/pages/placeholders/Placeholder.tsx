interface PlaceholderProps {
  title: string;
  phase: number;
}

export function Placeholder({ title, phase }: PlaceholderProps) {
  return (
    <div>
      <p className="mb-4 text-body-base text-gray-500">
        Coming in Phase {phase}. The route exists so the nav works end-to-end.
      </p>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-400">
        Nothing here yet for {title}.
      </div>
    </div>
  );
}
