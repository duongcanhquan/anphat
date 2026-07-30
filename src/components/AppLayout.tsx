import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Settings,
  ShoppingCart,
  BarChart3,
  LogOut,
  Warehouse,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Logo } from './Logo'
import { cn } from '@/lib/utils'
import { Badge, Button } from './ui'

const nav = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/ban-hang', label: 'Bán hàng', icon: ShoppingCart },
  { to: '/kho', label: 'Kho', icon: Warehouse },
  { to: '/tong-ket', label: 'Tổng kết', icon: BarChart3 },
  { to: '/cai-dat', label: 'Cài đặt', icon: Settings },
]

const roleLabel = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  viewer: 'Viewer',
}

export function AppLayout() {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/dang-nhap')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line/60 bg-ink p-5 text-surface lg:flex">
        <Logo light />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition',
                  isActive ? 'bg-accent text-white' : 'text-surface/70 hover:bg-white/10 hover:text-surface',
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
          <div>
            <p className="font-semibold">{profile?.displayName}</p>
            <p className="text-xs text-surface/60">{profile?.email}</p>
            <div className="mt-2">
              <Badge tone="accent">{roleLabel[profile?.role || 'viewer']}</Badge>
            </div>
          </div>
          <Button variant="outline" className="w-full border-white/20 bg-transparent text-surface" onClick={handleLogout}>
            <LogOut size={16} /> Đăng xuất
          </Button>
        </div>
      </aside>

      {/* Mobile top */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line/70 bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo size="sm" />
        <button
          type="button"
          className="rounded-xl bg-surface-2 p-2"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-[80%] max-w-xs flex-col bg-ink p-5 text-surface animate-fade-up">
            <Logo light size="sm" />
            <nav className="mt-6 flex flex-col gap-1">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold',
                      isActive ? 'bg-accent text-white' : 'text-surface/70',
                    )
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto space-y-3">
              <p className="text-sm font-semibold">{profile?.displayName}</p>
              <Badge tone="accent">{roleLabel[profile?.role || 'viewer']}</Badge>
              <Button variant="outline" className="w-full border-white/20 bg-transparent text-surface" onClick={handleLogout}>
                <LogOut size={16} /> Đăng xuất
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 safe-bottom">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="sticky bottom-0 z-40 grid grid-cols-5 gap-1 border-t border-line/70 bg-card/95 px-2 py-2 backdrop-blur safe-bottom lg:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold',
                isActive ? 'bg-accent-soft text-accent' : 'text-muted',
              )
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
