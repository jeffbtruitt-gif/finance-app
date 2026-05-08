/**
 * Sidebar nav glyphs — ported from Nav Panel.html (18×18 viewBox, 16×16 output).
 */

import type { ReactNode } from 'react';
import { skylinePalette } from '@/lib/skylinePalette';

export type AppShellNavIconId =
  | 'dashboard'
  | 'import'
  | 'createrules'
  | 'runrules'
  | 'trips'
  | 'budget'
  | 'reforecast'
  | 'assumptions'
  | 'bsaccounts'
  | 'retire'
  | 'college'
  | '1mo'
  | 'ytd'
  | 'singledetail'
  | 'reporttx'
  | 'averages'
  | 'bsreport'
  | 'bills'
  | 'categories'
  | 'managerules'
  | 'bsallocation'
  | 'performance'
  | 'manageaccounts';

const NAVY_ACTIVE = '#243460'; // navy-700
const SKYLINE_IDLE = skylinePalette.DEFAULT;
const WHITE = '#ffffff';

export function AppShellNavIcon({
  id,
  active,
}: {
  id: AppShellNavIconId;
  active: boolean;
}) {
  const s = active ? NAVY_ACTIVE : SKYLINE_IDLE;
  const sw = 1.5;

  const icons: Record<AppShellNavIconId, ReactNode> = {
    dashboard: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2" y="2" width="6" height="6" rx="1.2" stroke={s} strokeWidth={sw} />
        <rect x="10" y="2" width="6" height="6" rx="1.2" stroke={s} strokeWidth={sw} />
        <rect x="2" y="10" width="6" height="6" rx="1.2" stroke={s} strokeWidth={sw} />
        <rect x="10" y="10" width="6" height="6" rx="1.2" stroke={s} strokeWidth={sw} />
      </svg>
    ),
    import: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M9 2.5v9M5.5 8L9 11.5 12.5 8"
          stroke={s}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M3 15h12" stroke={s} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    ),
    createrules: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M3 5h7M14 5h1M3 9h2M9 9h6M3 13h9M16 13h-1" stroke={s} strokeWidth={sw} strokeLinecap="round" />
        <circle cx="12" cy="5" r="1.6" stroke={s} strokeWidth={sw} fill={WHITE} />
        <circle cx="7" cy="9" r="1.6" stroke={s} strokeWidth={sw} fill={WHITE} />
        <circle cx="14" cy="13" r="1.6" stroke={s} strokeWidth={sw} fill={WHITE} />
      </svg>
    ),
    runrules: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M3 5h6M3 9h5M3 13h7" stroke={s} strokeWidth={sw} strokeLinecap="round" />
        <path
          d="M11 5.5l4 2.5-4 2.5v-5z"
          stroke={s}
          strokeWidth={sw}
          strokeLinejoin="round"
          fill={WHITE}
        />
      </svg>
    ),
    trips: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M9 2.5c-2.5 0-4.5 2-4.5 4.5 0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5c0-2.5-2-4.5-4.5-4.5z"
          stroke={s}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <circle cx="9" cy="7" r="1.5" stroke={s} strokeWidth={sw} />
      </svg>
    ),
    budget: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2.5" y="2.5" width="13" height="13" rx="1.6" stroke={s} strokeWidth={sw} />
        <path d="M9 6v6M6 9h6" stroke={s} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    ),
    reforecast: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M2.5 12.5L6 9l3 2 5.5-6" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    assumptions: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <circle cx="9" cy="9" r="6.5" stroke={s} strokeWidth={sw} />
        <path d="M9 5.5V9l2.5 2" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    bsaccounts: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2.5" y="3" width="13" height="3.5" rx="0.8" stroke={s} strokeWidth={sw} />
        <rect x="2.5" y="7.5" width="13" height="3.5" rx="0.8" stroke={s} strokeWidth={sw} />
        <rect x="2.5" y="12" width="13" height="3.5" rx="0.8" stroke={s} strokeWidth={sw} />
      </svg>
    ),
    bsallocation: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <circle cx="9" cy="9" r="6.5" stroke={s} strokeWidth={sw} />
        <path d="M9 2.5V9h6.5" stroke={s} strokeWidth={sw} strokeLinecap="round" />
        <path d="M9 9L4.5 13.5" stroke={s} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    ),
    performance: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M2.5 14.5L6.5 8l3 4 5.5-9" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12.5 3H15.5V6" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    retire: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M3 8.5L9 3l6 5.5V15a1 1 0 01-1 1h-2.5v-4h-3v4H4a1 1 0 01-1-1V8.5z"
          stroke={s}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </svg>
    ),
    college: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M9 2.5l5.5 3v6L9 14.5l-5.5-3v-6L9 2.5z" stroke={s} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M6.5 9L9 10.2 11.5 9" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '1mo': (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2.5" y="3.5" width="13" height="12" rx="1.6" stroke={s} strokeWidth={sw} />
        <path d="M6 2v3M12 2v3M2.5 7.5h13" stroke={s} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    ),
    ytd: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M2.5 13L6 8l3 3.5 2.5-4.5L15.5 11" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    singledetail: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <circle cx="9" cy="9" r="6.5" stroke={s} strokeWidth={sw} />
        <path d="M9 8.5v4" stroke={s} strokeWidth={sw} strokeLinecap="round" />
        <circle cx="9" cy="6" r="0.7" fill={s} />
      </svg>
    ),
    reporttx: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M3.5 5h11M3.5 9h11M3.5 13h7" stroke={s} strokeWidth={sw} strokeLinecap="round" />
        <path d="M13 11.5l2.5 1.5v-4L13 10.5" stroke={s} strokeWidth={sw} strokeLinejoin="round" />
      </svg>
    ),
    averages: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M2.5 11L5.5 8.5l2.5 1.5 3-4 4.5 4" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 5.5h3v3" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    bsreport: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M4 2h7l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"
          stroke={s}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <path d="M11 2v3h3" stroke={s} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M5.5 12L7.5 10l1.5 1.5L11.5 9" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    bills: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M4 2h10a1 1 0 011 1v12l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L3 15V3a1 1 0 011-1z"
          stroke={s}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <path d="M6 6h6M6 9h4" stroke={s} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    ),
    categories: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="0.8" stroke={s} strokeWidth={sw} />
        <rect x="10" y="2.5" width="5.5" height="5.5" rx="0.8" stroke={s} strokeWidth={sw} />
        <rect x="2.5" y="10" width="5.5" height="5.5" rx="0.8" stroke={s} strokeWidth={sw} />
        <rect x="10" y="10" width="5.5" height="5.5" rx="0.8" stroke={s} strokeWidth={sw} />
      </svg>
    ),
    managerules: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M9 2.5l1.2 1.5 1.9-.4.5 1.9 1.6 1L13.5 8l1 1.5-1.6 1-.5 1.9-1.9-.4L9 13.5 7.8 12l-1.9.4-.5-1.9-1.6-1L4.5 8 3.5 6.5l1.6-1 .5-1.9 1.9.4L9 2.5z"
          stroke={s}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <circle cx="9" cy="8" r="1.8" stroke={s} strokeWidth={sw} />
      </svg>
    ),
    manageaccounts: (
      <svg width={16} height={16} viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2.5" y="3" width="13" height="3.5" rx="0.8" stroke={s} strokeWidth={sw} />
        <rect x="2.5" y="7.5" width="13" height="3.5" rx="0.8" stroke={s} strokeWidth={sw} />
        <circle cx="14" cy="14" r="2.5" stroke={s} strokeWidth={sw} fill={WHITE} />
        <path d="M14 12.8v2.4M12.8 14h2.4" stroke={s} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    ),
  };

  return <span className="inline-flex shrink-0">{icons[id]}</span>;
}
