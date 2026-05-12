/**
 * Horizontal category bar chart — top spend categories for the current period.
 *
 * Each row: right-aligned label → full-width bar track → value text.
 * Bar fill uses the category's hex color. Value sits inside the bar
 * when the fill is wide enough, else floats outside in gray-700.
 */

import { fmtUsd } from '@/lib/money';

export interface HorizontalCategoryBarItem {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface Props {
  items: HorizontalCategoryBarItem[];
}

const ROW_H = 26;
const GAP = 14;
const LABEL_W = 96;
const FILL_THRESHOLD = 0.28;

export function HorizontalCategoryBars({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-400">
        No categories this month
      </div>
    );
  }

  const max = Math.max(...items.map((i) => i.value)) * 1.02;

  return (
    <div className="space-y-0">
      {items.map((item) => {
        const ratio = max > 0 ? item.value / max : 0;
        const wide = ratio >= FILL_THRESHOLD;
        return (
          <div
            key={item.key}
            className="flex items-center"
            style={{ height: ROW_H, marginBottom: GAP }}
            title={`${item.label}: ${fmtUsd(item.value)}`}
          >
            <div
              className="shrink-0 truncate text-right text-[12px] text-gray-600"
              style={{ width: LABEL_W }}
            >
              {item.label}
            </div>
            <div className="relative ml-3 flex-1">
              <div className="h-5 w-full rounded-full bg-navy-100" />
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.max(ratio * 100, 1)}%`,
                  backgroundColor: item.color,
                }}
              />
              <span
                className={`absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular-nums ${
                  wide ? 'text-white' : 'text-gray-700'
                }`}
                style={
                  wide
                    ? { right: `${(1 - ratio) * 100 + 1}%`, paddingRight: 6 }
                    : { left: `${ratio * 100 + 1}%`, paddingLeft: 6 }
                }
              >
                {fmtUsd(item.value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
