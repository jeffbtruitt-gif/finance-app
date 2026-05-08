import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/api/auth';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { AppShell } from '@/components/AppShell';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { TransactionsPage } from '@/pages/transactions/TransactionsPage';
import { TripsPage } from '@/pages/trips/TripsPage';
import { CategoriesPage } from '@/pages/categories/CategoriesPage';
import { ImportPage } from './pages/ImportPage';
import { RulesPage } from './pages/rules/RulesPage';
import { RuleBuilderPage } from './pages/RuleBuilderPage';
import { RunRulesPage } from './pages/rules/RunRulesPage';
import { OneMonthReportPage } from './pages/reports/OneMonthReportPage';
import { YtdReportPage } from './pages/reports/YtdReportPage';
import { AveragesReportPage } from './pages/reports/AveragesReportPage';
import { BalanceSheetReportPage } from './pages/reports/BalanceSheetReportPage';
import { SingleDetailReportPage } from './pages/reports/SingleDetailReportPage';
import { BudgetReportTransactionsPage } from './pages/reports/BudgetReportTransactionsPage';
import { BudgetReportMatrixPage } from './pages/reports/BudgetReportMatrixPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { BudgetEditorPage } from './pages/budget/BudgetEditorPage';
import { ReforecastPage } from './pages/budget/ReforecastPage';
import { BalanceSheetPage } from './pages/balance-sheet/BalanceSheetPage';
import { AssumptionsPage } from './pages/assumptions/AssumptionsPage';
import { BillsPage } from './pages/bills/BillsPage';
import { ManageAccountsPage } from './pages/settings/ManageAccountsPage';
import { BsAllocationPage } from './pages/balance-sheet/BsAllocationPage';
import { PerformancePage } from './pages/performance/PerformancePage';
import { RetirePage } from './pages/retire/RetirePage';
import { CollegePage } from './pages/college/CollegePage';
import { AppPeriodProvider } from '@/lib/appPeriodContext';
import { PrivacyModeProvider } from '@/lib/privacyModeContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppPeriodProvider>
                <PrivacyModeProvider>
                <AppShell>
                  <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/transactions" element={<TransactionsPage />} />
                  <Route path="/trips" element={<TripsPage />} />
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/balance-sheet" element={<BalanceSheetPage />} />
                  <Route path="/balance-sheet/allocation" element={<BsAllocationPage />} />
                  <Route path="/balance-sheet/performance" element={<PerformancePage />} />
                  <Route path="/assumptions" element={<AssumptionsPage />} />
                  <Route path="/assumptions/:year" element={<AssumptionsPage />} />
                  <Route path="/bills" element={<BillsPage />} />
                  <Route path="/budget/:year" element={<BudgetEditorPage />} />
                  <Route path="/budget/:year/revise" element={<ReforecastPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/reports/one-month" element={<OneMonthReportPage />} />
                  <Route path="/reports/ytd" element={<YtdReportPage />} />
                  <Route path="/reports/detail" element={<SingleDetailReportPage />} />
                  <Route path="/reports/transactions" element={<BudgetReportTransactionsPage />} />
                  <Route path="/reports/budget-matrix" element={<BudgetReportMatrixPage />} />
                  <Route path="/reports/averages" element={<AveragesReportPage />} />
                  <Route path="/reports/balance-sheet" element={<BalanceSheetReportPage />} />
                  <Route path="/retire" element={<RetirePage />} />
                  <Route path="/college" element={<CollegePage />} />
                  <Route path="/import" element={<ImportPage />} />
                  <Route path="/rules" element={<RulesPage />} />
                  <Route path="/rules/run" element={<RunRulesPage />} />
                  <Route path="/rules/new" element={<RuleBuilderPage />} />
                  <Route path="/rules/:id" element={<RuleBuilderPage />} />
                  <Route path="/settings/accounts" element={<ManageAccountsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppShell>
                </PrivacyModeProvider>
              </AppPeriodProvider>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
