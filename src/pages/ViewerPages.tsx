import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Search, Wallet } from 'lucide-react'
import { Badge, Bento, Empty, Modal, PageHeader } from '@/components/ui'
import { stockDualUnits } from '@/components/FormulaBuilder'
import {
  watchConversions,
  watchCustomers,
  watchMaterials,
  watchOrders,
  watchStockEntries,
} from '@/lib/store'
import type { Conversion, Customer, Material, Order, OrderStatusCore, StockEntry } from '@/types'
import {
  ORDER_STATUS_CORE,
  ORDER_STATUS_LABELS,
  normalizeUnit,
  orderPaidTotal,
  orderPaymentsList,
  resolveOrderStatus,
} from '@/types'
import { cn, formatDateTime, formatMoney, formatNumber } from '@/lib/utils'

/**
 * Bộ màn hình dành riêng cho tài khoản Viewer (người kiểm soát):
 * chỉ xem — kiểm soát tiền, đơn hàng, kho. Không có nút chỉnh sửa.
 */

const STATUS_TONE: Record<OrderStatusCore, 'info' | 'warn' | 'ok' | 'danger'> = {
  draft: 'info',
  dang_lam: 'warn',
  hoan_thien: 'ok',
  huy: 'danger',
}

function OrderStatusBadge({ order }: { order: Order }) {
  const s = resolveOrderStatus(order)
  return <Badge tone={STATUS_TONE[s]}>{ORDER_STATUS_LABELS[s]}</Badge>
}

/** Số tiền lớn, rõ ràng cho điện thoại */
function MoneyRow({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-muted">{label}</span>
      <span className={cn('num text-lg font-extrabold', tone)}>{formatMoney(value)}</span>
    </div>
  )
}

// ————————————————— 1. TỔNG QUAN —————————————————

export function ViewerHomePage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])

  useEffect(() => {
    const u1 = watchOrders(setOrders)
    const u2 = watchCustomers(setCustomers)
    const u3 = watchMaterials(setMaterials)
    return () => { u1(); u2(); u3() }
  }, [])

  const valid = useMemo(() => orders.filter((o) => resolveOrderStatus(o) !== 'huy'), [orders])
  const totalContract = valid.reduce((s, o) => s + (o.totalAmount || 0), 0)
  const totalPaid = valid.reduce((s, o) => s + orderPaidTotal(o), 0)
  const totalDebt = valid.reduce((s, o) => s + Math.max(0, (o.totalAmount || 0) - orderPaidTotal(o)), 0)

  const countByStatus = useMemo(() => {
    const map: Record<OrderStatusCore, number> = { draft: 0, dang_lam: 0, hoan_thien: 0, huy: 0 }
    for (const o of orders) map[resolveOrderStatus(o)] += 1
    return map
  }, [orders])

  const activeMaterials = materials.filter((m) => m.active)
  const lowStock = activeMaterials.filter((m) => m.stock <= m.lowStockAlert)
  const debtCustomers = customers.filter((c) => (c.totalDebt || 0) > 0)

  return (
    <div className="space-y-3">
      <PageHeader title="Tổng quan" subtitle="Kiểm soát toàn hệ thống — chỉ xem" />

      {/* TIỀN — khối quan trọng nhất */}
      <Bento className="bg-ink text-surface">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="opacity-70" />
          <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Kiểm soát tiền (toàn bộ đơn, trừ đơn huỷ)</p>
        </div>
        <p className="num mt-2 text-3xl font-extrabold">{formatMoney(totalContract)}</p>
        <p className="text-sm opacity-70">Tổng giá trị hợp đồng · {valid.length} đơn</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <p className="text-xs opacity-70">Đã thanh toán</p>
            <p className="num text-lg font-extrabold text-emerald-300">{formatMoney(totalPaid)}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <p className="text-xs opacity-70">Công nợ còn lại</p>
            <p className="num text-lg font-extrabold text-amber-300">{formatMoney(totalDebt)}</p>
          </div>
        </div>
      </Bento>

      {/* ĐƠN HÀNG — đếm theo trạng thái */}
      <Bento title="Kiểm soát đơn hàng" subtitle="Bấm để xem danh sách chi tiết">
        <div className="grid grid-cols-2 gap-2">
          {ORDER_STATUS_CORE.map((s) => (
            <Link
              key={s}
              to={`/ban-hang?trang-thai=${s}`}
              className="rounded-xl bg-surface px-3 py-3 text-center"
            >
              <p className="num text-2xl font-extrabold">{countByStatus[s]}</p>
              <p className="mt-0.5 text-xs font-semibold text-muted">{ORDER_STATUS_LABELS[s]}</p>
            </Link>
          ))}
        </div>
        <Link
          to="/ban-hang"
          className="mt-3 block rounded-xl bg-accent-soft px-3 py-2.5 text-center text-sm font-bold text-accent"
        >
          Xem tất cả {orders.length} đơn hàng →
        </Link>
      </Bento>

      {/* KHO — cảnh báo */}
      <Bento title="Kiểm soát kho" subtitle={`${activeMaterials.length} vật liệu đang theo dõi`}>
        {lowStock.length === 0 ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-ok">
            Kho ổn định — không có vật liệu dưới mức cảnh báo.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-danger">
              <AlertTriangle size={15} /> {lowStock.length} vật liệu sắp hết
            </p>
            {lowStock.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <span className="font-medium">{m.name}</span>
                <span className="num font-bold text-danger">{formatNumber(m.stock)} {m.unit}</span>
              </div>
            ))}
          </div>
        )}
        <Link
          to="/kho"
          className="mt-3 block rounded-xl bg-surface-2 px-3 py-2.5 text-center text-sm font-bold text-ink"
        >
          Xem tồn kho chi tiết →
        </Link>
      </Bento>

      {/* CÔNG NỢ theo khách */}
      <Bento title="Công nợ theo khách hàng" subtitle={`${debtCustomers.length} khách còn nợ`}>
        {debtCustomers.length === 0 ? (
          <Empty text="Không có khách hàng nào còn công nợ." />
        ) : (
          <div className="space-y-2">
            {[...debtCustomers]
              .sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0))
              .slice(0, 8)
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
                  <span className="min-w-0 break-words font-medium">{c.name}</span>
                  <span className="num shrink-0 font-bold text-warn">{formatMoney(c.totalDebt || 0)}</span>
                </div>
              ))}
          </div>
        )}
      </Bento>
    </div>
  )
}

// ————————————————— 2. ĐƠN HÀNG —————————————————

export function ViewerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [query, setQuery] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('trang-thai')
  const statusFilter: OrderStatusCore | 'all' =
    param && (ORDER_STATUS_CORE as string[]).includes(param) ? (param as OrderStatusCore) : 'all'
  const setStatusFilter = (s: OrderStatusCore | 'all') => {
    setSearchParams(s === 'all' ? {} : { 'trang-thai': s }, { replace: true })
  }
  const [detail, setDetail] = useState<Order | null>(null)

  useEffect(() => watchOrders(setOrders), [])

  const filtered = useMemo(() => {
    let list = orders
    if (statusFilter !== 'all') list = list.filter((o) => resolveOrderStatus(o) === statusFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (o) => o.code.toLowerCase().includes(q) || (o.customerName || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [orders, statusFilter, query])

  return (
    <div className="space-y-3">
      <PageHeader title="Đơn hàng" subtitle="Chỉ xem — bấm một đơn để xem chi tiết" />

      <div className="flex items-center gap-2 rounded-2xl border border-line bg-card px-3 py-2.5">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm mã đơn hoặc tên khách…"
          className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted/70"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(['all', ...ORDER_STATUS_CORE] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold',
              statusFilter === s ? 'bg-ink text-surface' : 'bg-surface-2 text-muted',
            )}
          >
            {s === 'all' ? 'Tất cả' : ORDER_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Empty text="Không có đơn hàng phù hợp." />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const paid = orderPaidTotal(o)
            const debt = Math.max(0, (o.totalAmount || 0) - paid)
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setDetail(o)}
                className="bento w-full p-4 text-left"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display font-bold">{o.code}</p>
                  <OrderStatusBadge order={o} />
                </div>
                <p className="mt-0.5 break-words text-sm text-muted">
                  {o.customerName || '—'} · {formatDateTime(o.orderAt)}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-lg bg-surface px-1.5 py-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted">Tổng</p>
                    <p className="num text-sm font-bold">{formatMoney(o.totalAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-1.5 py-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted">Đã trả</p>
                    <p className="num text-sm font-bold text-ok">{formatMoney(paid)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-1.5 py-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted">Còn nợ</p>
                    <p className="num text-sm font-bold text-warn">{formatMoney(debt)}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Đơn ${detail.code}` : 'Đơn'} wide>
        {detail && <ViewerOrderDetail order={detail} />}
      </Modal>
    </div>
  )
}

function ViewerOrderDetail({ order }: { order: Order }) {
  const paid = orderPaidTotal(order)
  const debt = Math.max(0, (order.totalAmount || 0) - paid)
  const payments = orderPaymentsList(order)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge order={order} />
        {order.locked && <Badge tone="warn">Đã khoá</Badge>}
        {resolveOrderStatus(order) === 'draft' && <Badge tone="info">Chưa trừ kho</Badge>}
      </div>

      <div className="grid gap-1.5 rounded-2xl bg-surface p-3 text-sm">
        <p><span className="text-muted">Khách hàng:</span> <strong>{order.customerName || '—'}</strong></p>
        <p><span className="text-muted">Thời gian:</span> {formatDateTime(order.orderAt)}</p>
        <p><span className="text-muted">Người phụ trách:</span> {order.assignedToName || order.createdByName || '—'}</p>
        {order.note && <p><span className="text-muted">Ghi chú:</span> {order.note}</p>}
      </div>

      <div className="rounded-2xl bg-ink p-3 text-surface">
        <MoneyRow label="Tổng tiền" value={order.totalAmount || 0} tone="text-surface" />
        <MoneyRow label="Đã thanh toán" value={paid} tone="text-emerald-300" />
        <MoneyRow label="Còn nợ" value={debt} tone="text-amber-300" />
      </div>

      <div>
        <p className="mb-2 text-sm font-bold">Sản phẩm</p>
        <div className="space-y-2">
          {order.lines.map((l) => (
            <div key={l.id} className="rounded-xl bg-surface px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 break-words font-semibold">{l.formulaName}</p>
                <p className="num shrink-0 font-bold">{formatMoney(l.lineTotal)}</p>
              </div>
              <p className="text-xs text-muted">
                {formatNumber(l.quantity)} {normalizeUnit(l.unit)} × {formatMoney(l.unitPrice)}
                {l.recipeLabel && <> · Công thức: {l.recipeLabel}</>}
              </p>
              {l.items.length > 0 && (
                <div className="mt-1.5 border-t border-line/60 pt-1.5">
                  {l.items.map((i) => (
                    <div key={i.materialId} className="flex justify-between text-xs text-muted">
                      <span>{i.materialName}</span>
                      <span className="num">{formatNumber(i.quantityPerUnit * l.quantity)} {i.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold">Lịch sử thanh toán</p>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">Chưa có thanh toán.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">{formatDateTime(p.paidAt)}</p>
                  {p.note && <p className="text-xs">{p.note}</p>}
                </div>
                <p className="num shrink-0 font-bold text-ok">{formatMoney(p.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ————————————————— 3. KHO —————————————————

export function ViewerWarehousePage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [entries, setEntries] = useState<StockEntry[]>([])

  useEffect(() => {
    const u1 = watchMaterials(setMaterials)
    const u2 = watchConversions(setConversions)
    const u3 = watchStockEntries(setEntries)
    return () => { u1(); u2(); u3() }
  }, [])

  const active = materials.filter((m) => m.active)
  const recentMoves = entries.slice(0, 20)

  return (
    <div className="space-y-3">
      <PageHeader title="Kho" subtitle="Tồn kho và nhập / xuất — chỉ xem" />

      <div className="grid grid-cols-2 gap-2">
        {active.map((m) => {
          const low = m.stock <= m.lowStockAlert
          const dual = stockDualUnits(m, conversions)
          return (
            <Bento key={m.id} className={cn('min-w-0 !p-3', low && 'border border-danger/30 bg-red-50/60')}>
              <p className="break-words text-sm font-semibold leading-tight">{m.name}</p>
              <p className={cn('num mt-1.5 text-2xl font-extrabold', low && 'text-danger')}>
                {formatNumber(m.stock)}
              </p>
              <p className="text-xs text-accent">{m.unit}</p>
              {dual.convertedQty != null && dual.convertedUnit && (
                <p className="text-[11px] text-muted">≈ {formatNumber(dual.convertedQty)} {dual.convertedUnit}</p>
              )}
              {low && <Badge tone="danger">Sắp hết</Badge>}
            </Bento>
          )
        })}
        {active.length === 0 && <Empty text="Chưa có vật liệu." />}
      </div>

      <Bento title="Nhập / xuất gần đây" subtitle="20 giao dịch mới nhất">
        {recentMoves.length === 0 ? (
          <Empty text="Chưa có lịch sử nhập / xuất." />
        ) : (
          <div className="space-y-2">
            {recentMoves.map((e) => {
              const isExport = e.type === 'export'
              return (
                <div key={e.id} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2">
                  {isExport ? (
                    <ArrowUpRight size={16} className="shrink-0 text-warn" />
                  ) : (
                    <ArrowDownLeft size={16} className="shrink-0 text-ok" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium leading-tight">{e.materialName}</p>
                    <p className="text-[11px] text-muted">
                      {formatDateTime(e.createdAt)}
                      {e.orderCode && ` · Đơn ${e.orderCode}`}
                      {!e.orderCode && e.contractor && ` · ${e.contractor}`}
                    </p>
                  </div>
                  <p className={cn('num shrink-0 text-sm font-bold', isExport ? 'text-warn' : 'text-ok')}>
                    {isExport ? '−' : '+'}{formatNumber(e.quantity)} {e.unit}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </Bento>
    </div>
  )
}
