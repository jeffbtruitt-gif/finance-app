import type { Config } from 'tailwindcss';
import { skylinePalette } from './src/lib/skylinePalette';

/**
 * Truitt Finance Design System tokens — v1.0 (May 2026).
 *
 * Maps the design-system PDF directly into Tailwind so every page/component
 * can reference brand tokens (`bg-navy-800`, `text-gold-500`, `rounded-md`,
 * `shadow-sm`, etc.) instead of one-off hex codes.
 *
 * Conventions:
 *   - `navy` is the primary brand color. Use `navy-800` for headers / sidebar
 *     backgrounds, `navy-700` for hover, `navy-50/100` for tinted surfaces.
 *   - `gold` is the accent. Use sparingly: brand mark, focus rings, the
 *     occasional KPI highlight. NOT a positive/negative semantic color.
 *   - `gray` is the neutral scale. Replaces ad-hoc `slate-*` usage on net-new
 *     surfaces (existing `slate-*` usages remain valid — slate maps closely
 *     enough to the gray scale that we don't need to mass-rename).
 *   - `pos` / `neg` / `warn` / `info` are the semantic tokens — map to the
 *     PDF's positive/negative/warning/info swatches.
 *   - `cat-*` are the category-color palette from the PDF's "Category Colors"
 *     row, used by category chips and chart segments.
 *
 * Spacing / radius / shadow tokens map to the PDF's spacing scale, radius
 * scale, and shadow scale. Tailwind already ships `space-1`..`space-16` via
 * the default spacing scale and they happen to match the PDF (4 / 8 / 12 /
 * 16 / 20 / 24 / 32 / 40 / 48 / 64). We add the named radius tokens that
 * differ from Tailwind defaults (`md` → 6 instead of 6, `lg` → 10 instead of
 * 8, `xl` → 14 instead of 12).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Safelist guarantees these design-system semantic classes are always
  // emitted, even if Tailwind's content scanner misses them inside ternary
  // class strings (a real edge case we hit with `bg-info-soft` inside the
  // sidebar NavLink). Cheap to keep — adds <1KB to the CSS bundle.
  safelist: [
    'bg-pos-soft', 'bg-neg-soft', 'bg-warn-soft', 'bg-info-soft',
    'text-pos', 'text-neg', 'text-warn', 'text-info',
    'border-pos', 'border-neg', 'border-warn', 'border-info',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Figtree', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Custom scale per design system PDF section 03 (Typography).
        // Tailwind keeps its defaults; we ADD these named sizes so component
        // code can self-document ("text-display", "text-label").
        display: ['36px', { lineHeight: '1.15', fontWeight: '800', letterSpacing: '-0.02em' }],
        h1: ['28px', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.015em' }],
        h2: ['22px', { lineHeight: '1.25', fontWeight: '700', letterSpacing: '-0.01em' }],
        h3: ['18px', { lineHeight: '1.3', fontWeight: '600' }],
        h4: ['16px', { lineHeight: '1.35', fontWeight: '600' }],
        'body-md': ['15px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-base': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        label: ['12px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '0.06em' }],
        caption: ['11px', { lineHeight: '1.3', fontWeight: '400' }],
      },
      colors: {
        navy: {
          50: '#f4f5fb',
          100: '#e8ecf5',
          200: '#bfcae3',
          300: '#8fa1cc',
          400: '#6278b8',
          500: '#3b559a',
          600: '#2e437d',
          700: '#243460',
          800: '#1a2744',
          900: '#0d1527',
        },
        /** Logo skyline hue — sidebar nav labels (`DEFAULT`), section titles (`deep`). */
        skyline: skylinePalette,
        gold: {
          100: '#faf4e4',
          300: '#e8d09d',
          400: '#d9bc74',
          500: '#c9a84c',
          600: '#a07830',
        },
        // Renamed Tailwind's default `gray` to match the design system PDF
        // hex codes exactly. Slate-shaped values, slightly cooler.
        gray: {
          50: '#f7f8fa',
          100: '#f0f2f6',
          200: '#e2e5ec',
          300: '#c5cad4',
          400: '#9aa0af',
          500: '#717889',
          600: '#545b6e',
          700: '#3a3f4d',
          800: '#22252e',
          900: '#111318',
        },
        // Semantic tokens — DEFAULT is the bold shade (text/borders/icons),
        // `soft` is the tint (backgrounds/chips). Nesting under the parent
        // key (vs a hyphenated top-level key like `'info-soft'`) is required
        // for Tailwind's JIT to reliably emit `bg-info-soft`, `text-pos`,
        // etc. — top-level hyphenated names are treated ambiguously.
        pos: { DEFAULT: '#1e7e5a', soft: '#e6f3ed' },
        neg: { DEFAULT: '#c0392b', soft: '#fbeae7' },
        warn: { DEFAULT: '#d97706', soft: '#fdf3e2' },
        info: { DEFAULT: '#2563eb', soft: '#cfdcf2' },
        // Category palette — used by CategoryChip and chart segments.
        // Each token is `cat-<name>` for direct use as `bg-cat-shopping`,
        // `text-cat-shopping`, etc. Color values chosen to read as distinct
        // hues at small chip sizes while staying within the navy/gold
        // tonality of the brand.
        cat: {
          shopping: '#9b6dd1',      // violet
          restaurants: '#e08750',   // orange
          groceries: '#3a9e6f',     // green
          transportation: '#3884c2', // blue
          entertainment: '#d4517f', // pink
          utilities: '#7a8aa8',     // slate-blue
          health: '#22a39f',        // teal
          travel: '#c98c3b',        // gold-orange
          salary: '#1e7e5a',        // positive green
          uncategorized: '#9aa0af', // gray-400
        },
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '10px',
        xl: '14px',
        '2xl': '20px',
        full: '9999px',
      },
      boxShadow: {
        // Layered, subtle. Matches PDF section 04 shadows row.
        xs: '0 1px 1px rgba(13, 21, 39, 0.04)',
        sm: '0 1px 2px rgba(13, 21, 39, 0.06), 0 1px 3px rgba(13, 21, 39, 0.04)',
        md: '0 2px 4px rgba(13, 21, 39, 0.06), 0 4px 8px rgba(13, 21, 39, 0.05)',
        lg: '0 4px 8px rgba(13, 21, 39, 0.07), 0 12px 24px rgba(13, 21, 39, 0.06)',
        xl: '0 12px 32px rgba(13, 21, 39, 0.10), 0 24px 48px rgba(13, 21, 39, 0.08)',
        // Inset focus ring used on form controls — gold tint.
        'ring-gold': '0 0 0 3px rgba(201, 168, 76, 0.30)',
      },
    },
  },
  plugins: [],
} satisfies Config;
