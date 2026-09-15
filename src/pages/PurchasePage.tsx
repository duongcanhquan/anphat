import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Bento, Button, Empty, Input, Modal, PageHeader, SearchableSelect, Tabs, Textarea } from '@/components/ui'
import { MoneyInput } from '@/components/MoneyInput'
import { useAuth } from '@/contexts/AuthContext'
import {
  addPurchasePayment,
  cancelPurchaseOrder,
  closePurchaseOrder,
  confirmDraftPurchaseOrder,
  createOpenPurchaseOrder,
  createPurchaseOrder,
  createPurchaseReceipt,
  createSupplier,
  generatePurchaseCode,
  generatePurchaseReceiptCode,
  getSupplier,
  watchMaterials,
  watchPurchaseOrders,
  watchPurchaseReceipts,
  watchSuppliers,
} from '@/lib/store'
import {
  plannedQtyFromAmount,
  purchaseLineTotal,
  purchaseTotals,
  resolveOrderAmount,
  resolvePlannedWeight,
  wouldExceedPlan,
} from '@/lib/purchase'
import type { Material, PurchaseOrder, PurchasePayment, PurchaseReceipt, PurchaseReceiptDoc, Supplier } from '@/types'
import { PURCHASE_STATUS_LABELS, canWrite } from '@/types'
import { formatDate, formatDateTime, formatMoney, formatNumber, fromDateInputValue, toDateInputValue, uid } from '@/lib/utils'

function statusTone(s: PurchaseOrder['status']): 'info' | 'warn' | 'ok' | 'danger' {
  if (s === 'open') return 'warn'
  if (s === 'closed') return 'ok'
  if (s === 'huy') return 'danger'
  return 'info'
}

function poTotals(o: PurchaseOrder) {
  return purchaseTotals({
    orderAmount: resolveOrderAmount(o),
    plannedWeight: resolvePlannedWeight(o),
    quantity: o.quantity,
    unitPrice: o.unitPrice,
    lineTotal: o.lineTotal,
    carriedIn: o.carriedIn || 0,
    carriedOut: o.carriedOut || 0,
    payments: o.payments || [],
    receipts: o.receipts || [],
  })
}

type TabId = 'don' | 'nhap'

export function PurchasePage() {
  const { profile } = useAuth()
  const writable = canWrite(profile?.role)
  const [tab, setTab] = useState<TabId>('don')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [receipts, setReceipts] = useState<PurchaseReceiptDoc[]>([])
  const [open, setOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [detail, setDetail] = useState<PurchaseOrder | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | PurchaseOrder['status']>('all')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const inflight = useRef(false)

  const [supplierId, setSupplierId] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [materialId, setMaterialId] = useState('')
  /** qty = nhập số lượng × ĐG → tiền; money = nhập tiền ÷ ĐG → số lượng */
  const [createMode, setCreateMode] = useState<'qty' | 'money'>('money')
  const [qtyInput, setQtyInput] = useState('')
  const [orderAmount, setOrderAmount] = useState(0)
  const [plannedWeight, setPlannedWeight] = useState('')
  const [unitPrice, setUnitPrice] = useState(0)
  const [orderAt, setOrderAt] = useState(toDateInputValue(Date.now()))
  const [note, setNote] = useState('')
  const [payNow, setPayNow] = useState(0)

  const [payAmt, setPayAmt] = useState(0)
  const [payNote, setPayNote] = useState('')
  const [closeAsk, setCloseAsk] = useState(false)

  // Nhập thực tế
  const [linkOrder, setLinkOrder] = useState(false)
  const [receiptPoId, setReceiptPoId] = useState('')
  const [rSupplierId, setRSupplierId] = useState('')
  const [rNewSupplier, setRNewSupplier] = useState('')
  const [rMaterialId, setRMaterialId] = useState('')
  const [rQty, setRQty] = useState('')
  const [rUnitPrice, setRUnitPrice] = useState(0)
  const [rAt, setRAt] = useState(toDateInputValue(Date.now()))
  const [rNote, setRNote] = useState('')

  useEffect(() => {
    const u1 = watchSuppliers(setSuppliers)
    const u2 = watchMaterials(setMaterials)
    const u3 = watchPurchaseOrders(setOrders)
    const u4 = watchPurchaseReceipts(setReceipts)
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  useEffect(() => {
    if (!detail) return
    const fresh = orders.find((o) => o.id === detail.id)
    if (fresh) setDetail(fresh)
  }, [orders, detail?.id])

  const live = detail ? orders.find((o) => o.id === detail.id) || detail : null
  const liveT = live ? poTotals(live) : null

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return orders
    return orders.filter((o) => o.status === filterStatus)
  }, [orders, filterStatus])

  const activeMats = materials.filter((m) => m.active)
  const activeSup = suppliers.filter((s) => s.active !== false)
  const openOrders = orders.filter((o) => o.status === 'open')

  const calcPlannedQty = plannedQtyFromAmount(orderAmount, unitPrice)
  const calcAmountFromQty = purchaseLineTotal(Number(qtyInput) || 0, unitPrice)
  const previewReceiptTotal = purchaseLineTotal(Number(rQty) || 0, rUnitPrice)

  const resetForm = () => {
    setSupplierId('')
    setNewSupplierName('')
    setMaterialId('')
    setCreateMode('money')
    setQtyInput('')
    setOrderAmount(0)
    setPlannedWeight('')
    setUnitPrice(0)
    setOrderAt(toDateInputValue(Date.now()))
    setNote('')
    setPayNow(0)
  }

  const resetReceiptForm = (prefill?: PurchaseOrder) => {
    setLinkOrder(!!prefill)
    setReceiptPoId(prefill?.id || '')
    setRSupplierId(prefill?.supplierId || '')
    setRNewSupplier('')
    setRMaterialId(prefill?.materialId || '')
    setRQty('')
    setRUnitPrice(prefill?.unitPrice || 0)
    setRAt(toDateInputValue(Date.now()))
    setRNote('')
  }

  const ensureSupplier = async (
    id: string,
    newName: string,
  ): Promise<Supplier | null> => {
    if (id) return suppliers.find((s) => s.id === id) || (await getSupplier(id))
    const name = newName.trim()
    if (!name) return null
    const now = Date.now()
    const sid = await createSupplier({
      name,
      taxCode: '',
      address: '',
      phone: '',
      email: '',
      note: '',
      openingDebt: 0,
      openingAt: now,
      pendingCarry: 0,
      totalDebt: 0,
      totalPurchased: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    return {
      id: sid,
      name,
      taxCode: '',
      address: '',
      phone: '',
      email: '',
      note: '',
      openingDebt: 0,
      openingAt: now,
      pendingCarry: 0,
      totalDebt: 0,
      totalPurchased: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    }
  }

  const onPickReceiptOrder = (id: string) => {
    setReceiptPoId(id)
    const po = orders.find((o) => o.id === id)
    if (!po) return
    setRSupplierId(po.supplierId)
    setRNewSupplier('')
    setRMaterialId(po.materialId)
    setRUnitPrice(po.unitPrice)
  }

  const save = async (asDraft: boolean) => {
    if (!writable || !profile || inflight.current) return
    const mat = activeMats.find((m) => m.id === materialId)
    if (!supplierId && !newSupplierName.trim()) {
      setMsg('Chọn hoặc nhập tên nhà cung cấp.')
      return
    }
    if (!mat || !(unitPrice > 0)) {
      setMsg('Chọn vật liệu và đơn giá > 0.')
      return
    }

    let finalAmount = 0
    let finalWeight = 0
    let finalPlannedQty = 0

    if (createMode === 'qty') {
      const qty = Number(qtyInput)
      if (!(qty > 0)) {
        setMsg('Nhập số lượng đặt > 0.')
        return
      }
      finalAmount = purchaseLineTotal(qty, unitPrice)
      finalPlannedQty = qty
      finalWeight = Number(plannedWeight) > 0 ? Number(plannedWeight) : qty
    } else {
      if (!(orderAmount > 0)) {
        setMsg('Nhập số tiền đặt hàng > 0.')
        return
      }
      finalAmount = orderAmount
      finalPlannedQty = plannedQtyFromAmount(orderAmount, unitPrice)
      finalWeight = Number(plannedWeight)
      if (!(finalWeight > 0)) {
        setMsg('Nhập khối lượng kế hoạch > 0.')
        return
      }
    }

    inflight.current = true
    setBusy(true)
    setMsg('')
    try {
      const sup = await ensureSupplier(supplierId, newSupplierName)
      if (!sup) {
        setMsg('Chọn hoặc nhập tên nhà cung cấp.')
        return
      }
      const payments: PurchasePayment[] =
        payNow > 0
          ? [{
              id: uid(),
              amount: payNow,
              note: 'Chuyển khi tạo đơn',
              paidAt: fromDateInputValue(orderAt),
              createdBy: profile.id,
              createdByName: profile.displayName,
            }]
          : []
      const now = Date.now()
      const at = fromDateInputValue(orderAt)
      const payload = {
        code: generatePurchaseCode(new Date(at)),
        supplierId: sup.id,
        supplierName: sup.name,
        materialId: mat.id,
        materialName: mat.name,
        unit: mat.unit,
        quantity: finalWeight,
        orderAmount: finalAmount,
        plannedWeight: finalWeight,
        plannedQty: finalPlannedQty,
        unitPrice,
        lineTotal: finalAmount,
        carriedIn: 0,
        carriedFromOrderId: '',
        carriedOut: 0,
        payments,
        receipts: [] as PurchaseReceipt[],
        status: asDraft ? ('draft' as const) : ('open' as const),
        note: note.trim(),
        orderAt: at,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.id,
        createdByName: profile.displayName,
      }
      if (asDraft) {
        await createPurchaseOrder(payload)
      } else {
        await createOpenPurchaseOrder(payload)
      }
      setOpen(false)
      resetForm()
      setMsg(asDraft ? 'Đã lưu nháp.' : 'Đã chốt đơn mua.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không lưu được đơn mua.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const saveReceipt = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable || !profile || inflight.current) return
    const qty = Number(rQty)
    if (!(qty > 0) || !(rUnitPrice > 0)) {
      setMsg('Số lượng và đơn giá phải > 0.')
      return
    }
    let mat = activeMats.find((m) => m.id === rMaterialId)
    let po: PurchaseOrder | undefined
    if (linkOrder) {
      po = openOrders.find((o) => o.id === receiptPoId)
      if (!po) {
        setMsg('Chọn đơn mua đang mở.')
        return
      }
      mat = materials.find((m) => m.id === po!.materialId) || mat
    }
    if (!mat) {
      setMsg('Chọn mặt hàng.')
      return
    }
    inflight.current = true
    setBusy(true)
    setMsg('')
    try {
      const sup = linkOrder && po
        ? { id: po.supplierId, name: po.supplierName } as Supplier
        : await ensureSupplier(rSupplierId, rNewSupplier)
      if (!sup) {
        setMsg('Chọn hoặc nhập tên nhà cung cấp.')
        return
      }
      const lineTotal = purchaseLineTotal(qty, rUnitPrice)
      const at = fromDateInputValue(rAt)
      const code = generatePurchaseReceiptCode(new Date(at))
      if (po) {
        const t = poTotals(po)
        if (wouldExceedPlan(t.plannedWeight, t.receivedQty, qty)) {
          setMsg(`Cảnh báo: vượt khối lượng kế hoạch (còn ${formatNumber(t.remainingWeight)}). Vẫn lưu.`)
        }
        if (t.remainingOrderAmount - lineTotal < -0.5) {
          setMsg((m) => (m ? m + ' ' : '') + `Cảnh báo: vượt số tiền đặt (còn ${formatMoney(t.remainingOrderAmount)}).`)
        }
      }
      await createPurchaseReceipt({
        code,
        purchaseOrderId: po?.id || '',
        purchaseOrderCode: po?.code || '',
        supplierId: sup.id,
        supplierName: sup.name,
        materialId: mat.id,
        materialName: mat.name,
        unit: mat.unit,
        quantity: qty,
        unitPrice: rUnitPrice,
        lineTotal,
        receiptAt: at,
        note: rNote.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      setReceiptOpen(false)
      resetReceiptForm()
      setMsg(`Đã nhập kho ${formatNumber(qty)} ${mat.unit}.`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không nhập được.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const confirmDraft = async (po: PurchaseOrder) => {
    if (!writable || inflight.current) return
    inflight.current = true
    setBusy(true)
    try {
      await confirmDraftPurchaseOrder(po.id)
      setMsg('Đã chốt đơn.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không chốt được.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const pay = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable || !profile || !live || inflight.current) return
    if (!(payAmt > 0) || live.status === 'huy') return
    inflight.current = true
    setBusy(true)
    try {
      const row: PurchasePayment = {
        id: uid(),
        amount: payAmt,
        note: payNote.trim() || 'Chuyển tiền',
        paidAt: Date.now(),
        createdBy: profile.id,
        createdByName: profile.displayName,
      }
      await addPurchasePayment(live.id, row)
      setPayAmt(0)
      setPayNote('')
      setMsg('Đã ghi lần chuyển tiền.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không ghi được tiền.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const closeOrder = async (carry: boolean) => {
    if (!writable || !live || live.status !== 'open' || inflight.current) return
    inflight.current = true
    setBusy(true)
    try {
      await closePurchaseOrder(live.id, carry)
      setCloseAsk(false)
      setMsg(carry ? 'Đã đóng và chuyển số dư sang đơn sau.' : 'Đã đóng đơn.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không đóng được đơn.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const cancelOrder = async (po: PurchaseOrder) => {
    if (!writable || inflight.current) return
    if ((po.receipts || []).length > 0) {
      setMsg('Đơn đã nhận hàng — không huỷ được.')
      return
    }
    if (!confirm(`Huỷ đơn ${po.code}?`)) return
    inflight.current = true
    setBusy(true)
    try {
      await cancelPurchaseOrder(po.id)
      setDetail(null)
      setMsg('Đã huỷ đơn.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không huỷ được đơn.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Mua hàng"
        subtitle="Đơn mua (khung) · nhập thực tế · chuyển tiền NCC"
        action={
          writable ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  resetReceiptForm()
                  setReceiptOpen(true)
                  setTab('nhap')
                }}
              >
                <Plus size={18} /> Nhập thực tế
              </Button>
              <Button
                onClick={() => {
                  resetForm()
                  setOpen(true)
                  setTab('don')
                }}
              >
                <Plus size={18} /> Đơn mua mới
              </Button>
            </div>
          ) : undefined
        }
      />
      {msg && <p className="mb-3 text-sm font-medium text-info">{msg}</p>}

      <Tabs
        tabs={[
          { id: 'don', label: 'Đơn mua' },
          { id: 'nhap', label: 'Nhập thực tế' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {tab === 'don' && (
        <>
          <div className="mb-3 mt-3 flex flex-wrap gap-2">
            {(['all', 'draft', 'open', 'closed', 'huy'] as const).map((s) => (
              <Button key={s} size="sm" variant={filterStatus === s ? 'primary' : 'outline'} onClick={() => setFilterStatus(s)}>
                {s === 'all' ? 'Tất cả' : PURCHASE_STATUS_LABELS[s]}
              </Button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Empty text="Chưa có đơn mua." />
          ) : (
            <div className="space-y-2">
              {filtered.map((o) => {
                const t = poTotals(o)
                return (
                  <button
                    key={o.id}
                    type="button"
                    className="bento w-full p-4 text-left"
                    onClick={() => { setDetail(o); setPayAmt(0); setCloseAsk(false) }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{o.supplierName}</p>
                        <p className="text-xs text-muted">
                          {o.code} · {o.materialName} · {formatDate(o.orderAt)}
                        </p>
                      </div>
                      <Badge tone={statusTone(o.status)}>{PURCHASE_STATUS_LABELS[o.status]}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <p>Đặt: <strong className="num">{formatMoney(t.orderAmount)}</strong></p>
                      <p>KL KH: <strong className="num">{formatNumber(t.plannedWeight)} {o.unit}</strong></p>
                      <p>Đã nhập: <strong className="num">{formatNumber(t.receivedQty)}</strong> / <strong className="num">{formatMoney(t.receivedAmount)}</strong></p>
                      <p>Còn: <strong className="num text-warn">{formatNumber(t.remainingWeight)}</strong> / <strong className="num text-warn">{formatMoney(t.remainingOrderAmount)}</strong></p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'nhap' && (
        <div className="mt-3 space-y-2">
          {receipts.length === 0 ? (
            <Empty text="Chưa có phiếu nhập thực tế." />
          ) : (
            receipts.map((r) => (
              <div key={r.id} className="bento p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.supplierName} · {r.materialName}</p>
                    <p className="text-xs text-muted">
                      {r.code} · {formatDate(r.receiptAt)}
                      {r.purchaseOrderCode ? ` · Đơn ${r.purchaseOrderCode}` : ' · Không gắn đơn'}
                    </p>
                  </div>
                  <p className="num font-bold">{formatMoney(r.lineTotal)}</p>
                </div>
                <p className="mt-1 text-sm">
                  {formatNumber(r.quantity)} {r.unit} × {formatMoney(r.unitPrice)}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Đơn mua mới">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(false) }}>
          <SearchableSelect
            label="Nhà cung cấp"
            value={supplierId}
            onChange={(v) => { setSupplierId(v); if (v) setNewSupplierName('') }}
            options={activeSup.map((s) => ({
              value: s.id,
              label: s.name,
              hint: s.totalDebt ? `Nợ ${formatMoney(s.totalDebt)}` : undefined,
            }))}
            placeholder="— Chọn NCC —"
            searchPlaceholder="Tìm NCC…"
          />
          <Input
            label="Hoặc tạo NCC mới (chỉ cần tên)"
            value={newSupplierName}
            onChange={(e) => { setNewSupplierName(e.target.value); if (e.target.value) setSupplierId('') }}
            placeholder="Tên nhà cung cấp"
          />
          <SearchableSelect
            label="Vật liệu"
            value={materialId}
            onChange={setMaterialId}
            options={activeMats.map((m) => ({
              value: m.id,
              label: m.name,
              hint: m.unit,
              searchText: m.description || '',
            }))}
            placeholder="— Chọn vật liệu —"
            searchPlaceholder="Tìm vật liệu…"
            required
          />
          <Input label="Ngày đơn" type="date" value={orderAt} onChange={(e) => setOrderAt(e.target.value)} required />

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-soft">Cách tính đơn mua</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={
                  createMode === 'money'
                    ? 'rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white'
                    : 'rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-semibold text-muted'
                }
                onClick={() => setCreateMode('money')}
              >
                1. Theo số tiền
              </button>
              <button
                type="button"
                className={
                  createMode === 'qty'
                    ? 'rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white'
                    : 'rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-semibold text-muted'
                }
                onClick={() => setCreateMode('qty')}
              >
                2. Theo số lượng
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {createMode === 'money'
                ? 'Ưu tiên: nhập số tiền chuyển/đặt + đơn giá → app ra số lượng ngay.'
                : 'Nhập số lượng đặt + đơn giá → app ra thành tiền.'}
            </p>
          </div>

          {createMode === 'money' ? (
            <>
              <MoneyInput label="Số tiền đặt hàng" value={orderAmount} onChange={setOrderAmount} />
              <MoneyInput label="Đơn giá" value={unitPrice} onChange={setUnitPrice} />
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                Số lượng tính (tiền ÷ ĐG):{' '}
                <strong className="num text-lg text-ink">{formatNumber(calcPlannedQty)}</strong>
              </p>
              <Input
                label="Khối lượng kế hoạch"
                type="number"
                step="any"
                value={plannedWeight}
                onChange={(e) => setPlannedWeight(e.target.value)}
                required
              />
            </>
          ) : (
            <>
              <Input
                label="Số lượng đặt"
                type="number"
                step="any"
                value={qtyInput}
                onChange={(e) => {
                  const v = e.target.value
                  setQtyInput(v)
                  setPlannedWeight((prev) => (!prev || prev === qtyInput ? v : prev))
                }}
                required
              />
              <MoneyInput label="Đơn giá" value={unitPrice} onChange={setUnitPrice} />
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                Thành tiền (sl × ĐG):{' '}
                <strong className="num text-lg text-ink">{formatMoney(calcAmountFromQty)}</strong>
              </p>
              <Input
                label="Khối lượng kế hoạch (mặc định = số lượng đặt)"
                type="number"
                step="any"
                value={plannedWeight}
                onChange={(e) => setPlannedWeight(e.target.value)}
              />
            </>
          )}

          <MoneyInput label="Chuyển tiền ngay — thường chuyển chẵn (không bắt buộc)" value={payNow} onChange={setPayNow} />
          <Textarea label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => void save(true)}>
              Lưu nháp
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>Chốt đơn</Button>
          </div>
        </form>
      </Modal>

      <Modal open={receiptOpen} onClose={() => setReceiptOpen(false)} title="Nhập mua thực tế">
        <form className="space-y-3" onSubmit={(e) => void saveReceipt(e)}>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="accent-accent size-4"
              checked={linkOrder}
              onChange={(e) => {
                setLinkOrder(e.target.checked)
                if (!e.target.checked) {
                  setReceiptPoId('')
                }
              }}
            />
            Theo đơn mua?
          </label>
          {linkOrder && (
            <SearchableSelect
              label="Đơn mua (đang mở)"
              value={receiptPoId}
              onChange={onPickReceiptOrder}
              options={openOrders.map((o) => {
                const t = poTotals(o)
                return {
                  value: o.id,
                  label: `${o.code} · ${o.supplierName} · ${o.materialName}`,
                  hint: `Còn ${formatNumber(t.remainingWeight)} / ${formatMoney(t.remainingOrderAmount)}`,
                }
              })}
              placeholder="— Chọn đơn —"
              searchPlaceholder="Tìm đơn…"
              required
            />
          )}
          {!linkOrder && (
            <>
              <SearchableSelect
                label="Nhà cung cấp"
                value={rSupplierId}
                onChange={(v) => { setRSupplierId(v); if (v) setRNewSupplier('') }}
                options={activeSup.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="— Chọn NCC —"
                searchPlaceholder="Tìm NCC…"
              />
              <Input
                label="Hoặc tạo NCC mới"
                value={rNewSupplier}
                onChange={(e) => { setRNewSupplier(e.target.value); if (e.target.value) setRSupplierId('') }}
              />
              <SearchableSelect
                label="Mặt hàng"
                value={rMaterialId}
                onChange={setRMaterialId}
                options={activeMats.map((m) => ({ value: m.id, label: m.name, hint: m.unit }))}
                placeholder="— Chọn vật liệu —"
                searchPlaceholder="Tìm…"
                required
              />
            </>
          )}
          <Input label="Ngày nhập" type="date" value={rAt} onChange={(e) => setRAt(e.target.value)} required />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Số lượng" type="number" step="any" value={rQty} onChange={(e) => setRQty(e.target.value)} required />
            <MoneyInput label="Đơn giá" value={rUnitPrice} onChange={setRUnitPrice} />
          </div>
          <p className="text-sm">Thành tiền: <strong className="num">{formatMoney(previewReceiptTotal)}</strong></p>
          <Textarea label="Ghi chú" value={rNote} onChange={(e) => setRNote(e.target.value)} />
          <Button type="submit" className="w-full" disabled={busy}>Lưu nhập kho</Button>
        </form>
      </Modal>

      <Modal open={!!live} onClose={() => setDetail(null)} title={live ? `${live.code} · ${live.supplierName}` : ''} wide>
        {live && liveT && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={statusTone(live.status)}>{PURCHASE_STATUS_LABELS[live.status]}</Badge>
              <p className="text-sm text-muted">{live.materialName} · {formatDate(live.orderAt)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Bento className="p-3"><p className="text-xs text-muted">Số tiền đặt</p><p className="num font-bold">{formatMoney(liveT.orderAmount)}</p></Bento>
              <Bento className="p-3"><p className="text-xs text-muted">KL kế hoạch</p><p className="num font-bold">{formatNumber(liveT.plannedWeight)} {live.unit}</p></Bento>
              <Bento className="p-3"><p className="text-xs text-muted">Đã chuyển tiền</p><p className="num font-bold text-ok">{formatMoney(liveT.paidTotal)}</p></Bento>
              <Bento className="p-3"><p className="text-xs text-muted">Còn chuyển</p><p className="num font-bold text-warn">{formatMoney(liveT.remainingAmount)}</p></Bento>
            </div>
            <p className="text-sm">
              Đã nhập {formatNumber(liveT.receivedQty)} {live.unit} ({formatMoney(liveT.receivedAmount)})
              · Còn KL {formatNumber(liveT.remainingWeight)} · Còn tiền đặt {formatMoney(liveT.remainingOrderAmount)}
            </p>
            <p className="text-xs text-muted">Sl tính từ tiền÷ĐG: {formatNumber(liveT.plannedQty)}</p>

            {writable && live.status === 'draft' && (
              <Button disabled={busy} onClick={() => void confirmDraft(live)}>Chốt đơn</Button>
            )}

            {writable && live.status === 'open' && (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    resetReceiptForm(live)
                    setDetail(null)
                    setReceiptOpen(true)
                    setTab('nhap')
                  }}
                >
                  Nhập thực tế theo đơn này
                </Button>
                <form className="flex flex-wrap items-end gap-2" onSubmit={pay}>
                  <MoneyInput label="Chuyển tiền (thường chẵn)" value={payAmt} onChange={setPayAmt} />
                  <Input label="Ghi chú" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                  <Button type="submit" disabled={busy}>Ghi chuyển</Button>
                </form>
                {!closeAsk ? (
                  <Button variant="outline" disabled={busy} onClick={() => {
                    if (Math.abs(liveT.remainingAmount) < 0.5) void closeOrder(false)
                    else setCloseAsk(true)
                  }}>
                    Đóng đơn
                  </Button>
                ) : (
                  <div className="rounded-2xl bg-amber-50 p-3 text-sm">
                    <p className="font-semibold">
                      Còn lại {formatMoney(liveT.remainingAmount)}. Chuyển số dư sang đơn sau?
                      {liveT.remainingAmount < 0 ? ' (âm = trả thừa, sẽ trừ đơn kế)' : ''}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button disabled={busy} onClick={() => void closeOrder(true)}>Có, chuyển</Button>
                      <Button variant="outline" disabled={busy} onClick={() => void closeOrder(false)}>Không</Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {writable && (live.status === 'draft' || live.status === 'closed') && (
              <form className="flex flex-wrap items-end gap-2" onSubmit={pay}>
                <MoneyInput label="Chuyển tiền" value={payAmt} onChange={setPayAmt} />
                <Button type="submit" disabled={busy}>Ghi</Button>
              </form>
            )}

            {(live.payments || []).length > 0 && (
              <div>
                <p className="mb-1 text-sm font-semibold">Lịch sử chuyển tiền</p>
                {(live.payments || []).map((p) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span>{formatDateTime(p.paidAt)} · {p.note}</span>
                    <span className="num font-bold">{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {(live.receipts || []).length > 0 && (
              <div>
                <p className="mb-1 text-sm font-semibold">Lịch sử nhập</p>
                {(live.receipts || []).map((r) => (
                  <div key={r.id} className="flex justify-between text-sm">
                    <span>{formatDate(r.receiptAt || r.createdAt)} · {formatNumber(r.quantity)} {live.unit}</span>
                    <span className="num font-bold">{formatMoney(r.lineTotal ?? r.quantity * live.unitPrice)}</span>
                  </div>
                ))}
              </div>
            )}

            {writable && (live.status === 'draft' || live.status === 'open') && (
              <Button variant="ghost" disabled={busy} onClick={() => void cancelOrder(live)}>Huỷ đơn</Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
