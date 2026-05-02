import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/api/auth';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { AppShell } from '@/components/AppShell';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { TransactionsPage } from '@/pages/transactions/TransactionsPage';
import { Placeholder } from '@/pages/placeholders/Placeholder';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
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
              <AppShell>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/transactions" element={<TransactionsPage />} />
                  <Route path="/import" element={<Placeholder title="Import" phase={2} />} />
                  <Route path="/rules" element={<Placeholder title="Rules" phase={2} />} />
                  <Route path="/trips" element={<Placeholder title="Trips" phase={2} />} />
                  <Route path="/categories" element={<Placeholder title="Categories" phase={2} />} />
                  <Route path="/balance-sheet" element={<Placeholder title="Balance Sheet" phase={5} />} />
                  <Route path="/assumptions" element={<Placeholder title="Assumptions" phase={6} />} />
                  <Route path="/budget/:year" element={<Placeholder title="Budget Editor" phase={3} />} />
                  <Route path="/budget/:year/revise" element={<Placeholder title="Reforecast" phase={4} />} />
                  <Route path="/reports/one-month" element={<Placeholder title="1 MO Report" phase={3} />} />
                  <Route path="/reports/ytd" element={<Placeholder title="YTD Report" phase={3} />} />
                  <Route path="/reports/detail" element={<Placeholder title="Single Detail Report" phase={3} />} />
                  <Route path="/reports/averages" element={<Placeholder title="Averages Report" phase={3} />} />
                  <Route path="/retire" element={<Placeholder title="Retirement" phase={7} />} />
                  <Route path="/college" element={<Placeholder title="College" phase={7} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
