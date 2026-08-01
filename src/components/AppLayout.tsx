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

const fullNav = [
  { to: '/', label: 'Tổng quan', short: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/ban-hang', label: 'Bán hàng', short: 'Bán hàng', icon: ShoppingCart },
  { to: '/kho', label: 'Kho', short: 'Kho', icon: Warehouse },
  { to: '/tong-ket', label: 'Tổng kết', short: 'Tổng kết', icon: BarChart3 },
  { to: '/cai-dat', label: 'Cài đặt', short: 'Cài đặt', icon: Settings },
]

/** Viewer chỉ kiểm soát — 3 màn hình: Tổng quan, Đơn hàng, Kho */
const viewerNav = [
  { to: '/', label: 'Tổng quan', short: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/ban-hang', label: 'Đơn hàng', short: 'Đơn hàng', icon: ShoppingCart },
  { to: '/kho', label: 'Kho', short: 'Kho', icon: Warehouse },
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
  const nav = profile?.role === 'viewer' ? viewerNav : fullNav

  const handleLogout = async () => {
    await logout()
    navigate('/dang-nhap')
  }

  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row">
      {/* Desktop / iPad landscape sidebar — full height, sticky */}
      <aside className="sticky top-0 z-30 hidden h-dvh w-64 shrink-0 flex-col border-r border-line/60 bg-ink p-5 text-surface lg:flex">
        <Logo light />
        <nav className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">
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
            <p className="break-words font-semibold">{profile?.displayName}</p>
            <p className="break-all text-xs text-surface/60">{profile?.email}</p>
            <div className="mt-2">
              <Badge tone="accent">{roleLabel[profile?.role || 'viewer']}</Badge>
            </div>
          </div>
          <Button variant="outline" className="w-full border-white/20 bg-transparent text-surface" onClick={handleLogout}>
            <LogOut size={16} /> Đăng xuất
          </Button>
        </div>
      </aside>

      {/* Content column: fills remaining width + height */}
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        {/* Mobile / iPad portrait top */}
        <header className="sticky top-0 z-40 flex shrink-0 items-center justify-between border-b border-line/70 bg-card/90 px-4 py-3 backdrop-blur safe-top lg:hidden">
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
            <button type="button" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-label="Đóng menu" />
            <div className="absolute right-0 top-0 flex h-full w-[min(80%,20rem)] max-w-xs flex-col bg-ink p-5 text-surface animate-fade-up safe-top safe-bottom">
              <Logo light size="sm" />
              <nav className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto">
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
              <div className="mt-auto space-y-3 pt-4">
                <div>
                  <p className="break-words text-sm font-semibold">{profile?.displayName}</p>
                  <p className="break-all text-xs text-surface/60">{profile?.email}</p>
                  <div className="mt-2">
                    <Badge tone="accent">{roleLabel[profile?.role || 'viewer']}</Badge>
                  </div>
                </div>
                <Button variant="outline" className="w-full border-white/20 bg-transparent text-surface" onClick={handleLogout}>
                  <LogOut size={16} /> Đăng xuất
                </Button>
              </div>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-3 py-4 pb-6 sm:px-5 sm:py-5 lg:px-8 lg:py-6 xl:px-10">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>

        {/* Mobile / iPad portrait bottom nav — pinned to viewport bottom via flex */}
        <nav
          className={cn(
            'sticky bottom-0 z-40 grid shrink-0 gap-1 border-t border-line/70 bg-card/95 px-1.5 py-1.5 backdrop-blur safe-bottom sm:px-2 sm:py-2 lg:hidden',
            nav.length === 3 ? 'grid-cols-3' : 'grid-cols-5',
          )}
        >
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 text-[10px] font-semibold leading-tight sm:min-h-0 sm:text-[11px]',
                  isActive ? 'bg-accent-soft text-accent-hot' : 'text-muted',
                )
              }
            >
              <item.icon size={18} className="shrink-0" />
              <span className="line-clamp-2 w-full px-0.5 text-center hyphens-none">
                {item.short}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
