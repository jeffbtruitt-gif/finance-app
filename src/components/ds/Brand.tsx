/**
 * Brand mark — the Truitt Finance lockup used in the sidebar header and on
 * auth pages. Built per the design system spec:
 *
 *   - 30×30 navy-800 rounded square badge with a gold clock-hand glyph
 *   - "Truitt Family" wordmark (13px / 700 / navy-800)
 *   - "FINANCE" subline (10px / 500 / gold-500 / 0.18em uppercase)
 *
 * `size` scales the whole lockup proportionally for use on auth pages.
 */

interface BrandProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CONFIG = {
  sm: { badge: 30, badgeRadius: 8, word: 13, sub: 10, gap: 8 },
  md: { badge: 48, badgeRadius: 12, word: 22, sub: 14, gap: 12 },
  lg: { badge: 72, badgeRadius: 16, word: 32, sub: 20, gap: 16 },
} as const;

export function Brand({ size = 'sm', className = '' }: BrandProps) {
  const c = SIZE_CONFIG[size];
  return (
    <div
      className={`flex items-center ${className}`}
      style={{ gap: c.gap }}
    >
      <div
        className="flex shrink-0 items-center justify-center bg-navy-800"
        style={{ width: c.badge, height: c.badge, borderRadius: c.badgeRadius }}
        aria-hidden
      >
        <ClockMark size={Math.round(c.badge * 0.62)} />
      </div>
      <div className="flex flex-col leading-none">
        <div
          className="text-navy-800"
          style={{
            fontFamily: 'Figtree, Inter, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: c.word,
            letterSpacing: '-0.01em',
          }}
        >
          Truitt Family
        </div>
        <div
          className="text-gold-500"
          style={{
            fontFamily: 'Figtree, Inter, system-ui, sans-serif',
            fontWeight: 500,
            fontSize: c.sub,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginTop: 2,
          }}
        >
          Finance
        </div>
      </div>
    </div>
  );
}

/** Minimalist gold clock-hand glyph used inside the badge. */
function ClockMark({ size }: { size: number }) {
  const stroke = Math.max(1.5, size / 12);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#c9a84c"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7 L12 12 L16 14" />
    </svg>
  );
}
