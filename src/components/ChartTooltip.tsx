/**
 * Floating chart tooltip — Truitt Finance DS: white surface, navy border,
 * subtle shadow, type scale aligned with dashboard chart components.
 */

export type ChartTooltipAnchor = { clientX: number; clientY: number };

export interface ChartTooltipRow {
  label: string;
  value: string;
}

export interface ChartTooltipProps {
  anchor: ChartTooltipAnchor;
  /** Primary context (e.g. category or bar title). */
  headline: string;
  rows: ReadonlyArray<ChartTooltipRow>;
}

export function ChartTooltip({ anchor, headline, rows }: ChartTooltipProps) {
  return (
    <div
      className="pointer-events-none fixed z-[100] w-max max-w-[min(288px,calc(100vw-24px))] rounded-md border border-navy-200 bg-white px-3 py-2.5 shadow-md"
      style={{
        left: anchor.clientX + 14,
        top: anchor.clientY + 14,
      }}
    >
      <div className="text-sm font-semibold leading-snug text-navy-900">{headline}</div>
      <div className="mt-2 space-y-1.5 border-t border-navy-100 pt-2">
        {rows.map((r, i) => (
          <div
            key={`${r.label}-${i}`}
            className="flex items-baseline justify-between gap-6 text-[11px] leading-tight"
          >
            <span className="font-medium text-gray-600">{r.label}</span>
            <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-navy-900">
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
