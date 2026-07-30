import { useEffect, useMemo, useState } from 'react'
import { Camera, Plus, Trash2, Lock, Search } from 'lucide-react'
import {
  Badge,
  Bento,
  Button,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import {
  createOrder,
  deductStock,
  generateOrderCode,
  getSettings,
  updateCustomer,
  updateFormula,
  updateOrder,
  watchCustomers,
  watchFormulas,
  watchOrders,
} from '@/lib/store'
import type {
  Customer,
  Formula,
  FormulaItem,
  Order,
  OrderLine,
  OrderLineExtra,
  OrderStatus,
} from '@/types'
import { ORDER_STATUS_LABELS, WEIGHT_UNITS, calcLineTotal, canUnlockOrder, canWrite } from '@/types'
import { formatDateTime, formatMoney, formatNumber, uid } from '@/lib/utils'

type SalesTab = 'tinh-nhanh' | 'ban-khach' | 'don'

function emptyLine(f?: Formula): OrderLine {
  return {
    id: uid(),
    formulaId: f?.id || '',
    formulaName: f?.name || '',
    quantity: 1,
    unit: f?.unit || 'TẤN',
    unitPrice: f?.unitPrice || 0,
    items: f ? f.items.map((i) => ({ ...i })) : [],
    extras: [],
    lineTotal: f ? f.unitPrice : 0,
    status: 'dat_hang',
    note: '',
  }
}

export function SalesPage() {
  const { profile } = useAuth()
  const writable = canWrite(profile?.role)
  const [tab, setTab] = useState<SalesTab>('tinh-nhanh')
  const [formulas, setFormulas] = useState<Formula[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])

  // draft order
  const [lines, setLines] = useState<OrderLine[]>([emptyLine()])
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [deposit, setDeposit] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [contractAmount, setContractAmount] = useState('')
  const [note, setNote] = useState('')
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('dat_hang')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [ratioModal, setRatioModal] = useState<{ lineId: string; items: FormulaItem[] } | null>(null)
  const [historyPick, setHistoryPick] = useState<{ lineId: string; formula: Formula } | null>(null)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [shotMode, setShotMode] = useState(false)

  useEffect(() => {
    const u1 = watchFormulas(setFormulas)
    const u2 = watchCustomers(setCustomers)
    const u3 = watchOrders(setOrders)
    return () => {
      u1()
      u2()
      u3()
    }
  }, [])

  const activeFormulas = formulas.filter((f) => f.active)
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.taxCode.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.representative.toLowerCase().includes(q),
    )
  }, [customers, customerSearch])
  const totalAmount = useMemo(() => lines.reduce((s, l) => s + l.lineTotal, 0), [lines])
  const depositNum = Number(deposit) || 0
  const paidNum = Number(paidAmount) || 0
  const debt = Math.max(0, totalAmount - depositNum - paidNum)

  const materialNeed = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; qty: number }>()
    for (const line of lines) {
      for (const item of line.items) {
        const key = item.materialId
        const cur = map.get(key) || { name: item.materialName, unit: item.unit, qty: 0 }
        cur.qty += item.quantityPerUnit * line.quantity
        map.set(key, cur)
      }
    }
    return [...map.values()]
  }, [lines])

  const updateLine = (id: string, patch: Partial<OrderLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        const next = { ...l, ...patch }
        next.lineTotal = calcLineTotal(next.quantity, next.unitPrice, next.extras)
        return next
      }),
    )
  }

  const pickFormula = (lineId: string, formulaId: string) => {
    const f = formulas.find((x) => x.id === formulaId)
    if (!f) return
    if (f.history?.length) {
      setHistoryPick({ lineId, formula: f })
      return
    }
    applyFormula(lineId, f, f.items)
  }

  const applyFormula = (lineId: string, f: Formula, items: FormulaItem[], historyId?: string) => {
    updateLine(lineId, {
      formulaId: f.id,
      formulaName: f.name,
      unit: f.unit,
      unitPrice: f.unitPrice,
      items: items.map((i) => ({ ...i })),
      usedHistoryId: historyId,
    })
  }

  const saveNewRatio = async (lineId: string, items: FormulaItem[]) => {
    const line = lines.find((l) => l.id === lineId)
    const f = formulas.find((x) => x.id === line?.formulaId)
    if (!f || !profile) return
    const version = {
      id: uid(),
      label: `Tỷ lệ ${new Date().toLocaleString('vi-VN')}`,
      items: items.map((i) => ({ ...i })),
      createdAt: Date.now(),
      createdBy: profile.id,
    }
    await updateFormula(f.id, {
      items: items.map((i) => ({ ...i })),
      history: [...(f.history || []), version],
    })
    updateLine(lineId, { items, usedHistoryId: version.id })
    setRatioModal(null)
  }

  const addExtra = (lineId: string) => {
    const line = lines.find((l) => l.id === lineId)
    if (!line) return
    const extras: OrderLineExtra[] = [
      ...line.extras,
      { id: uid(), label: 'VAT / Chiết khấu', amount: 0, type: 'vat' },
    ]
    updateLine(lineId, { extras })
  }

  const confirmOrder = async (asCustomer: boolean) => {
    if (!writable || !profile) return
    setBusy(true)
    setMessage('')
    try {
      const cust = customers.find((c) => c.id === customerId)
      if (asCustomer && !cust) {
        setMessage('Chọn khách hàng trước khi chốt đơn.')
        setBusy(false)
        return
      }
      if (lines.some((l) => !l.formulaId)) {
        setMessage('Mỗi dòng cần chọn thành phẩm.')
        setBusy(false)
        return
      }

      const deductItems: { materialId: string; quantity: number }[] = []
      for (const line of lines) {
        if (line.items.length > 0) {
          for (const item of line.items) {
            deductItems.push({
              materialId: item.materialId,
              quantity: item.quantityPerUnit * line.quantity,
            })
          }
        }
      }
      if (deductItems.length > 0) await deductStock(deductItems)

      const order: Omit<Order, 'id'> = {
        code: generateOrderCode(),
        customerId: cust?.id || null,
        customerName: cust?.name || 'Tính nhanh',
        lines,
        deposit: depositNum,
        paidAmount: paidNum,
        contractAmount: Number(contractAmount) || 0,
        debt,
        totalAmount,
        status: orderStatus,
        locked: false,
        contractExported: false,
        note,
        orderAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: profile.id,
      }
      const id = await createOrder(order)

      if (cust) {
        await updateCustomer(cust.id, {
          totalPurchased: (cust.totalPurchased || 0) + totalAmount,
          totalDebt: (cust.totalDebt || 0) + debt,
        })
      }

      setMessage(`Đã chốt đơn ${order.code}`)
      setLines([emptyLine()])
      setDeposit('')
      setPaidAmount('')
      setContractAmount('')
      setNote('')
      setCustomerId('')
      setTab('don')
      const created = { ...order, id }
      setDetailOrder(created)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lỗi chốt đơn')
    } finally {
      setBusy(false)
    }
  }

  const lockAndConfirm = async (order: Order) => {
    if (!writable || !profile) return
    if (order.locked && !canUnlockOrder(profile.role)) {
      setMessage('Đơn đã khoá — chỉ Superadmin được sửa.')
      return
    }
    await updateOrder(order.id, {
      locked: true,
      confirmedAt: Date.now(),
      confirmedBy: profile.id,
    })
    setDetailOrder({ ...order, locked: true, confirmedAt: Date.now(), confirmedBy: profile.id })
    setMessage('Đã xác nhận đơn — Admin không thể sửa nữa.')
  }

  const exportContract = async (order: Order) => {
    if (!writable) return
    const settings = await getSettings()
    if (!settings.n8nEnabled || !settings.n8nWebhookUrl) {
      setMessage('Chưa cấu hình n8n. Vào Cài đặt → Khác để điền webhook.')
      return
    }
    try {
      await fetch(settings.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'contract',
          company: settings,
          order,
        }),
      })
      await updateOrder(order.id, { contractExported: true, locked: true })
      setMessage('Đã gửi yêu cầu xuất hợp đồng tới n8n.')
    } catch {
      setMessage('Không gửi được tới n8n. Kiểm tra URL webhook / CORS.')
    }
  }

  const changeOrderStatus = async (order: Order, status: OrderStatus) => {
    if (!writable) return
    if (order.locked && !canUnlockOrder(profile?.role)) {
      setMessage('Đơn đã khoá.')
      return
    }
    await updateOrder(order.id, { status })
    setDetailOrder({ ...order, status })
  }

  const captureHint = () => {
    setShotMode(true)
    setTimeout(() => setShotMode(false), 4000)
  }

  return (
    <div>
      <PageHeader title="Bán hàng" subtitle="Tính nhanh hoặc lên đơn cho khách" />
      <Tabs
        tabs={[
          { id: 'tinh-nhanh', label: 'Tính nhanh' },
          { id: 'ban-khach', label: 'Khách hàng' },
          { id: 'don', label: 'Đơn hàng' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as SalesTab)}
      />

      {(tab === 'tinh-nhanh' || tab === 'ban-khach') && (
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            {tab === 'ban-khach' && (
              <Bento title="Danh sách khách hàng">
                <div className="mb-3 flex gap-2">
                  <div className="flex-1">
                    <Input
                      label="Tìm khách hàng"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Tên, MST, SĐT…"
                      disabled={!writable}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="outline" className="h-[42px]" disabled={!writable}>
                      <Search size={16} /> Search
                    </Button>
                  </div>
                </div>
                <Select
                  label="Chọn khách"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  disabled={!writable}
                >
                  <option value="">— Chọn khách hàng —</option>
                  {filteredCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.taxCode ? `(${c.taxCode})` : ''}
                    </option>
                  ))}
                </Select>
                {customerSearch.trim() && filteredCustomers.length === 0 && (
                  <p className="mt-2 text-sm text-muted">Không tìm thấy khách phù hợp.</p>
                )}
              </Bento>
            )}

            {lines.map((line, idx) => (
              <Bento
                key={line.id}
                title={`Thành phẩm ${idx + 1}`}
                action={
                  lines.length > 1 && writable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLines((p) => p.filter((l) => l.id !== line.id))}
                    >
                      <Trash2 size={16} />
                    </Button>
                  ) : undefined
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Thành phẩm / Công thức"
                    value={line.formulaId}
                    disabled={!writable}
                    onChange={(e) => pickFormula(line.id, e.target.value)}
                  >
                    <option value="">— Chọn —</option>
                    {activeFormulas.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label={`Số lượng (${line.unit})`}
                    type="number"
                    step="any"
                    min="0"
                    value={line.quantity}
                    disabled={!writable}
                    onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) || 0 })}
                  />
                  <Input
                    label="Đơn giá"
                    type="number"
                    step="any"
                    value={line.unitPrice}
                    disabled={!writable}
                    onChange={(e) => updateLine(line.id, { unitPrice: Number(e.target.value) || 0 })}
                  />
                  <div className="flex items-end">
                    <p className="num text-xl font-extrabold text-accent">
                      {formatMoney(line.lineTotal)}
                    </p>
                  </div>
                </div>

                {line.items.length > 0 && (
                  <div className="mt-3 rounded-2xl bg-surface/80 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Tỷ lệ vật liệu / 1 {line.unit}</p>
                      {writable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRatioModal({ lineId: line.id, items: line.items.map((i) => ({ ...i })) })}
                        >
                          Đổi tỷ lệ
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {line.items.map((item) => (
                        <div key={item.materialId} className="flex justify-between text-sm">
                          <span>{item.materialName}</span>
                          <span className="num font-semibold">
                            {formatNumber(item.quantityPerUnit)} {item.unit}
                            <span className="ml-2 text-muted">
                              → {formatNumber(item.quantityPerUnit * line.quantity)} {item.unit}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">VAT / Chiết khấu / Phụ phí</p>
                    {writable && (
                      <Button size="sm" variant="ghost" onClick={() => addExtra(line.id)}>
                        <Plus size={14} /> Thêm
                      </Button>
                    )}
                  </div>
                  {line.extras.map((ex) => (
                    <div key={ex.id} className="grid grid-cols-[1fr_100px_90px_36px] gap-2">
                      <Input
                        value={ex.label}
                        disabled={!writable}
                        onChange={(e) =>
                          updateLine(line.id, {
                            extras: line.extras.map((x) =>
                              x.id === ex.id ? { ...x, label: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <Select
                        value={ex.type}
                        disabled={!writable}
                        onChange={(e) =>
                          updateLine(line.id, {
                            extras: line.extras.map((x) =>
                              x.id === ex.id
                                ? { ...x, type: e.target.value as OrderLineExtra['type'] }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="vat">VAT</option>
                        <option value="discount">Chiết khấu</option>
                        <option value="fee">Phí</option>
                        <option value="other">Khác</option>
                      </Select>
                      <Input
                        type="number"
                        value={ex.amount}
                        disabled={!writable}
                        onChange={(e) =>
                          updateLine(line.id, {
                            extras: line.extras.map((x) =>
                              x.id === ex.id ? { ...x, amount: Number(e.target.value) || 0 } : x,
                            ),
                          })
                        }
                      />
                      {writable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            updateLine(line.id, {
                              extras: line.extras.filter((x) => x.id !== ex.id),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Bento>
            ))}

            {writable && (
              <Button variant="outline" className="w-full" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus size={16} /> Thêm thành phẩm
              </Button>
            )}
          </div>

          <div className="space-y-3 lg:col-span-2">
            <Bento
              title="Kết quả tính"
              className={shotMode ? 'ring-4 ring-accent' : undefined}
              subtitle={shotMode ? 'Chụp màn hình ngay — khung đang nổi bật' : 'Vật liệu cần dùng'}
            >
              {materialNeed.length === 0 ? (
                <Empty text="Chọn thành phẩm để xem vật liệu cần." />
              ) : (
                <div className="space-y-2">
                  {materialNeed.map((m) => (
                    <div key={m.name + m.unit} className="flex justify-between rounded-xl bg-surface px-3 py-2">
                      <span className="font-medium">{m.name}</span>
                      <span className="num font-bold">
                        {formatNumber(m.qty)} {m.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-xs uppercase tracking-wider text-muted">Tổng tiền</p>
                <p className="num text-3xl font-extrabold text-accent">{formatMoney(totalAmount)}</p>
              </div>
            </Bento>

            <Bento title="Thanh toán & trạng thái">
              <div className="grid gap-3">
                <Input
                  label="Đặt cọc"
                  type="number"
                  value={deposit}
                  disabled={!writable}
                  onChange={(e) => setDeposit(e.target.value)}
                />
                <Input
                  label="Đã thanh toán"
                  type="number"
                  value={paidAmount}
                  disabled={!writable}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
                <Input
                  label="Tiền hợp đồng (ghi nhận)"
                  type="number"
                  value={contractAmount}
                  disabled={!writable}
                  onChange={(e) => setContractAmount(e.target.value)}
                />
                <Select
                  label="Trạng thái"
                  value={orderStatus}
                  disabled={!writable}
                  onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}
                >
                  {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <Textarea label="Ghi chú đơn" value={note} disabled={!writable} onChange={(e) => setNote(e.target.value)} />
                <p className="text-sm">
                  Công nợ ước tính: <strong className="num text-warn">{formatMoney(debt)}</strong>
                </p>
              </div>
            </Bento>

            {writable && (
              <div className="grid gap-2">
                <Button size="lg" disabled={busy} onClick={() => confirmOrder(tab === 'ban-khach')}>
                  {busy ? 'Đang chốt…' : tab === 'ban-khach' ? 'Chốt đơn cho khách' : 'Chốt kết quả tính'}
                </Button>
                {tab === 'tinh-nhanh' && (
                  <Button variant="outline" onClick={() => { setTab('ban-khach'); }}>
                    Tiếp: chọn khách xuất hoá đơn
                  </Button>
                )}
                <Button variant="secondary" onClick={captureHint}>
                  <Camera size={16} /> Chụp kết quả tính
                </Button>
              </div>
            )}
            {message && <p className="text-sm font-medium text-info">{message}</p>}
          </div>
        </div>
      )}

      {tab === 'don' && (
        <div className="space-y-2">
          {orders.length === 0 ? (
            <Empty text="Chưa có đơn hàng." />
          ) : (
            orders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setDetailOrder(o)}
                className="bento flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-surface-2/40"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display font-bold">{o.code}</p>
                    {o.locked && <Badge tone="warn"><Lock size={10} className="mr-1 inline" />Khoá</Badge>}
                    <Badge tone="accent">{ORDER_STATUS_LABELS[o.status]}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted">
                    {o.customerName} · {formatDateTime(o.orderAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {o.lines.map((l) => `${l.formulaName}×${formatNumber(l.quantity)}`).join(' · ')}
                  </p>
                </div>
                <p className="num shrink-0 text-lg font-extrabold">{formatMoney(o.totalAmount)}</p>
              </button>
            ))
          )}
        </div>
      )}

      {/* History ratio pick */}
      <Modal
        open={!!historyPick}
        onClose={() => {
          if (historyPick) applyFormula(historyPick.lineId, historyPick.formula, historyPick.formula.items)
          setHistoryPick(null)
        }}
        title="Dùng tỷ lệ nào?"
      >
        {historyPick && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Công thức có lịch sử tỷ lệ. Chọn tỷ lệ hiện tại hoặc một bản đã lưu.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                applyFormula(historyPick.lineId, historyPick.formula, historyPick.formula.items)
                setHistoryPick(null)
              }}
            >
              Dùng tỷ lệ hiện tại
            </Button>
            {(historyPick.formula.history || []).slice().reverse().map((h) => (
              <Button
                key={h.id}
                variant="outline"
                className="w-full"
                onClick={() => {
                  applyFormula(historyPick.lineId, historyPick.formula, h.items, h.id)
                  setHistoryPick(null)
                }}
              >
                {h.label}
              </Button>
            ))}
          </div>
        )}
      </Modal>

      {/* Edit ratio */}
      <Modal open={!!ratioModal} onClose={() => setRatioModal(null)} title="Đổi tỷ lệ vật liệu" wide>
        {ratioModal && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Chỉnh số lượng vật liệu cho 1 đơn vị thành phẩm. Khi lưu sẽ hỏi lưu tỷ lệ mới vào lý lịch.
            </p>
            {ratioModal.items.map((item, i) => (
              <div key={item.materialId} className="grid grid-cols-[1fr_120px_90px] gap-2">
                <Input value={item.materialName} disabled />
                <Input
                  type="number"
                  step="any"
                  value={item.quantityPerUnit}
                  onChange={(e) => {
                    const items = [...ratioModal.items]
                    items[i] = { ...item, quantityPerUnit: Number(e.target.value) || 0 }
                    setRatioModal({ ...ratioModal, items })
                  }}
                />
                <Select
                  value={item.unit}
                  onChange={(e) => {
                    const items = [...ratioModal.items]
                    items[i] = { ...item, unit: e.target.value as FormulaItem['unit'] }
                    setRatioModal({ ...ratioModal, items })
                  }}
                >
                  {WEIGHT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => {
                  updateLine(ratioModal.lineId, { items: ratioModal.items })
                  setRatioModal(null)
                }}
              >
                Chỉ dùng cho đơn này
              </Button>
              <Button onClick={() => saveNewRatio(ratioModal.lineId, ratioModal.items)}>
                Lưu thành tỷ lệ mới
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Order detail */}
      <Modal
        open={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        title={detailOrder ? `Đơn ${detailOrder.code}` : 'Đơn'}
        wide
      >
        {detailOrder && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{ORDER_STATUS_LABELS[detailOrder.status]}</Badge>
              {detailOrder.locked && <Badge tone="warn">Đã khoá</Badge>}
              {detailOrder.contractExported && <Badge tone="ok">Đã gửi hợp đồng</Badge>}
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-muted">Khách:</span> {detailOrder.customerName}</p>
              <p><span className="text-muted">Thời gian:</span> {formatDateTime(detailOrder.orderAt)}</p>
              <p><span className="text-muted">Tổng:</span> <strong className="num">{formatMoney(detailOrder.totalAmount)}</strong></p>
              <p><span className="text-muted">Cọc:</span> {formatMoney(detailOrder.deposit)}</p>
              <p><span className="text-muted">Đã thu:</span> {formatMoney(detailOrder.paidAmount)}</p>
              <p><span className="text-muted">Công nợ:</span> <strong className="text-warn">{formatMoney(detailOrder.debt)}</strong></p>
            </div>
            <div className="space-y-2">
              {detailOrder.lines.map((l) => (
                <div key={l.id} className="rounded-2xl bg-surface px-3 py-3">
                  <p className="font-semibold">
                    {l.formulaName} × {formatNumber(l.quantity)} {l.unit}
                  </p>
                  <p className="num text-sm">{formatMoney(l.lineTotal)}</p>
                  {l.items.map((i) => (
                    <p key={i.materialId} className="text-xs text-muted">
                      {i.materialName}: {formatNumber(i.quantityPerUnit * l.quantity)} {i.unit}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            {writable && (
              <div className="grid gap-2">
                <Select
                  label="Đổi trạng thái"
                  value={detailOrder.status}
                  disabled={detailOrder.locked && !canUnlockOrder(profile?.role)}
                  onChange={(e) => changeOrderStatus(detailOrder, e.target.value as OrderStatus)}
                >
                  {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
                <Button
                  variant="secondary"
                  disabled={detailOrder.locked && !canUnlockOrder(profile?.role)}
                  onClick={() => lockAndConfirm(detailOrder)}
                >
                  Xác nhận đơn & khoá
                </Button>
                <Button variant="outline" onClick={() => exportContract(detailOrder)}>
                  Xuất hợp đồng (n8n)
                </Button>
              </div>
            )}
            {message && <p className="text-sm text-info">{message}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
