import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Package, ShoppingCart, Users, Wallet } from 'lucide-react'
import { Bento, PageHeader, StatBig, Badge } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { watchCustomers, watchMaterials, watchOrders } from '@/lib/store'
import type { Customer, Material, Order } from '@/types'
import { ORDER_STATUS_LABELS } from '@/types'
import { formatMoney, formatNumber, formatDateTime, getPeriodRange } from '@/lib/utils'

export function DashboardPage() {
  const { profile } = useAuth()
  const [materials, setMaterials] = useState<Material[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])

  useEffect(() => {
    const u1 = watchMaterials(setMaterials)
    const u2 = watchOrders(setOrders)
    const u3 = watchCustomers(setCustomers)
    return () => {
      u1()
      u2()
      u3()
    }
  }, [])

  const today = getPeriodRange('day')
  const todayOrders = useMemo(
    () => orders.filter((o) => o.orderAt >= today.from && o.orderAt <= today.to && o.status !== 'huy'),
    [orders, today.from, today.to],
  )

  const todaySales = todayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0)
  const todayDeposit = todayOrders.reduce((s, o) => s + (o.deposit || 0), 0)
  const totalDebt = customers.reduce((s, c) => s + (c.totalDebt || 0), 0)
  const lowStock = materials.filter((m) => m.active && m.stock <= m.lowStockAlert)
  const recent = orders.slice(0, 6)

  return (
    <div>
      <PageHeader
        title={`Xin chào, ${profile?.displayName?.split(' ').slice(-1)[0] || ''}`}
        subtitle="Thông tin tổng hợp An Phát"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Bento className="bg-ink text-surface">
          <StatBig label="Doanh thu hôm nay" value={formatMoney(todaySales)} hint={`${todayOrders.length} đơn`} tone="accent" />
        </Bento>
        <Bento>
          <div className="flex items-start justify-between">
            <StatBig label="Đặt cọc hôm nay" value={formatMoney(todayDeposit)} tone="ok" />
            <Wallet className="text-ok" size={22} />
          </div>
        </Bento>
        <Bento>
          <div className="flex items-start justify-between">
            <StatBig label="Công nợ chung" value={formatMoney(totalDebt)} tone="warn" />
            <Users className="text-warn" size={22} />
          </div>
        </Bento>
        <Bento>
          <div className="flex items-start justify-between">
            <StatBig
              label="Cảnh báo kho"
              value={String(lowStock.length)}
              hint="vật liệu dưới mức"
              tone={lowStock.length ? 'danger' : 'ok'}
            />
            <AlertTriangle className={lowStock.length ? 'text-danger animate-soft-pulse' : 'text-ok'} size={22} />
          </div>
        </Bento>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Bento title="Thao tác nhanh" className="lg:col-span-1" subtitle="Chạm một lần">
          <div className="grid gap-2">
            <Link to="/ban-hang" className="flex items-center gap-3 rounded-2xl bg-accent px-4 py-4 font-semibold text-white">
              <ShoppingCart size={20} /> Tạo đơn / Tính nhanh
            </Link>
            <Link to="/kho" className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-4 font-semibold text-ink">
              <Package size={20} /> Xem kho vật liệu
            </Link>
            <Link to="/tong-ket" className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-4 font-semibold text-ink">
              <Users size={20} /> Tổng kết & công nợ
            </Link>
          </div>
        </Bento>

        <Bento title="Đơn gần đây" className="lg:col-span-2" subtitle="Theo dõi trạng thái">
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Chưa có đơn hàng.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface/70 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{o.code} · {o.customerName || 'Tính nhanh'}</p>
                    <p className="text-xs text-muted">{formatDateTime(o.orderAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm font-bold">{formatMoney(o.totalAmount)}</p>
                    <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Bento>
      </div>

      {lowStock.length > 0 && (
        <Bento title="Vật liệu sắp hết" className="mt-3" subtitle="Admin có thể chỉnh mức cảnh báo trong Cài đặt">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lowStock.map((m) => (
              <div key={m.id} className="rounded-2xl border border-danger/20 bg-red-50 px-3 py-3">
                <p className="font-semibold">{m.name}</p>
                <p className="num text-lg font-bold text-danger">
                  {formatNumber(m.stock)} {m.unit}
                </p>
                <p className="text-xs text-muted">Cảnh báo ≤ {formatNumber(m.lowStockAlert)} {m.unit}</p>
              </div>
            ))}
          </div>
        </Bento>
      )}
    </div>
  )
}

function statusTone(s: Order['status']) {
  if (s === 'da_giao') return 'ok' as const
  if (s === 'huy') return 'danger' as const
  if (s === 'chua_thanh_toan') return 'warn' as const
  if (s === 'dang_san_xuat') return 'info' as const
  return 'accent' as const
}
