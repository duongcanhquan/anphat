import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Button, DateField, Empty, Input, Modal, PageHeader, SearchableSelect, Select, Textarea } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import {
  cancelProductionOrder,
  confirmProductionOrder,
  createConfirmedProductionOrder,
  createProductionOrder,
  generateProductionCode,
  watchCustomers,
  watchFormulas,
  watchMaterials,
  watchOrders,
  watchProductionOrders,
} from '@/lib/store'
import { actualDeductQty, computeProduction } from '@/lib/production'
import type { Customer, Formula, Material, Order, ProductionItem, ProductionOrder } from '@/types'
import {
  PRODUCTION_CALC_LABELS,
  PRODUCTION_STATUS_LABELS,
  canWrite,
  getProductionSetup,
  normalizeOrderStatus,
  normalizeUnit,
} from '@/types'
import { formatDate, formatMoney, formatNumber, fromDateInputValue, toDateInputValue } from '@/lib/utils'

export function ProductionPage() {
  const { profile } = useAuth()
  const writable = canWrite(profile?.role)
  const [formulas, setFormulas] = useState<Formula[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [salesOrders, setSalesOrders] = useState<Order[]>([])
  const [runs, setRuns] = useState<ProductionOrder[]>([])
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<ProductionOrder | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const inflight = useRef(false)

  const [formulaId, setFormulaId] = useState('')
  const [qty, setQty] = useState('')
  const [stoneFactor, setStoneFactor] = useState('1.03')
  const [linkSales, setLinkSales] = useState(false)
  const [salesKey, setSalesKey] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [producedAt, setProducedAt] = useState(() => toDateInputValue(Date.now()))
  const [note, setNote] = useState('')
  const [items, setItems] = useState<ProductionItem[]>([])
  const [manual, setManual] = useState<Record<string, string>>({})
  const [percents, setPercents] = useState<Record<string, string>>({})

  useEffect(() => {
    const u1 = watchFormulas(setFormulas)
    const u2 = watchMaterials(setMaterials)
    const u3 = watchOrders(setSalesOrders)
    const u4 = watchProductionOrders(setRuns)
    const u5 = watchCustomers(setCustomers)
    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [])

  useEffect(() => {
    if (!detail) return
    const fresh = runs.find((r) => r.id === detail.id)
    if (fresh) setDetail(fresh)
  }, [runs, detail?.id])

  const formula = formulas.find((f) => f.id === formulaId)
  const G = Number(qty) || 0
  const factor = Number(stoneFactor) || 1.03

  const computed = useMemo(() => {
    const list = items.map((it, idx) => ({
      id: it.materialId + idx,
      materialId: it.materialId,
      materialName: it.materialName,
      unit: it.unit,
      calcType: it.calcType,
      percent: Number(percents[`${it.materialId}-${idx}`] ?? it.percent) || 0,
      manualQty: Number(manual[`${it.materialId}-${idx}`] ?? 0) || 0,
    }))
    return computeProduction({ quantity: G, stoneFactor: factor, items: list })
  }, [items, percents, manual, G, factor])

  const salesOptions = useMemo(() => {
    const rows: {
      key: string
      label: string
      orderId: string
      lineId: string
      code: string
      unitPrice: number
      formulaId: string
      customerId: string
      customerName: string
    }[] = []
    for (const o of salesOrders) {
      if (normalizeOrderStatus(o.status) === 'huy') continue
      for (const l of o.lines || []) {
        rows.push({
          key: `${o.id}:${l.id}`,
          label: `${o.code} · ${o.customerName} · ${l.formulaName} × ${formatNumber(l.quantity)}`,
          orderId: o.id,
          lineId: l.id,
          code: o.code,
          unitPrice: l.unitPrice,
          formulaId: l.formulaId,
          customerId: o.customerId || '',
          customerName: o.customerName || '',
        })
      }
    }
    return formulaId ? rows.filter((r) => r.formulaId === formulaId) : rows
  }, [salesOrders, formulaId])

  const loadFormula = (id: string) => {
    setFormulaId(id)
    const f = formulas.find((x) => x.id === id)
    if (!f) {
      setItems([])
      return
    }
    const setup = getProductionSetup(f)
    setItems(setup.items)
    setStoneFactor(String(setup.stoneFactor))
    const p: Record<string, string> = {}
    const m: Record<string, string> = {}
    setup.items.forEach((it, idx) => {
      p[`${it.materialId}-${idx}`] = String(it.percent || '')
      if (it.calcType === 'manual') m[`${it.materialId}-${idx}`] = ''
    })
    setPercents(p)
    setManual(m)
  }

  const onPickSales = (key: string) => {
    const sales = salesOptions.find((s) => s.key === key)
    if (!sales) {
      setSalesKey('')
      return
    }
    if (sales.formulaId && sales.formulaId !== formulaId) {
      loadFormula(sales.formulaId)
    }
    setSalesKey(key)
    setLinkSales(true)
    if (sales.customerId) setCustomerId(sales.customerId)
  }

  const shortages = computed.lines
    .filter((l) => l.quantity > 0)
    .map((l) => {
      const mat = materials.find((m) => m.id === l.materialId)
      const stock = mat?.stock || 0
      const take = actualDeductQty(stock, l.quantity)
      return { ...l, stock, take, short: l.quantity - take }
    })
    .filter((l) => l.short > 0)

  const detailShortages = useMemo(() => {
    if (!detail || detail.stockDeducted) return []
    return (detail.lines || [])
      .map((l) => {
        const stock = materials.find((m) => m.id === l.materialId)?.stock || 0
        const take = actualDeductQty(stock, l.quantity)
        return { ...l, short: l.quantity - take }
      })
      .filter((l) => l.short > 0)
  }, [detail, materials])

  const saveDraftOrConfirm = async (confirm: boolean) => {
    if (!writable || !profile || inflight.current) return
    const f = formula
    if (!f || !(G > 0) || computed.lines.length === 0) {
      setMsg('Chọn thành phẩm, nhập sản lượng, và có định mức vật liệu.')
      return
    }
    inflight.current = true
    setBusy(true)
    setMsg('')
    try {
      const sales = linkSales ? salesOptions.find((s) => s.key === salesKey) : undefined
      const cust = customers.find((c) => c.id === (sales?.customerId || customerId))
      const now = Date.now()
      const at = fromDateInputValue(producedAt)
      const lines = computed.lines.map((l) => ({
        id: l.id,
        materialId: l.materialId,
        materialName: l.materialName,
        unit: l.unit,
        calcType: l.calcType,
        percent: l.percent,
        quantity: l.quantity,
        deductedQty: 0,
      }))
      const payload = {
        code: generateProductionCode(new Date(at)),
        formulaId: f.id,
        formulaName: f.name,
        quantity: G,
        stoneFactor: factor,
        customerId: cust?.id || sales?.customerId || '',
        customerName: cust?.name || sales?.customerName || '',
        salesOrderId: sales?.orderId || '',
        salesOrderCode: sales?.code || '',
        salesOrderLineId: sales?.lineId || '',
        salesUnitPrice: sales?.unitPrice || 0,
        lines,
        status: 'draft' as const,
        stockDeducted: false,
        confirmedAt: undefined,
        producedAt: at,
        note: note.trim(),
        createdAt: now,
        updatedAt: now,
        createdBy: profile.id,
        createdByName: profile.displayName,
      }
      if (confirm) {
        await createConfirmedProductionOrder(payload, {
          orderCode: payload.code,
          createdBy: profile.id,
          createdByName: profile.displayName,
          note: `Xuất SX ${payload.code}`,
        })
      } else {
        await createProductionOrder(payload)
      }
      setOpen(false)
      setMsg(confirm ? 'Đã chốt lệnh và trừ kho.' : 'Đã lưu nháp.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không lưu lệnh SX.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const confirmRun = async (run: ProductionOrder) => {
    if (!writable || !profile || inflight.current) return
    if (run.status === 'huy') return
    if (run.status === 'confirmed' && run.stockDeducted) return
    inflight.current = true
    setBusy(true)
    try {
      await confirmProductionOrder(run.id, {
        orderCode: run.code,
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      setMsg('Đã chốt và trừ kho.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không chốt được lệnh SX.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const cancelRun = async (run: ProductionOrder) => {
    if (!writable || !profile || inflight.current) return
    if (!confirm(`Huỷ lệnh ${run.code}?`)) return
    if (run.status === 'confirmed' && profile.role !== 'superadmin') {
      setMsg('Chỉ Superadmin huỷ lệnh đã chốt.')
      return
    }
    inflight.current = true
    setBusy(true)
    try {
      await cancelProductionOrder(run.id, {
        note: `Hoàn kho huỷ ${run.code}`,
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      setDetail(null)
      setMsg('Đã huỷ lệnh.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không huỷ được lệnh SX.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Sản xuất"
        subtitle="Định mức % · trừ kho vật liệu · gắn đơn bán (không bắt buộc)"
        action={
          writable ? (
            <Button onClick={() => {
              setFormulaId('')
              setQty('')
              setItems([])
              setCustomerId('')
              setLinkSales(false)
              setSalesKey('')
              setProducedAt(toDateInputValue(Date.now()))
              setOpen(true)
            }}>
              <Plus size={18} /> Lệnh SX mới
            </Button>
          ) : undefined
        }
      />
      {msg && <p className="mb-3 text-sm font-medium text-info">{msg}</p>}

      {runs.length === 0 ? (
        <Empty text="Chưa có lệnh sản xuất. Vào Cài đặt → Sản phẩm để khai định mức % trước." />
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <button
              key={r.id}
              type="button"
              className="bento w-full p-4 text-left"
              onClick={() => setDetail(r)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.formulaName} × {formatNumber(r.quantity)}</p>
                  <p className="text-xs text-muted">
                    {r.code} · {formatDate(r.producedAt || r.createdAt)}
                    {r.customerName ? ` · ${r.customerName}` : ''}
                    {r.salesOrderCode ? ` · Đơn ${r.salesOrderCode}` : ' · Không gắn đơn'}
                  </p>
                </div>
                <Badge tone={r.status === 'confirmed' ? 'ok' : r.status === 'huy' ? 'danger' : 'info'}>
                  {PRODUCTION_STATUS_LABELS[r.status]}
                </Badge>
              </div>
              {r.salesUnitPrice ? (
                <p className="mt-1 text-sm">Đã thực hiện: <strong className="num">{formatMoney(r.quantity * r.salesUnitPrice)}</strong></p>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Lệnh sản xuất" wide>
        <div className="space-y-3">
          <SearchableSelect
            label="Thành phẩm"
            value={formulaId}
            onChange={(id) => {
              loadFormula(id)
              setSalesKey('')
              setLinkSales(false)
            }}
            options={formulas.filter((f) => f.active !== false).map((f) => ({
              value: f.id,
              label: f.name,
              hint: normalizeUnit(f.unit),
            }))}
            placeholder="— Chọn thành phẩm —"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Sản lượng" type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
            <Input label="Hệ số đá" type="number" step="any" value={stoneFactor} onChange={(e) => setStoneFactor(e.target.value)} />
          </div>
          <DateField label="Ngày sản xuất" value={producedAt} onChange={setProducedAt} required />
          <SearchableSelect
            label="Khách hàng"
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="— Chọn khách (không bắt buộc) —"
            searchPlaceholder="Tìm khách…"
            disabled={linkSales && !!salesKey}
          />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="accent-accent size-4"
              checked={linkSales}
              onChange={(e) => {
                setLinkSales(e.target.checked)
                if (!e.target.checked) setSalesKey('')
              }}
            />
            Theo đơn bán?
          </label>
          {linkSales && (
            <Select label="Đơn bán / dòng SP" value={salesKey} onChange={(e) => onPickSales(e.target.value)}>
              <option value="">— Chọn đơn —</option>
              {salesOptions.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </Select>
          )}
          {items.length === 0 && formulaId && (
            <p className="text-sm text-warn">Thành phẩm chưa có định mức SX. Vào Cài đặt → Sản phẩm để thêm vật liệu (nhựa/đá/tỷ lệ/nhập tay).</p>
          )}
          {computed.lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-1">Vật liệu</th>
                    <th>Kiểu</th>
                    <th>%</th>
                    <th>Sl tính</th>
                    <th>Tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.lines.map((l, idx) => {
                    const mat = materials.find((m) => m.id === l.materialId)
                    const key = `${l.materialId}-${idx}`
                    return (
                      <tr key={key} className="border-t border-line/60">
                        <td className="py-1.5">{l.materialName}</td>
                        <td>{PRODUCTION_CALC_LABELS[l.calcType]}</td>
                        <td>
                          {l.calcType === 'manual' ? (
                            <Input type="number" step="any" value={manual[key] || ''} onChange={(e) => setManual((p) => ({ ...p, [key]: e.target.value }))} />
                          ) : (
                            <Input type="number" step="any" value={percents[key] || ''} onChange={(e) => setPercents((p) => ({ ...p, [key]: e.target.value }))} />
                          )}
                        </td>
                        <td className="num font-semibold">{formatNumber(l.quantity, l.calcType === 'stone' ? 4 : 2)} {l.unit}</td>
                        <td className="num">{formatNumber(mat?.stock || 0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {shortages.length > 0 && (
            <p className="text-sm text-warn">
              Thiếu hàng: {shortages.map((s) => `${s.materialName} thiếu ${formatNumber(s.short)}`).join(', ')}. Vẫn cho chốt — tồn không xuống âm. Điều chỉnh công thức lúc xuất bán nếu cần khớp kho.
            </p>
          )}
          <Textarea label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => void saveDraftOrConfirm(false)}>Lưu nháp</Button>
            <Button type="button" className="flex-1" disabled={busy} onClick={() => void saveDraftOrConfirm(true)}>Chốt và trừ kho</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.code : ''}>
        {detail && (
          <div className="space-y-3">
            <Badge tone={detail.status === 'confirmed' ? 'ok' : detail.status === 'huy' ? 'danger' : 'info'}>
              {PRODUCTION_STATUS_LABELS[detail.status]}
            </Badge>
            <p className="font-semibold">{detail.formulaName} × {formatNumber(detail.quantity)}</p>
            <p className="text-sm text-muted">
              Ngày {formatDate(detail.producedAt || detail.createdAt)} · Hệ số đá {detail.stoneFactor}
              {detail.customerName ? ` · ${detail.customerName}` : ''}
              {' · '}{detail.salesOrderCode || 'Không gắn đơn'}
            </p>
            <div className="space-y-1 text-sm">
              {(detail.lines || []).map((l) => (
                <div key={l.id} className="flex justify-between gap-2">
                  <span>{l.materialName}</span>
                  <span className="num">
                    {formatNumber(l.quantity)} {l.unit}
                    {l.deductedQty != null ? ` · trừ ${formatNumber(l.deductedQty)}` : ''}
                  </span>
                </div>
              ))}
            </div>
            {writable && (detail.status === 'draft' || (detail.status === 'confirmed' && !detail.stockDeducted)) && (
              <>
                {detailShortages.length > 0 && (
                  <p className="text-sm text-warn">
                    Thiếu hàng: {detailShortages.map((s) => `${s.materialName} thiếu ${formatNumber(s.short)}`).join(', ')}. Vẫn cho chốt — tồn không xuống âm.
                  </p>
                )}
                <Button disabled={busy} onClick={() => void confirmRun(detail)}>Chốt và trừ kho</Button>
              </>
            )}
            {writable && detail.status !== 'huy' && (
              <Button variant="ghost" disabled={busy} onClick={() => void cancelRun(detail)}>Huỷ lệnh</Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
