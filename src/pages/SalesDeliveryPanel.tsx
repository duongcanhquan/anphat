import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, Empty, Input, SearchableSelect, Textarea } from '@/components/ui'
import { MoneyInput } from '@/components/MoneyInput'
import {
  createCustomer,
  createSalesDelivery,
  generateSalesDeliveryCode,
} from '@/lib/store'
import { purchaseLineTotal } from '@/lib/purchase'
import { lineFulfillment, orderFulfillment, wouldExceedSalesPlan } from '@/lib/salesDelivery'
import type { Customer, Formula, Order, SalesDelivery } from '@/types'
import { normalizeOrderStatus, normalizeUnit } from '@/types'
import { formatDate, formatMoney, formatNumber, fromDateInputValue, toDateInputValue } from '@/lib/utils'

export function SalesDeliveryPanel({
  writable,
  profile,
  customers,
  formulas,
  orders,
  deliveries,
  onMsg,
}: {
  writable: boolean
  profile: { id: string; displayName: string } | null
  customers: Customer[]
  formulas: Formula[]
  orders: Order[]
  deliveries: SalesDelivery[]
  onMsg: (m: string) => void
}) {
  const [linkOrder, setLinkOrder] = useState(false)
  const [orderKey, setOrderKey] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [formulaId, setFormulaId] = useState('')
  const [qty, setQty] = useState('')
  const [unitPrice, setUnitPrice] = useState(0)
  const [soldAt, setSoldAt] = useState(toDateInputValue(Date.now()))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const inflight = useRef(false)

  const lineOptions = useMemo(() => {
    const rows: { key: string; label: string; order: Order; lineId: string }[] = []
    for (const o of orders) {
      if (normalizeOrderStatus(o.status) === 'huy') continue
      for (const l of o.lines || []) {
        const f = lineFulfillment(l, deliveries.filter((d) => d.orderId === o.id))
        rows.push({
          key: `${o.id}:${l.id}`,
          label: `${o.code} · ${o.customerName} · ${l.formulaName} (còn ${formatNumber(f.remainingQty)})`,
          order: o,
          lineId: l.id,
        })
      }
    }
    return rows
  }, [orders, deliveries])

  const selected = lineOptions.find((r) => r.key === orderKey)
  const selectedLine = selected?.order.lines.find((l) => l.id === selected.lineId)

  const onPickLine = (key: string) => {
    setOrderKey(key)
    const row = lineOptions.find((r) => r.key === key)
    if (!row) return
    const line = row.order.lines.find((l) => l.id === row.lineId)
    setCustomerId(row.order.customerId || '')
    setNewCustomerName('')
    setFormulaId(line?.formulaId || '')
    setUnitPrice(line?.unitPrice || 0)
  }

  const lineTotal = purchaseLineTotal(Number(qty) || 0, unitPrice)

  const ensureCustomer = async (): Promise<Customer | null> => {
    if (customerId) return customers.find((c) => c.id === customerId) || null
    const name = newCustomerName.trim()
    if (!name || !profile) return null
    const now = Date.now()
    const id = await createCustomer({
      name,
      taxCode: '',
      address: '',
      representative: '',
      phone: '',
      email: '',
      note: '',
      totalDebt: 0,
      totalPurchased: 0,
      createdAt: now,
      updatedAt: now,
    })
    return {
      id,
      name,
      taxCode: '',
      address: '',
      representative: '',
      phone: '',
      email: '',
      note: '',
      totalDebt: 0,
      totalPurchased: 0,
      createdAt: now,
      updatedAt: now,
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable || !profile || inflight.current) return
    const n = Number(qty)
    if (!(n > 0) || !(unitPrice > 0)) {
      onMsg('Số lượng và đơn giá phải > 0.')
      return
    }
    inflight.current = true
    setBusy(true)
    try {
      let cust: Customer | null = null
      let orderId = ''
      let orderCode = ''
      let orderLineId = ''
      let formulaName = ''
      let unit = ''

      if (linkOrder) {
        if (!selected || !selectedLine) {
          onMsg('Chọn đơn / dòng sản phẩm.')
          return
        }
        cust = {
          id: selected.order.customerId || '',
          name: selected.order.customerName,
        } as Customer
        if (!cust.id) {
          onMsg('Đơn bán thiếu khách hàng.')
          return
        }
        orderId = selected.order.id
        orderCode = selected.order.code
        orderLineId = selected.lineId
        formulaName = selectedLine.formulaName
        unit = normalizeUnit(selectedLine.unit)
        const f = lineFulfillment(
          selectedLine,
          deliveries.filter((d) => d.orderId === orderId),
        )
        if (wouldExceedSalesPlan(selectedLine.quantity, f.deliveredQty, n)) {
          onMsg(`Cảnh báo: vượt sl đơn (còn ${formatNumber(f.remainingQty)}). Vẫn lưu.`)
        }
        if (f.remainingAmount - lineTotal < -0.5) {
          onMsg(`Cảnh báo: vượt tiền dòng đơn (còn ${formatMoney(f.remainingAmount)}). Vẫn lưu.`)
        }
      } else {
        cust = await ensureCustomer()
        if (!cust) {
          onMsg('Chọn hoặc nhập tên khách hàng.')
          return
        }
        const f = formulas.find((x) => x.id === formulaId)
        if (!f) {
          onMsg('Chọn sản phẩm.')
          return
        }
        formulaName = f.name
        unit = normalizeUnit(f.unit)
      }

      const at = fromDateInputValue(soldAt)
      await createSalesDelivery({
        code: generateSalesDeliveryCode(new Date(at)),
        orderId,
        orderCode,
        orderLineId,
        customerId: cust.id,
        customerName: cust.name,
        formulaId: linkOrder ? selectedLine!.formulaId : formulaId,
        formulaName,
        quantity: n,
        unit,
        unitPrice,
        lineTotal,
        soldAt: at,
        note: note.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      setQty('')
      setNote('')
      onMsg(`Đã ghi xuất bán ${formatNumber(n)} ${unit}.`)
    } catch (err) {
      onMsg(err instanceof Error ? err.message : 'Không lưu xuất bán.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {writable && (
        <form className="bento space-y-3 p-4" onSubmit={(e) => void save(e)}>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="accent-accent size-4"
              checked={linkOrder}
              onChange={(e) => {
                setLinkOrder(e.target.checked)
                if (!e.target.checked) setOrderKey('')
              }}
            />
            Theo đơn hàng?
          </label>
          {linkOrder ? (
            <SearchableSelect
              label="Đơn / dòng sản phẩm"
              value={orderKey}
              onChange={onPickLine}
              options={lineOptions.map((r) => ({ value: r.key, label: r.label }))}
              placeholder="— Chọn đơn —"
              searchPlaceholder="Tìm đơn, khách…"
              required
            />
          ) : (
            <>
              <SearchableSelect
                label="Khách hàng"
                value={customerId}
                onChange={(v) => { setCustomerId(v); if (v) setNewCustomerName('') }}
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="— Chọn khách —"
                searchPlaceholder="Tìm khách…"
              />
              <Input
                label="Hoặc tạo khách mới"
                value={newCustomerName}
                onChange={(e) => { setNewCustomerName(e.target.value); if (e.target.value) setCustomerId('') }}
              />
              <SearchableSelect
                label="Sản phẩm"
                value={formulaId}
                onChange={(v) => {
                  setFormulaId(v)
                  const f = formulas.find((x) => x.id === v)
                  if (f) setUnitPrice(f.unitPrice || 0)
                }}
                options={formulas.filter((f) => f.active !== false).map((f) => ({
                  value: f.id,
                  label: f.name,
                  hint: normalizeUnit(f.unit),
                }))}
                placeholder="— Chọn SP —"
                searchPlaceholder="Tìm SP…"
                required
              />
            </>
          )}
          <Input label="Ngày xuất" type="date" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} required />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Số lượng" type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
            <MoneyInput label="Đơn giá" value={unitPrice} onChange={setUnitPrice} />
          </div>
          <p className="text-sm">Thành tiền: <strong className="num">{formatMoney(lineTotal)}</strong></p>
          <Textarea label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" disabled={busy} className="w-full">Lưu xuất bán</Button>
        </form>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Phiếu xuất gần đây</p>
        {deliveries.length === 0 ? (
          <Empty text="Chưa có phiếu xuất bán." />
        ) : (
          deliveries.slice(0, 50).map((d) => (
            <div key={d.id} className="bento p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{d.customerName} · {d.formulaName}</p>
                  <p className="text-xs text-muted">
                    {d.code} · {formatDate(d.soldAt)}
                    {d.orderCode ? ` · Đơn ${d.orderCode}` : ' · Không gắn đơn'}
                  </p>
                </div>
                <p className="num font-bold">{formatMoney(d.lineTotal)}</p>
              </div>
              <p className="mt-1 text-sm">{formatNumber(d.quantity)} {d.unit} × {formatMoney(d.unitPrice)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function OrderFulfillmentHint({ order, deliveries }: { order: Order; deliveries: SalesDelivery[] }) {
  const related = deliveries.filter((d) => d.orderId === order.id)
  if (related.length === 0) return null
  const f = orderFulfillment(order.lines || [], related)
  return (
    <p className="text-xs text-muted">
      Đã xuất {formatNumber(f.deliveredQty)} ({formatMoney(f.deliveredAmount)})
      · Còn {formatNumber(f.remainingQty)} / {formatMoney(f.remainingAmount)}
    </p>
  )
}
