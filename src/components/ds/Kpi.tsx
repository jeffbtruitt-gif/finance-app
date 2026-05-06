/**
 * Kpi — design system KPI card.
 *
 * Matches the PDF section "KPI Cards":
 *   ┌─────────────────────────┐
 *   │ MONTHLY SPEND           │  ← label (uppercase, gray-500)
 *   │ $4,821                  │  ← value (display weight, navy-900)
 *   │ May 2026                │  ← subtitle (gray-500)
 *   │ ↑ 3.2% vs last month    │  ← trend (pos/neg/neutral colored)
 *   └─────────────────────────┘
 *
 * Used by Dashboard, Retire, and any page that wants to surface a single
 * headline number.
 */

import { type ReactNode } from 'react';
import { Card } from './Card';

interface KpiProps {
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
  /** Optional trend indicator. Pos shows ↑ green; neg shows ↓ red; neutral
   *  shows no glyph. */
  trend?: {
    direction: 'pos' | 'neg' | 'neutral';
    text: string;
  };
  /** Right-aligned slot — tiny chart, badge, etc. */
  rightSlot?: ReactNode;
  className?: string;
  /** Render with the gold-tinted accent background (use sparingly — for the
   *  one "hero" KPI per page). */
  accent?: boolean;
}

export function Kpi({
  label,
  value,
  subtitle,
  trend,
  rightSlot,
  className = '',
  accent = false,
}: KpiProps) {
  const accentClasses = accent
    ? 'border-gold-300 bg-gold-100/50'
    : '';
  const trendColor =
    trend?.direction === 'pos'
      ? 'text-pos'
      : trend?.direction === 'neg'
        ? 'text-neg'
        : 'text-gray-500';
  const trendGlyph =
    trend?.direction === 'pos'
      ? '↑'
      : trend?.direction === 'neg'
        ? '↓'
        : '·';

  return (
    <Card className={`${accentClasses} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-label uppercase text-gray-500">{label}</div>
          <div className="mt-2 text-[28px] font-bold leading-none tracking-tight text-navy-900 tabular-nums">
            {value}
          </div>
          {subtitle && (
            <div className="mt-1.5 text-caption text-gray-500">{subtitle}</div>
          )}
          {trend && (
            <div className={`mt-2 text-xs font-semibold tabular-nums ${trendColor}`}>
              <span className="mr-1">{trendGlyph}</span>
              {trend.text}
            </div>
          )}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </Card>
  );
}
