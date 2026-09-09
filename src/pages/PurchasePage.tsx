import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Bento, Button, Empty, Input, Modal, PageHeader, SearchableSelect, Textarea } from '@/components/ui'
import { MoneyInput } from '@/components/MoneyInput'
import { useAuth } from '@/contexts/AuthContext'
import {
  addPurchasePayment,
  cancelPurchaseOrder,
  closePurchaseOrder,
  confirmDraftPurchaseOrder,
  createOpenPurchaseOrder,
  createPurchaseOrder,
  createSupplier,
  generatePurchaseCode,
  getSupplier,
  receivePurchaseOrder,
  watchMaterials,
  watchPurchaseOrders,
  watchSuppliers,
} from '@/lib/store'
import { canReceiveQty, purchaseLineTotal, purchaseTotals } from '@/lib/purchase'
import type { Material, PurchaseOrder, PurchasePayment, PurchaseReceipt, Supplier } from '@/types'
import { PURCHASE_STATUS_LABELS, canWrite } from '@/types'
import { formatDateTime, formatMoney, formatNumber, uid } from '@/lib/utils'

function statusTone(s: PurchaseOrder['status']): 'info' | 'warn' | 'ok' | 'danger' {
  if (s === 'open') return 'warn'
  if (s === 'closed') return 'ok'
  if (s === 'huy') return 'danger'
  return 'info'
}

export function PurchasePage() {
  const { profile } = useAuth()
  const writable = canWrite(profile?.role)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<PurchaseOrder | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | PurchaseOrder['status']>('all')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const inflight = useRef(false)

  const [supplierId, setSupplierId] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState(0)
  const [note, setNote] = useState('')
  const [payNow, setPayNow] = useState(0)

  const [recvQty, setRecvQty] = useState('')
  const [payAmt, setPayAmt] = useState(0)
  const [payNote, setPayNote] = useState('')
  const [closeAsk, setCloseAsk] = useState(false)

  useEffect(() => {
    const u1 = watchSuppliers(setSuppliers)
    const u2 = watchMaterials(setMaterials)
    const u3 = watchPurchaseOrders(setOrders)
    return () => { u1(); u2(); u3() }
  }, [])

  useEffect(() => {
    if (!detail) return
    const fresh = orders.find((o) => o.id === detail.id)
    if (fresh) setDetail(fresh)
  }, [orders, detail?.id])

  const live = detail ? orders.find((o) => o.id === detail.id) || detail : null
  const liveT = live
    ? purchaseTotals({
        quantity: live.quantity,
        unitPrice: live.unitPrice,
        carriedIn: live.carriedIn || 0,
        carriedOut: live.carriedOut || 0,
        payments: live.payments || [],
        receipts: live.receipts || [],
      })
    : null

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return orders
    return orders.filter((o) => o.status === filterStatus)
  }, [orders, filterStatus])

  const activeMats = materials.filter((m) => m.active)
  const activeSup = suppliers.filter((s) => s.active !== false)

  const resetForm = () => {
    setSupplierId('')
    setNewSupplierName('')
    setMaterialId('')
    setQuantity('')
    setUnitPrice(0)
    setNote('')
    setPayNow(0)
  }

  const ensureSupplier = async (): Promise<Supplier | null> => {
    if (supplierId) return suppliers.find((s) => s.id === supplierId) || (await getSupplier(supplierId))
    const name = newSupplierName.trim()
    if (!name) return null
    const now = Date.now()
    const id = await createSupplier({
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
      id,
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

  const save = async (asDraft: boolean) => {
    if (!writable || !profile || inflight.current) return
    const mat = activeMats.find((m) => m.id === materialId)
    const qty = Number(quantity)
    if (!supplierId && !newSupplierName.trim()) {
      setMsg('Chọn hoặc nhập tên nhà cung cấp.')
      return
    }
    if (!mat || !(qty > 0) || !(unitPrice > 0)) {
      setMsg('Chọn vật liệu, số lượng và đơn giá > 0.')
      return
    }
    inflight.current = true
    setBusy(true)
    setMsg('')
    try {
      const sup = await ensureSupplier()
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
              paidAt: Date.now(),
              createdBy: profile.id,
              createdByName: profile.displayName,
            }]
          : []
      const lineTotal = purchaseLineTotal(qty, unitPrice)
      const now = Date.now()
      const payload = {
        code: generatePurchaseCode(),
        supplierId: sup.id,
        supplierName: sup.name,
        materialId: mat.id,
        materialName: mat.name,
        unit: mat.unit,
        quantity: qty,
        unitPrice,
        lineTotal,
        carriedIn: 0,
        carriedFromOrderId: '',
        carriedOut: 0,
        payments,
        receipts: [] as PurchaseReceipt[],
        status: asDraft ? ('draft' as const) : ('open' as const),
        note: note.trim(),
        orderAt: now,
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

  const receive = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable || !profile || !live || live.status !== 'open' || inflight.current) return
    const n = Number(recvQty)
    const rec = live.receipts || []
    const received = rec.reduce((s, r) => s + r.quantity, 0)
    if (!canReceiveQty(live.quantity, received, n)) {
      setMsg('Số nhận không hợp lệ (phải > 0 và không vượt sl đặt).')
      return
    }
    const mat = materials.find((m) => m.id === live.materialId)
    if (!mat) return
    inflight.current = true
    setBusy(true)
    try {
      await receivePurchaseOrder(
        live.id,
        n,
        {
          id: uid(),
          quantity: n,
          createdAt: Date.now(),
          createdBy: profile.id,
          createdByName: profile.displayName,
        },
        {
          materialId: live.materialId,
          materialName: live.materialName,
          quantity: n,
          unit: live.unit,
          cost: n * live.unitPrice,
          contractor: live.supplierName,
          note: `Nhận đơn ${live.code}`,
          createdAt: Date.now(),
          createdBy: profile.id,
          createdByName: profile.displayName,
          type: 'import',
          purchaseOrderId: live.id,
          orderCode: live.code,
          supplierId: live.supplierId,
        },
      )
      setRecvQty('')
      setMsg(`Đã nhập kho ${formatNumber(n)} ${live.unit}.`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không nhận hàng được.')
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

  const previewLine = purchaseLineTotal(Number(quantity) || 0, unitPrice)

  return (
    <div>
      <PageHeader
        title="Mua hàng"
        subtitle="Đơn mua vật liệu · nhận kho · chuyển tiền NCC"
        action={
          writable ? (
            <Button onClick={() => { resetForm(); setOpen(true) }}>
              <Plus size={18} /> Đơn mua mới
            </Button>
          ) : undefined
        }
      />
      {msg && <p className="mb-3 text-sm font-medium text-info">{msg}</p>}

      <div className="mb-3 flex flex-wrap gap-2">
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
            const t = purchaseTotals({
              quantity: o.quantity,
              unitPrice: o.unitPrice,
              carriedIn: o.carriedIn || 0,
              carriedOut: o.carriedOut || 0,
              payments: o.payments || [],
              receipts: o.receipts || [],
            })
            return (
              <button
                key={o.id}
                type="button"
                className="bento w-full p-4 text-left"
                onClick={() => { setDetail(o); setRecvQty(''); setPayAmt(0); setCloseAsk(false) }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{o.supplierName}</p>
                    <p className="text-xs text-muted">
                      {o.code} · {o.materialName} · {formatDateTime(o.orderAt)}
                    </p>
                  </div>
                  <Badge tone={statusTone(o.status)}>{PURCHASE_STATUS_LABELS[o.status]}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <p>Đặt: <strong className="num">{formatNumber(o.quantity)} {o.unit}</strong></p>
                  <p>Nhận: <strong className="num">{formatNumber(t.receivedQty)}</strong></p>
                  <p>Tổng: <strong className="num">{formatMoney(t.totalAmount)}</strong></p>
                  <p>Còn lại: <strong className="num text-warn">{formatMoney(t.remainingAmount)}</strong></p>
                </div>
              </button>
            )
          })}
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
          <div className="grid grid-cols-2 gap-2">
            <Input label="Số lượng đặt" type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            <MoneyInput label="Đơn giá" value={unitPrice} onChange={setUnitPrice} />
          </div>
          <p className="text-sm">Thành tiền: <strong className="num">{formatMoney(previewLine)}</strong></p>
          <MoneyInput label="Chuyển tiền ngay (không bắt buộc)" value={payNow} onChange={setPayNow} />
          <Textarea label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => void save(true)}>
              Lưu nháp
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>Chốt đơn</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!live} onClose={() => setDetail(null)} title={live ? `${live.code} · ${live.supplierName}` : ''} wide>
        {live && liveT && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={statusTone(live.status)}>{PURCHASE_STATUS_LABELS[live.status]}</Badge>
              <p className="text-sm text-muted">{live.materialName} · {formatDateTime(live.orderAt)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Bento className="p-3"><p className="text-xs text-muted">Thành tiền</p><p className="num font-bold">{formatMoney(liveT.lineTotal)}</p></Bento>
              <Bento className="p-3"><p className="text-xs text-muted">Số dư chuyển vào</p><p className="num font-bold">{formatMoney(live.carriedIn || 0)}</p></Bento>
              <Bento className="p-3"><p className="text-xs text-muted">Đã chuyển</p><p className="num font-bold text-ok">{formatMoney(liveT.paidTotal)}</p></Bento>
              <Bento className="p-3"><p className="text-xs text-muted">Còn lại</p><p className="num font-bold text-warn">{formatMoney(liveT.remainingAmount)}</p></Bento>
            </div>
            <p className="text-sm">
              Đặt {formatNumber(live.quantity)} {live.unit} · Đã nhận {formatNumber(liveT.receivedQty)} · Còn nhận {formatNumber(liveT.remainingQty)}
            </p>

            {writable && live.status === 'draft' && (
              <Button disabled={busy} onClick={() => void confirmDraft(live)}>Chốt đơn</Button>
            )}

            {writable && live.status === 'open' && (
              <>
                <form className="flex flex-wrap items-end gap-2" onSubmit={receive}>
                  <Input label="Nhận hàng (sl)" type="number" step="any" value={recvQty} onChange={(e) => setRecvQty(e.target.value)} />
                  <Button type="submit" disabled={busy}>Nhập kho</Button>
                </form>
                <form className="flex flex-wrap items-end gap-2" onSubmit={pay}>
                  <MoneyInput label="Chuyển tiền" value={payAmt} onChange={setPayAmt} />
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
                    <p className="mt-1 text-xs text-muted">Không chuyển: số dư ở lại đơn này — vẫn ghi chuyển tiền sau khi đóng.</p>
                    <div className="mt-2 flex gap-2">
                      <Button disabled={busy} onClick={() => void closeOrder(true)}>Có, chuyển</Button>
                      <Button variant="outline" disabled={busy} onClick={() => void closeOrder(false)}>Không</Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {writable && live.status === 'draft' && (
              <form className="flex flex-wrap items-end gap-2" onSubmit={pay}>
                <MoneyInput label="Chuyển tiền (nháp, vào sổ khi chốt)" value={payAmt} onChange={setPayAmt} />
                <Button type="submit" disabled={busy}>Ghi</Button>
              </form>
            )}

            {writable && live.status === 'closed' && (
              <form className="flex flex-wrap items-end gap-2" onSubmit={pay}>
                <MoneyInput label="Chuyển tiền (đơn đã đóng, số dư ở lại đơn này)" value={payAmt} onChange={setPayAmt} />
                <Button type="submit" disabled={busy}>Ghi chuyển</Button>
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

            {writable && (live.status === 'draft' || live.status === 'open') && (
              <Button variant="ghost" disabled={busy} onClick={() => void cancelOrder(live)}>Huỷ đơn</Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
