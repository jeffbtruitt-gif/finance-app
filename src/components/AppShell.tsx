/**
 * AppShell — sidebar + header chrome surrounding every route.
 *
 * Sidebar matches `Nav Panel.html`: Dashboard first with no group label; then groups
 * Budget Input → BS Input → Long Term → Budget Reports → BS Reports → Settings.
 * See `buildNavItems` for labels/routes.
 */

import { type ReactNode, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/api/auth';
import { useHousehold } from '@/api/household';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import { fetchTransactionCountSummary, type TransactionFilters } from '@/api/transactions';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { usePrivacyMode } from '@/lib/privacyModeContext';
import { shiftPeriod } from '@/lib/period';
import { getPageMeta } from '@/lib/routeMeta';
import { useReforecastDraftStatus } from '@/lib/useReforecastDraftStatus';
import { Button } from '@/components/ds';
import { AppShellNavIcon, type AppShellNavIconId } from '@/components/AppShellNavIcon';
import { skylinePalette } from '@/lib/skylinePalette';

/** Stable key for global uncategorized count in the sidebar (matches `fetchTransactionCountSummary`). */
const NAV_UNCATEGORIZED_SUMMARY_FILTERS: TransactionFilters = {};

const LOGO_SRC = `${import.meta.env.BASE_URL}truitt-finance-logo.png`;

interface NavItem {
  to: string;
  label: string;
  iconId: AppShellNavIconId;
  /** Omit for items shown above all groups (e.g. Dashboard). */
  group?: string;
  /** Optional ID used to attach dynamic indicators (e.g. unsaved-draft dots). */
  id?: string;
}

/** Must match `Nav Panel.html` groupOrder. */
const NAV_GROUP_ORDER = [
  'Budget Input',
  'BS Input',
  'Long Term',
  'Budget Reports',
  'BS Reports',
  'Settings',
] as const;

function buildNavItems(year: number): NavItem[] {
  return [
    { to: '/', label: 'Dashboard', iconId: 'dashboard' },
    { to: '/import', label: 'Import Data', iconId: 'import', group: 'Budget Input' },
    { to: '/review', label: 'Review', iconId: 'review', group: 'Budget Input', id: 'review' },
    {
      to: '/transactions',
      label: 'Create Rules',
      iconId: 'createrules',
      group: 'Budget Input',
      id: 'create-rules',
    },
    { to: '/rules/run', label: 'Run Rules', iconId: 'runrules', group: 'Budget Input' },
    { to: '/trips', label: 'Trips', iconId: 'trips', group: 'Budget Input' },
    { to: `/budget/${year}`, label: 'Budget', iconId: 'budget', group: 'Budget Input' },
    {
      to: `/budget/${year}/revise`,
      label: 'Reforecast',
      iconId: 'reforecast',
      group: 'Budget Input',
      id: 'reforecast',
    },
    { to: '/assumptions', label: 'Budget Assumptions', iconId: 'assumptions', group: 'Budget Input' },
    { to: '/bills', label: 'Bills', iconId: 'bills', group: 'Budget Input' },
    { to: '/balance-sheet', label: 'BS Accounts', iconId: 'bsaccounts', group: 'BS Input' },
    { to: '/balance-sheet/allocation', label: 'BS Allocation', iconId: 'bsallocation', group: 'BS Input' },
    { to: '/balance-sheet/performance', label: 'Performance', iconId: 'performance', group: 'BS Input' },
    { to: '/retire', label: 'Retirement', iconId: 'retire', group: 'Long Term' },
    { to: '/college', label: 'College', iconId: 'college', group: 'Long Term' },
    { to: '/reports', label: '1 MO', iconId: '1mo', group: 'Budget Reports' },
    { to: '/reports/ytd', label: 'YTD', iconId: 'ytd', group: 'Budget Reports' },
    { to: '/reports/averages', label: 'Averages', iconId: 'averages', group: 'Budget Reports' },
    { to: '/reports/detail', label: 'Single Detail', iconId: 'singledetail', group: 'Budget Reports' },
    {
      to: '/reports/transactions',
      label: 'Transactions',
      iconId: 'reporttx',
      group: 'Budget Reports',
    },
    {
      to: '/reports/budget-matrix',
      label: 'Budget Matrix',
      iconId: 'averages',
      group: 'Budget Reports',
    },
    { to: '/reports/balance-sheet', label: 'BS Report', iconId: 'bsreport', group: 'BS Reports' },
    { to: '/categories', label: 'Categories', iconId: 'categories', group: 'Settings' },
    { to: '/rules', label: 'Manage Rules', iconId: 'managerules', group: 'Settings' },
    { to: '/settings/accounts', label: 'Manage Accounts', iconId: 'manageaccounts', group: 'Settings' },
  ];
}

const NAV_ITEM_BASE: React.CSSProperties = {
  fontFamily: 'Figtree, Inter, system-ui, sans-serif',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 8px 5px 11px',
  margin: '0 7px 1px',
  borderRadius: 6,
  textDecoration: 'none',
  transition: 'background-color 0.12s, color 0.12s',
};

const NAV_ITEM_DEFAULT: React.CSSProperties = {
  ...NAV_ITEM_BASE,
  color: skylinePalette.DEFAULT,
  fontWeight: 500,
};

const NAV_ITEM_ACTIVE: React.CSSProperties = {
  ...NAV_ITEM_BASE,
  color: 'rgb(26 39 68)', // navy-800 — active label
  fontWeight: 600,
  backgroundColor: 'rgb(232 236 245)', // navy-100
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const household = useHousehold();
  const { period, setYearMonth } = useAppPeriod();
  const { hideIncomeAssets, setHideIncomeAssets } = usePrivacyMode();
  const location = useLocation();
  const pageMeta = useMemo(
    () => getPageMeta(location.pathname, period),
    [location.pathname, period.year, period.month],
  );
  const NAV_ITEMS = useMemo(() => buildNavItems(period.year), [period.year]);
  const { hasDrafts: reforecastHasDrafts } = useReforecastDraftStatus();

  const schemeQuery = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });
  const schemeId = schemeQuery.data;
  const uncategorizedSummaryQ = useQuery({
    queryKey: ['transactions', '__summary', NAV_UNCATEGORIZED_SUMMARY_FILTERS, schemeId],
    enabled: !!schemeId,
    queryFn: () =>
      fetchTransactionCountSummary({
        filters: NAV_UNCATEGORIZED_SUMMARY_FILTERS,
        schemeId: schemeId!,
      }),
  });
  const createRulesUncategorizedCount = useMemo(() => {
    if (!uncategorizedSummaryQ.isSuccess) return null;
    const n = uncategorizedSummaryQ.data.uncategorized;
    return n > 0 ? n : null;
  }, [uncategorizedSummaryQ.isSuccess, uncategorizedSummaryQ.data?.uncategorized]);

  const labelForNavItem = (item: NavItem) => {
    if (item.id === 'review' && createRulesUncategorizedCount != null) {
      return `Review (${createRulesUncategorizedCount})`;
    }
    if (item.id === 'create-rules' && createRulesUncategorizedCount != null) {
      return `Create Rules (${createRulesUncategorizedCount})`;
    }
    return item.label;
  };
  /** Unified monthly report uses full-bleed layout; shell header still shows title + period. */
  const reportsFullBleed = location.pathname === '/reports';

  const monthInputValue = `${period.year}-${String(period.month).padStart(2, '0')}`;

  const navUngrouped = NAV_ITEMS.filter((i) => !i.group);
  const navByGroup = NAV_GROUP_ORDER.map((g) => ({
    group: g,
    items: NAV_ITEMS.filter((i) => i.group === g),
  })).filter((b) => b.items.length > 0);

  return (
    <div className="flex h-screen min-h-0 bg-navy-50">
      <aside
        className="shrink-0 border-r border-navy-100 bg-white shadow-sm"
        style={{
          width: 228,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo — fixed at top center while nav scrolls */}
        <div
          className="flex justify-center bg-white px-2 py-1"
          style={{ flexShrink: 0 }}
        >
          <img
            src={LOGO_SRC}
            alt="Truitt Finance"
            className="h-auto w-full max-w-[112px] object-contain select-none"
            draggable={false}
          />
        </div>

        {/* Nav — scrolls independently when items overflow */}
        <nav
          className="app-shell-sidebar-nav pt-1 pb-2"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
        >
          {navUngrouped.map((item) => {
            const showReforecastDot = item.id === 'reforecast' && reforecastHasDrafts;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={() => 'app-shell-nav-link'}
                style={({ isActive }) => (isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_DEFAULT)}
                onMouseDown={(e) => {
                  if (e.button === 0) e.preventDefault();
                }}
                onClick={(e) => {
                  if (e.detail > 0) {
                    (e.currentTarget as HTMLAnchorElement).blur();
                  }
                }}
              >
                {({ isActive }) => (
                  <NavRow
                    iconId={item.iconId}
                    isActive={isActive}
                    label={labelForNavItem(item)}
                    showDot={showReforecastDot}
                  />
                )}
              </NavLink>
            );
          })}
          {navByGroup.map(({ group, items }) => (
            <div key={group} style={{ marginTop: 9 }}>
              <div className="ds-nav-group">{group}</div>
              {items.map((item) => {
                const showReforecastDot = item.id === 'reforecast' && reforecastHasDrafts;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    className={() => 'app-shell-nav-link'}
                    style={({ isActive }) => (isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_DEFAULT)}
                    onMouseDown={(e) => {
                      if (e.button === 0) e.preventDefault();
                    }}
                    onClick={(e) => {
                      if (e.detail > 0) {
                        (e.currentTarget as HTMLAnchorElement).blur();
                      }
                    }}
                  >
                    {({ isActive }) => (
                      <NavRow
                        iconId={item.iconId}
                        isActive={isActive}
                        label={labelForNavItem(item)}
                        showDot={showReforecastDot}
                      />
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 shrink-0 border-b border-navy-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 px-3 py-4 md:px-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="mt-0.5 w-1 self-stretch rounded-full bg-gold-500" aria-hidden />
              <div className="min-w-0">
                <h1 className="text-h1 font-bold tracking-tight text-navy-900">{pageMeta.title}</h1>
                {pageMeta.description ? (
                  <p className="mt-1 max-w-3xl text-body-base text-gray-500">{pageMeta.description}</p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-end justify-end gap-3 md:gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Period
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-300"
                    aria-label="Previous month"
                    title="Previous month"
                    onClick={() => {
                      const p = shiftPeriod(period, -1);
                      setYearMonth(p.year, p.month);
                    }}
                  >
                    <ChevronLeftIcon />
                  </button>
                  <input
                    type="month"
                    value={monthInputValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const [y, m] = v.split('-').map(Number);
                      if (!Number.isFinite(y) || !Number.isFinite(m)) return;
                      setYearMonth(y, m);
                    }}
                    className="min-w-[10rem] rounded-md border border-navy-200 bg-white px-3 py-1.5 text-sm font-semibold tabular-nums text-navy-800 shadow-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
                    aria-label="Reporting month"
                  />
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-300"
                    aria-label="Next month"
                    title="Next month"
                    onClick={() => {
                      const p = shiftPeriod(period, 1);
                      setYearMonth(p.year, p.month);
                    }}
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              </label>
              <div className="hidden h-10 w-px shrink-0 bg-navy-100 sm:block" aria-hidden />
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="max-w-[180px] truncate text-gray-600" title={user?.email}>
                    {user?.email}
                  </span>
                  <Button variant="secondary" size="sm" onClick={signOut}>
                    Sign out
                  </Button>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="max-w-[14rem] text-right text-sm leading-snug text-gray-500">
                    Hide assets / income
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hideIncomeAssets}
                    aria-label="Hide asset, net worth, and income amounts"
                    title="Mask sensitive dollar amounts as $- (spending still visible)"
                    onClick={() => setHideIncomeAssets(!hideIncomeAssets)}
                    className={`relative inline-flex h-[21px] w-9 shrink-0 cursor-pointer rounded-full border border-navy-200 transition-colors focus:outline-none focus:ring-2 focus:ring-navy-300 ${
                      hideIncomeAssets ? 'bg-navy-700' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-[18px] w-[18px] translate-y-px transform rounded-full bg-white shadow transition ${
                        hideIncomeAssets ? 'translate-x-[14px]' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>
        <div
          className={`min-h-0 flex-1 overflow-y-auto ${reportsFullBleed ? 'p-0' : 'py-6 px-3 md:px-4'}`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Track active state via a `data-active` attribute on the anchor so the
 * onMouseEnter/Leave handlers can skip applying hover styles to the active
 * item (the active background should win over hover).
 */
function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function NavRow({
  iconId,
  isActive,
  label,
  showDot,
}: {
  iconId: AppShellNavIconId;
  isActive: boolean;
  label: string;
  showDot: boolean;
}) {
  return (
    <span
      data-active={isActive ? 'true' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flex: 1,
        gap: 8,
        minWidth: 0,
      }}
      ref={(el) => {
        if (!el) return;
        const parent = el.parentElement;
        if (parent) {
          if (isActive) parent.dataset.active = 'true';
          else delete parent.dataset.active;
        }
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          flex: 1,
        }}
      >
        <AppShellNavIcon id={iconId} active={isActive} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </span>
      {showDot ? (
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            flexShrink: 0,
            borderRadius: 9999,
            backgroundColor: 'rgb(201 168 76)', // gold-500
          }}
          title="Unsaved Reforecast edits"
          aria-label="Unsaved Reforecast edits"
        />
      ) : null}
    </span>
  );
}
