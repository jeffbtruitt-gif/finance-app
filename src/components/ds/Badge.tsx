/**
 * Badge — design system status pill.
 *
 * Tone-based; each tone uses its semantic soft-tint background + bolder
 * text/border. Matches the PDF section 05 Badges row.
 *
 * Tones:
 *   - neutral: gray-100 / gray-700        — generic counts / labels
 *   - pos    : pos-soft / pos             — gains, "On track"
 *   - neg    : neg-soft / neg             — losses, "Failed"
 *   - warn   : warn-soft / warn           — "Needs Review"
 *   - info   : info-soft / info           — informational ("20 imported")
 *   - navy   : navy-100 / navy-800        — brand-toned ("Imported")
 *   - gold   : gold-100 / gold-600        — accent ("Premium")
 *   - outline: white + gray-300 border    — subtle, used in dense rows
 */

import { type ReactNode } from 'react';

export type BadgeTone =
  | 'neutral'
  | 'pos'
  | 'neg'
  | 'warn'
  | 'info'
  | 'navy'
  | 'gold'
  | 'outline';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-700 border border-gray-200',
  pos: 'bg-pos-soft text-pos border border-pos/20',
  neg: 'bg-neg-soft text-neg border border-neg/20',
  warn: 'bg-warn-soft text-warn border border-warn/20',
  info: 'bg-info-soft text-info border border-info/20',
  navy: 'bg-navy-100 text-navy-800 border border-navy-200',
  gold: 'bg-gold-100 text-gold-600 border border-gold-300',
  outline: 'bg-white text-gray-700 border border-gray-300',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  /** Optional small dot at the start (e.g. status indicator). */
  dot?: boolean;
}

export function Badge({
  tone = 'neutral',
  children,
  className = '',
  dot = false,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
