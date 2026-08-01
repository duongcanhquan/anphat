import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Package, ShoppingCart, Users, Wallet } from 'lucide-react'
import { Bento, PageHeader, StatBig, Badge } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { watchCustomers, watchMaterials, watchOrders } from '@/lib/store'
import type { Customer, Material, Order } from '@/types'
import { ORDER_STATUS_LABELS, normalizeOrderStatus, orderPaidTotal, resolveOrderStatus, stockLevel } from '@/types'
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
    () =>
      orders.filter(
        (o) =>
          o.orderAt >= today.from &&
          o.orderAt <= today.to &&
          normalizeOrderStatus(o.status) !== 'huy' &&
          normalizeOrderStatus(o.status) !== 'draft',
      ),
    [orders, today.from, today.to],
  )

  const todaySales = todayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0)
  const todayPaid = todayOrders.reduce((s, o) => s + orderPaidTotal(o), 0)
  const totalDebt = customers.reduce((s, c) => s + (c.totalDebt || 0), 0)
  /** Đã hết: tồn = 0 · Sắp hết: tồn > 0 nhưng ≤ mức cảnh báo */
  const outOfStock = materials.filter((m) => m.active && stockLevel(m) === 'het')
  const lowStock = materials.filter((m) => m.active && stockLevel(m) === 'sap_het')
  const stockAlerts = outOfStock.length + lowStock.length
  const recent = orders.slice(0, 6)

  return (
    <div>
      <PageHeader
        title={`Xin chào, ${profile?.displayName?.split(' ').slice(-1)[0] || ''}`}
        subtitle="Thông tin tổng hợp An Phát"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Bento className="min-w-0 bg-ink text-surface">
          <StatBig label="Hợp đồng hôm nay" value={formatMoney(todaySales)} hint={`${todayOrders.length} đơn`} tone="accent" />
        </Bento>
        <Bento className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <StatBig label="Thanh toán hôm nay" value={formatMoney(todayPaid)} tone="ok" />
            <Wallet className="shrink-0 text-ok" size={22} />
          </div>
        </Bento>
        <Bento className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <StatBig label="Công nợ tổng" value={formatMoney(totalDebt)} tone="warn" />
            <Users className="shrink-0 text-warn" size={22} />
          </div>
        </Bento>
        <Bento className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <StatBig
              label="Cảnh báo kho"
              value={String(stockAlerts)}
              hint={
                stockAlerts > 0
                  ? [
                      outOfStock.length > 0 && `${outOfStock.length} đã hết`,
                      lowStock.length > 0 && `${lowStock.length} sắp hết`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'kho ổn định'
              }
              tone={outOfStock.length ? 'danger' : lowStock.length ? 'warn' : 'ok'}
            />
            <AlertTriangle className={`shrink-0 ${stockAlerts ? 'text-danger animate-soft-pulse' : 'text-ok'}`} size={22} />
          </div>
        </Bento>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Bento title="Thao tác nhanh" className="lg:col-span-1" subtitle="Chạm một lần">
          <div className="grid gap-2">
            <Link to="/ban-hang" className="flex items-center gap-3 rounded-2xl bg-accent px-4 py-4 font-semibold text-white">
              <ShoppingCart size={20} /> Tạo đơn hàng
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
                <div
                  key={o.id}
                  className="flex flex-col gap-2 rounded-2xl bg-surface/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      {o.code} · {o.customerName || 'Tính nhanh'}
                    </p>
                    <p className="text-xs text-muted">{formatDateTime(o.orderAt)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:shrink-0 sm:flex-col sm:items-end sm:text-right">
                    <p className="num text-sm font-bold">{formatMoney(o.totalAmount)}</p>
                    <Badge tone={statusTone(resolveOrderStatus(o))}>{ORDER_STATUS_LABELS[resolveOrderStatus(o)]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Bento>
      </div>

      {stockAlerts > 0 && (
        <Bento title="Vật liệu cần chú ý" className="mt-3" subtitle="Đã hết: tồn = 0 · Sắp hết: còn hàng nhưng dưới mức cảnh báo">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {outOfStock.map((m) => (
              <div key={m.id} className="rounded-2xl border border-danger/20 bg-red-50 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold">{m.name}</p>
                  <Badge tone="danger">Đã hết</Badge>
                </div>
                <p className="num text-lg font-bold text-danger">0 {m.unit}</p>
                <p className="text-xs text-muted">Cần nhập kho để tạo đơn</p>
              </div>
            ))}
            {lowStock.map((m) => (
              <div key={m.id} className="rounded-2xl border border-warn/20 bg-amber-50 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold">{m.name}</p>
                  <Badge tone="warn">Sắp hết</Badge>
                </div>
                <p className="num text-lg font-bold text-warn">
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

function statusTone(s: ReturnType<typeof resolveOrderStatus>) {
  if (s === 'hoan_thien') return 'ok' as const
  if (s === 'huy') return 'danger' as const
  if (s === 'draft') return 'info' as const
  if (s === 'dang_lam') return 'warn' as const
  return 'accent' as const
}
