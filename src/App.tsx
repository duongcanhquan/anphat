import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { WarehousePage } from '@/pages/WarehousePage'
import { SalesPage } from '@/pages/SalesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import type { ReactNode } from 'react'

function Protected({ children }: { children: ReactNode }) {
  const { firebaseUser, profile, loading } = useAuth()
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
  )
}
