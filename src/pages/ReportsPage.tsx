import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  endOfMonth,
  endOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, Bento, Button, Empty, PageHeader, StatBig, Tabs } from '@/components/ui'
import { watchCustomers, watchMaterials, watchOrders, watchPayments } from '@/lib/store'
import type { Customer, DebtPayment, Material, Order } from '@/types'
import { ORDER_STATUS_LABELS, normalizeOrderStatus, orderPaidTotal, resolveOrderStatus } from '@/types'
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  getPeriodRange,
  type PeriodType,
} from '@/lib/utils'

type TabId = 'ky' | 'kho' | 'khach'

export function ReportsPage() {
  const [tab, setTab] = useState<TabId>('ky')
  const [period, setPeriod] = useState<PeriodType>('day')
  const [refDate, setRefDate] = useState(new Date())
  const [orders, setOrders] = useState<Order[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<DebtPayment[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')

  useEffect(() => {
    const u1 = watchOrders(setOrders)
    const u2 = watchMaterials(setMaterials)
    const u3 = watchCustomers(setCustomers)
    const u4 = watchPayments(setPayments)
    return () => {
      u1()
      u2()
      u3()
      u4()
    }
  }, [])

  const range = getPeriodRange(period, refDate)
  const periodOrders = useMemo(
    () => orders.filter((o) => o.orderAt >= range.from && o.orderAt <= range.to),
    [orders, range.from, range.to],
  )
  const activeOrders = periodOrders.filter((o) => {
    const s = normalizeOrderStatus(o.status)
    return s !== 'huy' && s !== 'draft'
  })
  const sales = activeOrders.reduce((s, o) => s + o.totalAmount, 0)
  const paidTotal = activeOrders.reduce((s, o) => s + orderPaidTotal(o), 0)
  const debtPeriod = activeOrders.reduce((s, o) => s + (o.debt || 0), 0)
  const totalDebt = customers.reduce((s, c) => s + (c.totalDebt || 0), 0)

  const shift = (dir: -1 | 1) => {
    if (period === 'day') setRefDate((d) => (dir === 1 ? addDays(d, 1) : subDays(d, 1)))
    else if (period === 'week') setRefDate((d) => (dir === 1 ? addDays(d, 7) : subWeeks(d, 1)))
    else if (period === 'month') setRefDate((d) => (dir === 1 ? addDays(endOfMonth(d), 1) : subMonths(d, 1)))
    else setRefDate((d) => (dir === 1 ? addDays(endOfYear(d), 1) : subYears(d, 1)))
  }

  const cust = customers.find((c) => c.id === selectedCustomer)
  const custOrders = orders.filter((o) => o.customerId === selectedCustomer && normalizeOrderStatus(o.status) !== 'huy')
  const custPayments = payments.filter((p) => p.customerId === selectedCustomer)

  return (
    <div>
      <PageHeader title="Tổng kết" />

      <Tabs
        tabs={[
          { id: 'ky', label: 'Theo kỳ' },
          { id: 'kho', label: 'Kho' },
          { id: 'khach', label: 'Khách hàng' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {tab === 'ky' && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {([
              ['day', 'Ngày'],
              ['week', 'Tuần'],
              ['month', 'Tháng'],
              ['year', 'Năm'],
            ] as const).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={period === id ? 'primary' : 'outline'}
                onClick={() => setPeriod(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          <Bento className="mb-3">
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => shift(-1)}>
                <ChevronLeft size={18} />
              </Button>
              <div className="text-center">
                <p className="text-xs uppercase tracking-wider text-muted">Kỳ tổng kết</p>
                <p className="font-display text-lg font-bold">{range.label}</p>
                <p className="text-xs text-muted">
                  {period === 'day' && '00:00 – 23:59'}
                  {period === 'week' && 'Thứ 2 → Chủ nhật'}
                  {period === 'month' && 'Ngày 1 → cuối tháng'}
                  {period === 'year' && '01/01 → 31/12'}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => shift(1)}>
                <ChevronRight size={18} />
              </Button>
            </div>
          </Bento>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Bento className="min-h-[7.5rem]">
              <StatBig label="Doanh số" value={formatMoney(sales)} tone="accent" />
            </Bento>
            <Bento className="min-h-[7.5rem]">
              <StatBig label="Đã thanh toán" value={formatMoney(paidTotal)} tone="ok" />
            </Bento>
            <Bento className="min-h-[7.5rem]">
              <StatBig label="Công nợ kỳ" value={formatMoney(debtPeriod)} tone="warn" />
            </Bento>
            <Bento className="min-h-[7.5rem]">
              <StatBig
                label="Công nợ chung"
                value={formatMoney(totalDebt)}
                tone="warn"
                hint={`${customers.filter((c) => c.totalDebt > 0).length} khách đang nợ`}
              />
            </Bento>
          </div>

          <div className="mt-3">
            <Bento title="Đơn trong kỳ" subtitle={`${activeOrders.length} đơn (không kể huỷ)`}>
              {activeOrders.length === 0 ? (
                <Empty text="Không có đơn trong kỳ này." />
              ) : (
                <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                  {activeOrders.map((o) => (
                    <div key={o.id} className="rounded-xl bg-surface/70 px-3 py-2.5">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold leading-tight">{o.customerName || '—'}</p>
                          <p className="mt-0.5 text-[11px] text-muted">{o.code} · {formatDateTime(o.orderAt)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="num text-sm font-bold">{formatMoney(o.totalAmount)}</p>
                          <Badge tone="accent">{ORDER_STATUS_LABELS[resolveOrderStatus(o)]}</Badge>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 border-t border-line/60 pt-2">
                        {(o.lines || []).length === 0 ? (
                          <p className="text-xs text-muted">Không có dòng sản phẩm.</p>
                        ) : (
                          (o.lines || []).map((l) => (
                            <div key={l.id} className="flex justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate">{l.formulaName || 'Sản phẩm'}</span>
                              <span className="num shrink-0 font-semibold text-muted">
                                × {formatNumber(l.quantity)} {l.unit}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Bento>
          </div>
        </>
      )}

      {tab === 'kho' && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {materials.filter((m) => m.active).map((m) => {
            const low = m.stock <= m.lowStockAlert
            return (
              <Bento key={m.id} className={low ? 'border-danger/30 bg-red-50/50' : undefined}>
                <p className="font-semibold leading-tight">{m.name}</p>
                <p className="num mt-2 text-3xl font-extrabold">{formatNumber(m.stock)}</p>
                <p className="text-sm text-accent">{m.unit}</p>
                {low && <Badge tone="danger">Dưới mức cảnh báo</Badge>}
              </Bento>
            )
          })}
          {materials.filter((m) => m.active).length === 0 && <Empty text="Chưa có vật liệu." />}
        </div>
      )}

      {tab === 'khach' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <Bento title="Danh sách khách" className="lg:col-span-1">
            <div className="max-h-[28rem] space-y-1 overflow-y-auto">
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCustomer(c.id)}
                  className={`w-full rounded-xl px-3 py-3 text-left transition ${
                    selectedCustomer === c.id ? 'bg-accent text-white' : 'bg-surface/70 hover:bg-surface-2'
                  }`}
                >
                  <p className="font-semibold">{c.name}</p>
                  <p className={`text-xs ${selectedCustomer === c.id ? 'text-white/80' : 'text-muted'}`}>
                    Nợ: {formatMoney(c.totalDebt || 0)}
                  </p>
                </button>
              ))}
              {customers.length === 0 && <Empty text="Chưa có khách hàng." />}
            </div>
          </Bento>

          <Bento
            title={cust ? cust.name : 'Chi tiết khách'}
            className="lg:col-span-2"
            subtitle={cust ? `MST: ${cust.taxCode || '—'} · ${cust.address || '—'}` : 'Chọn một khách bên trái'}
          >
            {!cust ? (
              <Empty text="Chọn khách hàng để xem mua gì, công nợ…" />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-surface p-3">
                    <p className="text-xs text-muted">Đã mua</p>
                    <p className="num text-xl font-bold">{formatMoney(cust.totalPurchased || 0)}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3">
                    <p className="text-xs text-muted">Công nợ</p>
                    <p className="num text-xl font-bold text-warn">{formatMoney(cust.totalDebt || 0)}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Đơn đã mua</p>
                  <div className="space-y-2">
                    {custOrders.map((o) => (
                      <div key={o.id} className="rounded-xl bg-surface/70 px-3 py-2">
                        <div className="flex justify-between gap-2">
                          <p className="font-semibold">{o.code}</p>
                          <p className="num font-bold">{formatMoney(o.totalAmount)}</p>
                        </div>
                        <p className="text-xs text-muted">
                          {o.lines.map((l) => `${l.formulaName} × ${formatNumber(l.quantity)}`).join(', ')}
                        </p>
                      </div>
                    ))}
                    {custOrders.length === 0 && <Empty text="Chưa có đơn." />}
                  </div>
                </div>
                {custPayments.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold">Thanh toán đã ghi</p>
                    {custPayments.map((p) => (
                      <div key={p.id} className="flex justify-between text-sm">
                        <span>{formatDateTime(p.createdAt)}</span>
                        <span className="num font-bold text-ok">+{formatMoney(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Bento>
        </div>
      )}
    </div>
  )
}
