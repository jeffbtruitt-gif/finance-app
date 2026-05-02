import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/api/auth';

interface NavItem {
  to: string;
  label: string;
  group?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/import', label: 'Import', group: 'Data' },
  { to: '/rules', label: 'Rules', group: 'Data' },
  { to: '/trips', label: 'Trips', group: 'Data' },
  { to: '/categories', label: 'Categories', group: 'Data' },
  { to: '/reports/one-month', label: '1 MO', group: 'Reports' },
  { to: '/reports/ytd', label: 'YTD', group: 'Reports' },
  { to: '/reports/detail', label: 'Single Detail', group: 'Reports' },
  { to: '/reports/averages', label: 'Averages', group: 'Reports' },
  { to: '/budget/2026', label: 'Budget', group: 'Planning' },
  { to: '/budget/2026/revise', label: 'Reforecast', group: 'Planning' },
  { to: '/balance-sheet', label: 'Balance Sheet', group: 'Planning' },
  { to: '/assumptions', label: 'Assumptions', group: 'Planning' },
  { to: '/retire', label: 'Retire', group: 'Long-term' },
  { to: '/college', label: 'College', group: 'Long-term' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  // Group nav items
  const groups = NAV_ITEMS.reduce<Record<string, NavItem[]>>((acc, item) => {
    const key = item.group ?? 'Main';
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
        <div className="px-4 py-4">
          <div className="text-sm font-bold tracking-tight text-slate-900">Truitt Family</div>
          <div className="text-xs text-slate-500">Finance</div>
        </div>
        <nav className="px-2 pb-4">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="mb-3">
              {group !== 'Main' && (
                <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group}
                </div>
              )}
              <ul>
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `block rounded px-2 py-1.5 text-sm ${
                          isActive
                            ? 'bg-slate-900 font-medium text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">{user?.email}</span>
            <button
              onClick={signOut}
              className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
