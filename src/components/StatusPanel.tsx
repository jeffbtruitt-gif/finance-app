/**
 * StatusPanel — empty / loading / error placeholder used by every page.
 *
 * Restyled May 2026 to use design-system tokens:
 *   - error  : neg-soft bg, neg text, neg/30 border
 *   - empty  : white bg, dashed gray-300 border, gray-500 text
 *   - loading: white bg, gray-200 border, animated dot row
 */

interface StatusPanelProps {
  kind: 'loading' | 'error' | 'empty';
  message: string;
  detail?: string;
}

export function StatusPanel({ kind, message, detail }: StatusPanelProps) {
  if (kind === 'error') {
    return (
      <div className="rounded-lg border border-neg/30 bg-neg-soft p-6 text-sm text-neg">
        <div className="font-semibold">{message}</div>
        {detail && <div className="mt-1 text-xs opacity-80">{detail}</div>}
      </div>
    );
  }
  if (kind === 'empty') {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
        <div className="font-medium text-gray-700">{message}</div>
        {detail && <div className="mt-1 text-xs">{detail}</div>}
      </div>
    );
  }
  // loading
  return (
    <div className="rounded-lg border border-navy-100 bg-white p-6 text-sm text-gray-500">
      <div className="flex items-center gap-2">
        <span className="inline-flex gap-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-navy-300" />
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-navy-300"
            style={{ animationDelay: '0.15s' }}
          />
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-navy-300"
            style={{ animationDelay: '0.3s' }}
          />
        </span>
        <span className="font-medium text-gray-700">{message}</span>
      </div>
      {detail && <div className="mt-1 text-xs opacity-80">{detail}</div>}
    </div>
  );
}
