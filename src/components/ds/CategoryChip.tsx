/**
 * CategoryChip — design system category pill.
 *
 * Renders a category name with the appropriate cat-* color (PDF section 05
 * "Category Chips" + section 02 "Category Colors"). Falls back to the
 * `uncategorized` color for any unknown category name.
 *
 * Two variants:
 *   - solid (default): muted tinted background + colored text + dot
 *   - outline        : transparent + colored text + colored border
 *
 * Optional `onRemove` callback adds an `×` button (matches the PDF's
 * "Uncategorized ✕" example).
 */

import { type ReactNode } from 'react';

const CAT_KEYS = [
  'shopping',
  'restaurants',
  'groceries',
  'transportation',
  'entertainment',
  'utilities',
  'health',
  'travel',
  'salary',
  'uncategorized',
] as const;

type CatKey = (typeof CAT_KEYS)[number];

const CAT_HEX: Record<CatKey, string> = {
  shopping: '#9b6dd1',
  restaurants: '#e08750',
  groceries: '#3a9e6f',
  transportation: '#3884c2',
  entertainment: '#d4517f',
  utilities: '#7a8aa8',
  health: '#22a39f',
  travel: '#c98c3b',
  salary: '#1e7e5a',
  uncategorized: '#9aa0af',
};

/** Resolve any category name (free text from the DB) to one of the
 *  10 canonical category-color keys. Heuristic: lowercase contains-match
 *  on each known key. Stable hash fallback for unknown categories so the
 *  same category always gets the same color across renders. */
export function categoryColorKey(name: string | null | undefined): CatKey {
  if (!name) return 'uncategorized';
  const n = name.toLowerCase();
  for (const k of CAT_KEYS) {
    if (n.includes(k)) return k;
  }
  // Common synonyms the canonical-key match would miss.
  if (n.includes('rent') || n.includes('mortgage') || n.includes('electric') || n.includes('gas') || n.includes('water') || n.includes('internet') || n.includes('phone')) {
    return 'utilities';
  }
  if (n.includes('food') || n.includes('grocer')) return 'groceries';
  if (n.includes('eat') || n.includes('dining')) return 'restaurants';
  if (n.includes('car') || n.includes('auto') || n.includes('transp') || n.includes('uber') || n.includes('lyft')) {
    return 'transportation';
  }
  if (n.includes('amazon') || n.includes('shop') || n.includes('clothes')) {
    return 'shopping';
  }
  if (n.includes('movie') || n.includes('netflix') || n.includes('spotify') || n.includes('entertain')) {
    return 'entertainment';
  }
  if (n.includes('doctor') || n.includes('medical') || n.includes('health')) {
    return 'health';
  }
  if (n.includes('flight') || n.includes('hotel') || n.includes('travel') || n.includes('trip')) {
    return 'travel';
  }
  if (n.includes('income') || n.includes('salary') || n.includes('paycheck') || n.includes('bonus')) {
    return 'salary';
  }
  // Stable fallback: hash-mod into the non-uncategorized palette so the same
  // unknown name always gets the same color.
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  const palette: CatKey[] = [
    'shopping',
    'restaurants',
    'groceries',
    'transportation',
    'entertainment',
    'utilities',
    'health',
    'travel',
  ];
  return palette[h % palette.length];
}

/** Get the raw hex for a category name. Used by chart components that need
 *  to set fill/stroke directly (charts can't use Tailwind classes). */
export function categoryColorHex(name: string | null | undefined): string {
  return CAT_HEX[categoryColorKey(name)];
}

interface CategoryChipProps {
  /** Display label. Falls back to "Uncategorized" if null/empty. */
  name: string | null | undefined;
  /** Style: solid (tinted bg + text) or outline (border + text). */
  variant?: 'solid' | 'outline';
  /** Adds a small × button when set. */
  onRemove?: () => void;
  className?: string;
  children?: ReactNode;
}

export function CategoryChip({
  name,
  variant = 'solid',
  onRemove,
  className = '',
  children,
}: CategoryChipProps) {
  const hex = categoryColorHex(name);
  const label = children ?? name ?? 'Uncategorized';

  const styleSolid: React.CSSProperties = {
    backgroundColor: `${hex}1f`, // ~12% opacity tint
    color: hex,
    borderColor: `${hex}33`, // ~20% opacity border
  };
  const styleOutline: React.CSSProperties = {
    color: hex,
    borderColor: `${hex}66`,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={variant === 'solid' ? styleSolid : styleOutline}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: hex }}
      />
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 -mr-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-black/5"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
}
