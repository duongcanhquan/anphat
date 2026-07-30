import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/AppLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Button } from '@/components/ui'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { WarehousePage } from '@/pages/WarehousePage'
import { SalesPage } from '@/pages/SalesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import type { ReactNode } from 'react'

function Protected({ children }: { children: ReactNode }) {
  const { firebaseUser, profile, loading, authError, logout } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="bento px-8 py-6 text-center">
          <p className="font-display text-xl font-bold">AN PHÁT</p>
          <p className="mt-2 text-sm text-muted animate-soft-pulse">Đang tải…</p>
        </div>
      </div>
    )
  }
  if (firebaseUser && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="bento max-w-md space-y-3 p-6 text-center">
          <p className="font-display text-xl font-bold">Không tải được hồ sơ</p>
          <p className="text-sm text-muted">
            {authError ||
              'Kiểm tra Firestore Rules đã deploy và Authentication Email/Password đã bật.'}
          </p>
          <Button
            className="w-full"
            variant="outline"
            onClick={async () => {
              await logout()
              window.location.assign('/dang-nhap')
            }}
          >
            Đăng xuất và thử lại
          </Button>
        </div>
      </div>
    )
  }
  if (!firebaseUser || !profile) return <Navigate to="/dang-nhap" replace />
  if (!profile.active) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="bento max-w-md p-6 text-center">
          <p className="font-semibold text-danger">Tài khoản đã bị khoá</p>
          <p className="mt-2 text-sm text-muted">Liên hệ Superadmin để mở lại.</p>
        </div>
      </div>
    )
  }
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/dang-nhap" element={<LoginPage />} />
            <Route
              element={
                <Protected>
                  <AppLayout />
                </Protected>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/ban-hang" element={<SalesPage />} />
              <Route path="/kho" element={<WarehousePage />} />
              <Route path="/tong-ket" element={<ReportsPage />} />
              <Route path="/cai-dat" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
