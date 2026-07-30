import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Lock, Search, Pencil } from 'lucide-react'
import { MoneyInput } from '@/components/MoneyInput'
import { FormulaBuilder, stockDualUnits, toStockUnitQuantity } from '@/components/FormulaBuilder'
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
  createAuditLog,
  createOrder,
  deductStock,
  generateOrderCode,
  getSettings,
  updateCustomer,
  updateOrder,
  watchCustomers,
  watchConversions,
  watchFormulas,
  watchMaterials,
  watchOrders,
  watchUsers,
} from '@/lib/store'
import type {
  AppUser,
  Conversion,
  Customer,
  Formula,
  FormulaItem,
  Material,
  Order,
  OrderLine,
  OrderLineExtra,
  OrderPayment,
  OrderStatus,
  OrderStatusCore,
  ProductRecipe,
} from '@/types'
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_CORE,
  ORDER_STATUS_LABELS,
  calcLineTotal,
  canUnlockOrder,
  canWrite,
  extraMoneyValue,
  getDefaultRecipe,
  getProductRecipes,
  itemsFromExpression,
  normalizeOrderStatus,
  orderPaidTotal,
  orderPaymentsList,
  recipeItems,
  statusFromPayment,
} from '@/types'
import { cn, formatDateTime, formatMoney, formatNumber, uid } from '@/lib/utils'

type SalesTab = 'tao-don' | 'don'

function emptyLine(f?: Formula, recipe?: ProductRecipe): OrderLine {
  const items = recipe
    ? recipeItems(recipe).map((i) => ({ ...i }))
    : f
      ? f.items.map((i) => ({ ...i }))
      : []
  return {
    id: uid(),
    formulaId: f?.id || '',
    formulaName: f?.name || '',
    quantity: 1,
    unit: f?.unit || 'Tấn',
    unitPrice: f?.unitPrice || 0,
    items,
    recipeId: recipe?.id,
    recipeLabel: recipe?.label,
    extras: [
      { id: uid(), label: 'VAT', amount: 0, mode: 'percent', type: 'vat' },
      { id: uid(), label: 'Chiết khấu', amount: 0, mode: 'percent', type: 'discount' },
    ],
    lineTotal: f ? f.unitPrice : 0,
    status: 'draft',
    note: '',
  }
}

function StatusBadge({
  status,
  paidTotal,
  totalAmount,
}: {
  status: OrderStatus
  paidTotal?: number
  totalAmount?: number
}) {
  const core =
    normalizeOrderStatus(status) === 'huy'
      ? ('huy' as OrderStatusCore)
      : typeof paidTotal === 'number' && typeof totalAmount === 'number'
        ? statusFromPayment(totalAmount, paidTotal)
        : normalizeOrderStatus(status)
  const c = ORDER_STATUS_COLORS[core]
  return (
    <span className={cn('inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold', c.bg, c.text)}>
      {ORDER_STATUS_LABELS[core]}
    </span>
  )
}

function datetimeLocalValue(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseDatetimeLocal(v: string) {
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : Date.now()
}

function LineExtrasEditor({
  line,
  writable,
  onChange,
}: {
  line: OrderLine
  writable: boolean
  onChange: (extras: OrderLineExtra[]) => void
}) {
  const base = line.quantity * line.unitPrice
  const vat = line.extras.find((e) => e.type === 'vat')
  const discount = line.extras.find((e) => e.type === 'discount')
  const others = line.extras.filter((e) => e.type === 'other')

  const upsert = (type: 'vat' | 'discount', patch: Partial<OrderLineExtra>) => {
    const list = [...line.extras]
    const idx = list.findIndex((e) => e.type === type)
    if (idx >= 0) list[idx] = { ...list[idx], ...patch }
    else list.push({ id: uid(), label: type === 'vat' ? 'VAT' : 'Chiết khấu', amount: 0, mode: 'percent', type, ...patch })
    onChange(list)
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-xl bg-surface/80 p-3">
        <p className="mb-2 text-sm font-semibold">VAT (cộng thêm)</p>
        <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
          <Select
            label="Kiểu"
            value={vat?.mode || 'percent'}
            disabled={!writable}
            onChange={(e) => upsert('vat', { mode: e.target.value as 'amount' | 'percent' })}
          >
            <option value="percent">%</option>
            <option value="amount">Số tiền</option>
          </Select>
          <Input
            label={vat?.mode === 'amount' ? 'Số tiền VAT' : 'Số % VAT'}
            type="number"
            step="any"
            value={vat?.amount ?? 0}
            disabled={!writable}
            onChange={(e) => upsert('vat', { amount: Number(e.target.value) || 0 })}
          />
        </div>
        {vat && (
          <p className="mt-1 text-xs text-muted">
            = {formatMoney(extraMoneyValue(vat, base))}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-surface/80 p-3">
        <p className="mb-2 text-sm font-semibold">Chiết khấu (trừ đi)</p>
        <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
          <Select
            label="Kiểu"
            value={discount?.mode || 'percent'}
            disabled={!writable}
            onChange={(e) => upsert('discount', { mode: e.target.value as 'amount' | 'percent' })}
          >
            <option value="percent">%</option>
            <option value="amount">Số tiền</option>
          </Select>
          <Input
            label={discount?.mode === 'amount' ? 'Số tiền chiết khấu' : 'Số % chiết khấu'}
            type="number"
            step="any"
            value={discount?.amount ?? 0}
            disabled={!writable}
            onChange={(e) => upsert('discount', { amount: Number(e.target.value) || 0 })}
          />
        </div>
        {discount && (
          <p className="mt-1 text-xs text-muted">
            = −{formatMoney(extraMoneyValue(discount, base))}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-surface/80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Khác</p>
          {writable && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange([
                  ...line.extras,
                  { id: uid(), label: '', amount: 0, mode: 'amount', type: 'other' },
                ])
              }
            >
              <Plus size={14} /> Thêm mục
            </Button>
          )}
        </div>
        {others.length === 0 && <p className="text-xs text-muted">Chưa có mục khác.</p>}
        <div className="space-y-2">
          {others.map((ex) => (
            <div key={ex.id} className="grid grid-cols-[1fr_100px_1fr_36px] gap-2">
              <Input
                placeholder="Tên mục"
                value={ex.label}
                disabled={!writable}
                onChange={(e) =>
                  onChange(line.extras.map((x) => (x.id === ex.id ? { ...x, label: e.target.value } : x)))
                }
              />
              <Select
                value={ex.mode || 'amount'}
                disabled={!writable}
                onChange={(e) =>
                  onChange(
                    line.extras.map((x) =>
                      x.id === ex.id ? { ...x, mode: e.target.value as 'amount' | 'percent' } : x,
                    ),
                  )
                }
              >
                <option value="amount">vnđ</option>
                <option value="percent">%</option>
              </Select>
              <Input
                type="number"
                step="any"
                value={ex.amount}
                disabled={!writable}
                onChange={(e) =>
                  onChange(
                    line.extras.map((x) =>
                      x.id === ex.id ? { ...x, amount: Number(e.target.value) || 0 } : x,
                    ),
                  )
                }
              />
              {writable && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(line.extras.filter((x) => x.id !== ex.id))}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SalesPage() {
  const { profile } = useAuth()
  const writable = canWrite(profile?.role)
  const [tab, setTab] = useState<SalesTab>('tao-don')
  const [formulas, setFormulas] = useState<Formula[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<AppUser[]>([])

  const [lines, setLines] = useState<OrderLine[]>([emptyLine()])
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [payments, setPayments] = useState<OrderPayment[]>([])
  const [payAmount, setPayAmount] = useState(0)
  const [payNote, setPayNote] = useState('')
  const [payAt, setPayAt] = useState(() => datetimeLocalValue(Date.now()))
  const [contractAmount, setContractAmount] = useState(0)
  const [note, setNote] = useState('')
  const [orderStatusOverride, setOrderStatusOverride] = useState<'huy' | null>(null)
  const [assignedTo, setAssignedTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [recipePick, setRecipePick] = useState<{ lineId: string; formula: Formula } | null>(null)
  const [ratioModal, setRatioModal] = useState<{ lineId: string; items: FormulaItem[]; materialIds: string[] } | null>(null)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [detailPayAmount, setDetailPayAmount] = useState(0)
  const [detailPayNote, setDetailPayNote] = useState('')
  const [detailPayAt, setDetailPayAt] = useState(() => datetimeLocalValue(Date.now()))
  const [detailPayBusy, setDetailPayBusy] = useState(false)

  useEffect(() => {
    const u1 = watchFormulas(setFormulas)
    const u2 = watchCustomers(setCustomers)
    const u3 = watchOrders(setOrders)
    const u4 = watchMaterials(setMaterials)
    const u5 = watchUsers(setUsers)
    const u6 = watchConversions(setConversions)
    return () => { u1(); u2(); u3(); u4(); u5(); u6() }
  }, [])

  useEffect(() => {
    if (profile && !assignedTo) setAssignedTo(profile.id)
  }, [profile, assignedTo])

  const managers = users.filter((u) => u.active && (u.role === 'admin' || u.role === 'superadmin'))
  const activeFormulas = formulas.filter((f) => f.active)
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.taxCode.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q),
    )
  }, [customers, customerSearch])

  const totalAmount = useMemo(() => lines.reduce((s, l) => s + l.lineTotal, 0), [lines])
  /** Tiền đang nhập chưa bấm ghi nhận — vẫn tính vào trạng thái khi lưu */
  const pendingPay = payAmount > 0 ? payAmount : 0
  const paidAmount = useMemo(() => payments.reduce((s, p) => s + (p.amount || 0), 0), [payments])
  const paidWithPending = paidAmount + pendingPay
  const debt = Math.max(0, totalAmount - paidWithPending)
  const autoStatus = statusFromPayment(totalAmount, paidWithPending)
  const orderStatus: OrderStatusCore =
    orderStatusOverride === 'huy' ? 'huy' : autoStatus

  const buildPaymentsForSave = (): OrderPayment[] => {
    const list = [...payments]
    if (payAmount > 0) {
      list.unshift({
        id: uid(),
        amount: payAmount,
        note: payNote.trim() || (payments.length === 0 ? 'Cọc' : 'Thanh toán'),
        paidAt: parseDatetimeLocal(payAt),
        createdBy: profile?.id || '',
        createdByName: profile?.displayName,
      })
    }
    return list.sort((a, b) => b.paidAt - a.paidAt)
  }

  const addPaymentRow = () => {
    if (!writable || payAmount <= 0) return
    setPayments((prev) => [
      {
        id: uid(),
        amount: payAmount,
        note: payNote.trim() || (prev.length === 0 ? 'Cọc' : 'Thanh toán'),
        paidAt: parseDatetimeLocal(payAt),
        createdBy: profile?.id || '',
        createdByName: profile?.displayName,
      },
      ...prev,
    ])
    setPayAmount(0)
    setPayNote('')
    setPayAt(datetimeLocalValue(Date.now()))
    setOrderStatusOverride(null)
  }

  const removePaymentRow = (id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id))
  }

  const materialNeed = useMemo(() => {
    const map = new Map<string, { id: string; name: string; unit: string; qty: number }>()
    for (const line of lines) {
      for (const item of line.items) {
        const key = item.materialId
        const cur = map.get(key) || { id: item.materialId, name: item.materialName, unit: item.unit, qty: 0 }
        cur.qty += item.quantityPerUnit * line.quantity
        map.set(key, cur)
      }
    }
    return [...map.values()].map((row) => {
      const mat = materials.find((m) => m.id === row.id)
      const dual = mat ? stockDualUnits(mat, conversions) : null
      const stockQty = mat ? toStockUnitQuantity(row.qty, row.unit, mat, conversions) : row.qty
      return {
        ...row,
        stockQty,
        stockUnit: mat?.unit || row.unit,
        stockAvailable: dual?.inputQty ?? null,
        convertedAvailable: dual?.convertedQty ?? null,
        convertedUnit: dual?.convertedUnit ?? null,
      }
    })
  }, [lines, materials, conversions])

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

  const applyRecipe = (lineId: string, f: Formula, recipe: ProductRecipe) => {
    const items = recipeItems(recipe).map((i) => ({ ...i }))
    updateLine(lineId, {
      formulaId: f.id,
      formulaName: f.name,
      unit: f.unit,
      unitPrice: f.unitPrice,
      items,
      recipeId: recipe.id,
      recipeLabel: recipe.label,
    })
  }

  const pickFormula = (lineId: string, formulaId: string) => {
    const f = formulas.find((x) => x.id === formulaId)
    if (!f) return
    const recipes = getProductRecipes(f)
    if (recipes.length > 1) {
      setRecipePick({ lineId, formula: f })
      return
    }
    applyRecipe(lineId, f, getDefaultRecipe(f))
  }

  const resetDraft = () => {
    setLines([emptyLine()])
    setPayments([])
    setPayAmount(0)
    setPayNote('')
    setPayAt(datetimeLocalValue(Date.now()))
    setContractAmount(0)
    setNote('')
    setCustomerId('')
    setOrderStatusOverride(null)
    setAssignedTo(profile?.id || '')
    setEditingOrder(null)
  }

  const loadOrderForEdit = (order: Order) => {
    if (order.locked && !canUnlockOrder(profile?.role)) {
      setMessage('Đơn đã khoá — chỉ Superadmin được sửa.')
      return
    }
    setEditingOrder(order)
    setLines(order.lines.map((l) => ({ ...l, extras: l.extras.map((e) => ({ ...e })) })))
    setCustomerId(order.customerId || '')
    setPayments(orderPaymentsList(order).map((p) => ({ ...p })))
    setContractAmount(order.contractAmount || order.totalAmount || 0)
    setNote(order.note || '')
    setOrderStatusOverride(normalizeOrderStatus(order.status) === 'huy' ? 'huy' : null)
    setAssignedTo(order.assignedTo || order.createdBy || profile?.id || '')
    setTab('tao-don')
    setDetailOrder(null)
  }

  const buildDeductItems = () =>
    lines.flatMap((line) =>
      line.items.map((item) => {
        const mat = materials.find((m) => m.id === item.materialId)
        const qtyConverted = item.quantityPerUnit * line.quantity
        const qtyStock = mat
          ? toStockUnitQuantity(qtyConverted, item.unit, mat, conversions)
          : qtyConverted
        return {
          materialId: item.materialId,
          materialName: item.materialName,
          unit: mat?.unit || item.unit,
          quantity: qtyStock,
        }
      }),
    )

  const confirmOrder = async (asDraft?: boolean) => {
    if (!writable || !profile) return
    setBusy(true)
    setMessage('')
    try {
      const cust = customers.find((c) => c.id === customerId)
      if (!cust) {
        setMessage('Chọn khách hàng trước khi tạo đơn.')
        setBusy(false)
        return
      }
      if (lines.some((l) => !l.formulaId)) {
        setMessage('Mỗi dòng cần chọn sản phẩm.')
        setBusy(false)
        return
      }

      const assignee = managers.find((u) => u.id === assignedTo) || profile
      const orderCode = editingOrder?.code || generateOrderCode()
      const finalPayments = buildPaymentsForSave()
      const finalPaid = finalPayments.reduce((s, p) => s + (p.amount || 0), 0)
      const finalDebt = Math.max(0, totalAmount - finalPaid)

      // Chỉ Draft khi chưa có tiền. Có cọc → Đang hoạt động. Đủ tiền → Hoàn thiện.
      // Nút "Lưu Draft" chỉ hợp lệ khi chưa thanh toán.
      if (asDraft === true && finalPaid > 0) {
        setMessage('Đã có thanh toán/cọc — không thể lưu Draft. Trạng thái sẽ là Đang hoạt động.')
      }

      let status: OrderStatusCore
      if (orderStatusOverride === 'huy') {
        status = 'huy'
      } else if (asDraft === true && finalPaid <= 0) {
        status = 'draft'
      } else {
        status = statusFromPayment(totalAmount, finalPaid)
      }

      const shouldDeduct =
        status !== 'draft' && status !== 'huy' && !(editingOrder?.stockDeducted)
      const finalContract = contractAmount > 0 ? contractAmount : totalAmount

      const orderPayload: Omit<Order, 'id'> = {
        code: orderCode,
        customerId: cust.id,
        customerName: cust.name,
        lines: lines.map((l) => ({ ...l, status })),
        deposit: 0,
        paidAmount: finalPaid,
        payments: finalPayments,
        contractAmount: finalContract,
        debt: finalDebt,
        totalAmount,
        status,
        locked: editingOrder?.locked || false,
        contractExported: editingOrder?.contractExported || false,
        note,
        orderAt: editingOrder?.orderAt || Date.now(),
        createdAt: editingOrder?.createdAt || Date.now(),
        updatedAt: Date.now(),
        createdBy: editingOrder?.createdBy || profile.id,
        createdByName: editingOrder?.createdByName || profile.displayName,
        assignedTo: assignee.id,
        assignedToName: assignee.displayName,
        stockDeducted: editingOrder?.stockDeducted || shouldDeduct,
      }

      if (editingOrder) {
        const oldPaid = orderPaidTotal(editingOrder)
        const oldDebt = editingOrder.debt || 0
        await updateOrder(editingOrder.id, orderPayload)
        if (shouldDeduct) {
          const deductItems = buildDeductItems()
          if (deductItems.length > 0) {
            await deductStock(deductItems, {
              orderId: editingOrder.id,
              orderCode,
              createdBy: profile.id,
              createdByName: profile.displayName,
              note: `Xuất kho đơn ${orderCode}`,
            })
          }
        }
        await updateCustomer(cust.id, {
          totalPurchased: Math.max(0, (cust.totalPurchased || 0) - editingOrder.totalAmount + totalAmount),
          totalDebt: Math.max(0, (cust.totalDebt || 0) - oldDebt + finalDebt),
        })
        await createAuditLog({
          entityType: 'order',
          entityId: editingOrder.id,
          entityLabel: orderCode,
          action: 'update',
          summary: `Sửa đơn ${orderCode} → ${ORDER_STATUS_LABELS[status]}`,
          before: JSON.stringify({ total: editingOrder.totalAmount, paid: oldPaid, status: editingOrder.status }),
          after: JSON.stringify({ total: totalAmount, paid: finalPaid, status }),
          userId: profile.id,
          userName: profile.displayName,
          createdAt: Date.now(),
        })
        setMessage(`Đã cập nhật đơn ${orderCode} · ${ORDER_STATUS_LABELS[status]}`)
        setDetailOrder({ ...orderPayload, id: editingOrder.id })
      } else {
        const id = await createOrder(orderPayload)
        if (shouldDeduct) {
          const deductItems = buildDeductItems()
          if (deductItems.length > 0) {
            await deductStock(deductItems, {
              orderId: id,
              orderCode,
              createdBy: profile.id,
              createdByName: profile.displayName,
              note: `Xuất kho đơn ${orderCode}`,
            })
          }
        }
        await updateCustomer(cust.id, {
          totalPurchased: (cust.totalPurchased || 0) + totalAmount,
          totalDebt: (cust.totalDebt || 0) + finalDebt,
        })
        await createAuditLog({
          entityType: 'order',
          entityId: id,
          entityLabel: orderCode,
          action: 'create',
          summary: `Tạo đơn ${orderCode} (${ORDER_STATUS_LABELS[status]})`,
          userId: profile.id,
          userName: profile.displayName,
          createdAt: Date.now(),
        })
        setMessage(`Đã tạo đơn ${orderCode} · ${ORDER_STATUS_LABELS[status]}`)
        setDetailOrder({ ...orderPayload, id })
      }

      resetDraft()
      setTab('don')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lỗi lưu đơn')
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
    await updateOrder(order.id, { locked: true, confirmedAt: Date.now(), confirmedBy: profile.id })
    setDetailOrder({ ...order, locked: true, confirmedAt: Date.now(), confirmedBy: profile.id })
    setMessage('Đã xác nhận đơn.')
  }

  const exportContract = async (order: Order) => {
    if (!writable) return
    const settings = await getSettings()
    if (!settings.n8nEnabled || !settings.n8nWebhookUrl) {
      setMessage('Chưa cấu hình n8n webhook.')
      return
    }
    try {
      await fetch(settings.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contract', company: settings, order }),
      })
      await updateOrder(order.id, { contractExported: true, locked: true })
      setMessage('Đã gửi yêu cầu xuất hợp đồng.')
    } catch {
      setMessage('Không gửi được tới n8n.')
    }
  }

  const changeOrderStatus = async (order: Order, status: OrderStatusCore) => {
    if (!writable || !profile) return
    if (order.locked && !canUnlockOrder(profile?.role)) {
      setMessage('Đơn đã khoá.')
      return
    }
    const patch: Partial<Order> = { status }
    if (status !== 'draft' && status !== 'huy' && !order.stockDeducted) {
      const deductItems = order.lines.flatMap((line) =>
        line.items.map((item) => {
          const mat = materials.find((m) => m.id === item.materialId)
          const qtyConverted = item.quantityPerUnit * line.quantity
          const qtyStock = mat
            ? toStockUnitQuantity(qtyConverted, item.unit, mat, conversions)
            : qtyConverted
          return {
            materialId: item.materialId,
            materialName: item.materialName,
            unit: mat?.unit || item.unit,
            quantity: qtyStock,
          }
        }),
      )
      if (deductItems.length > 0) {
        await deductStock(deductItems, {
          orderId: order.id,
          orderCode: order.code,
          createdBy: profile.id,
          createdByName: profile.displayName,
          note: `Xuất kho đơn ${order.code}`,
        })
      }
      patch.stockDeducted = true
    }
    await updateOrder(order.id, patch)
    await createAuditLog({
      entityType: 'order',
      entityId: order.id,
      entityLabel: order.code,
      action: 'update',
      summary: `Đổi trạng thái đơn ${order.code} → ${ORDER_STATUS_LABELS[status]}`,
      userId: profile.id,
      userName: profile.displayName,
      createdAt: Date.now(),
    })
    setDetailOrder({ ...order, ...patch })
  }

  const addDetailPayment = async () => {
    if (!writable || !profile || !detailOrder || detailPayAmount <= 0) return
    if (detailOrder.locked && !canUnlockOrder(profile.role)) {
      setMessage('Đơn đã khoá.')
      return
    }
    setDetailPayBusy(true)
    try {
      const nextPayments = [
        {
          id: uid(),
          amount: detailPayAmount,
          note: detailPayNote.trim() || (orderPaymentsList(detailOrder).length === 0 ? 'Cọc' : 'Thanh toán'),
          paidAt: parseDatetimeLocal(detailPayAt),
          createdBy: profile.id,
          createdByName: profile.displayName,
        },
        ...orderPaymentsList(detailOrder),
      ]
      const paid = nextPayments.reduce((s, p) => s + p.amount, 0)
      const nextDebt = Math.max(0, detailOrder.totalAmount - paid)
      const nextStatus =
        normalizeOrderStatus(detailOrder.status) === 'huy'
          ? ('huy' as OrderStatusCore)
          : statusFromPayment(detailOrder.totalAmount, paid)
      const patch: Partial<Order> = {
        payments: nextPayments,
        paidAmount: paid,
        deposit: 0,
        debt: nextDebt,
        status: nextStatus,
      }
      if (nextStatus !== 'draft' && nextStatus !== 'huy' && !detailOrder.stockDeducted) {
        const deductItems = detailOrder.lines.flatMap((line) =>
          line.items.map((item) => {
            const mat = materials.find((m) => m.id === item.materialId)
            const qtyConverted = item.quantityPerUnit * line.quantity
            const qtyStock = mat
              ? toStockUnitQuantity(qtyConverted, item.unit, mat, conversions)
              : qtyConverted
            return {
              materialId: item.materialId,
              materialName: item.materialName,
              unit: mat?.unit || item.unit,
              quantity: qtyStock,
            }
          }),
        )
        if (deductItems.length > 0) {
          await deductStock(deductItems, {
            orderId: detailOrder.id,
            orderCode: detailOrder.code,
            createdBy: profile.id,
            createdByName: profile.displayName,
            note: `Xuất kho đơn ${detailOrder.code}`,
          })
        }
        patch.stockDeducted = true
      }
      const cust = customers.find((c) => c.id === detailOrder.customerId)
      await updateOrder(detailOrder.id, patch)
      if (cust) {
        await updateCustomer(cust.id, {
          totalDebt: Math.max(0, (cust.totalDebt || 0) - detailOrder.debt + nextDebt),
        })
      }
      await createAuditLog({
        entityType: 'order',
        entityId: detailOrder.id,
        entityLabel: detailOrder.code,
        action: 'update',
        summary: `Thanh toán ${formatMoney(detailPayAmount)} cho đơn ${detailOrder.code}`,
        userId: profile.id,
        userName: profile.displayName,
        createdAt: Date.now(),
      })
      setDetailOrder({ ...detailOrder, ...patch })
      setDetailPayAmount(0)
      setDetailPayNote('')
      setDetailPayAt(datetimeLocalValue(Date.now()))
      setMessage(`Đã ghi nhận thanh toán ${formatMoney(detailPayAmount)}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lỗi ghi thanh toán')
    } finally {
      setDetailPayBusy(false)
    }
  }

  const openOrderDetail = async (order: Order) => {
    const paid = orderPaidTotal(order)
    const core = normalizeOrderStatus(order.status)
    const expected = statusFromPayment(order.totalAmount, paid)
    // Sửa đơn cũ: đã có cọc mà vẫn Draft → chuyển Đang hoạt động
    if (
      writable &&
      profile &&
      core === 'draft' &&
      paid > 0 &&
      expected !== 'draft'
    ) {
      const patch: Partial<Order> = { status: expected }
      if (!order.stockDeducted) {
        const deductItems = order.lines.flatMap((line) =>
          line.items.map((item) => {
            const mat = materials.find((m) => m.id === item.materialId)
            const qtyConverted = item.quantityPerUnit * line.quantity
            const qtyStock = mat
              ? toStockUnitQuantity(qtyConverted, item.unit, mat, conversions)
              : qtyConverted
            return {
              materialId: item.materialId,
              materialName: item.materialName,
              unit: mat?.unit || item.unit,
              quantity: qtyStock,
            }
          }),
        )
        if (deductItems.length > 0) {
          await deductStock(deductItems, {
            orderId: order.id,
            orderCode: order.code,
            createdBy: profile.id,
            createdByName: profile.displayName,
            note: `Xuất kho đơn ${order.code}`,
          })
        }
        patch.stockDeducted = true
      }
      await updateOrder(order.id, patch)
      setDetailOrder({ ...order, ...patch })
      setMessage(`Đã cập nhật ${order.code}: có thanh toán → ${ORDER_STATUS_LABELS[expected]}`)
      return
    }
    setDetailOrder(order)
  }

  const activeOrders = orders.filter((o) => {
    const s = normalizeOrderStatus(o.status)
    return s !== 'hoan_thien' && s !== 'huy'
  })

  return (
    <div>
      <PageHeader title="Bán hàng" />
      <Tabs
        tabs={[
          { id: 'tao-don', label: editingOrder ? `Sửa ${editingOrder.code}` : 'Tạo đơn hàng' },
          { id: 'don', label: 'Đơn hàng' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as SalesTab)}
      />

      {tab === 'tao-don' && (
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            {editingOrder && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm">
                <span>Đang sửa đơn <strong>{editingOrder.code}</strong></span>
                <Button size="sm" variant="outline" onClick={resetDraft}>Huỷ sửa</Button>
              </div>
            )}

            <Bento title="Khách hàng">
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
              <Select label="Chọn khách" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!writable}>
                <option value="">— Chọn khách hàng —</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.taxCode ? `(${c.taxCode})` : ''}</option>
                ))}
              </Select>
            </Bento>

            <Bento title="Người phụ trách">
              <Select
                label="Chọn Admin / Superadmin"
                value={assignedTo}
                disabled={!writable}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                {managers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.role})
                  </option>
                ))}
              </Select>
            </Bento>

            {lines.map((line, idx) => (
              <Bento
                key={line.id}
                title={`Sản phẩm ${idx + 1}`}
                subtitle={line.unit ? `Đơn vị: ${line.unit}` : undefined}
                action={
                  lines.length > 1 && writable ? (
                    <Button variant="ghost" size="sm" onClick={() => setLines((p) => p.filter((l) => l.id !== line.id))}>
                      <Trash2 size={16} />
                    </Button>
                  ) : undefined
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label="Sản phẩm" value={line.formulaId} disabled={!writable} onChange={(e) => pickFormula(line.id, e.target.value)}>
                    <option value="">— Chọn sản phẩm —</option>
                    {activeFormulas.map((f) => (
                      <option key={f.id} value={f.id}>{f.name} ({f.unit})</option>
                    ))}
                  </Select>
                  {line.recipeLabel && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted">Công thức</p>
                      <Badge tone="accent">{line.recipeLabel}</Badge>
                      {writable && line.formulaId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-2"
                          onClick={() => {
                            const f = formulas.find((x) => x.id === line.formulaId)
                            if (f) setRecipePick({ lineId: line.id, formula: f })
                          }}
                        >
                          Đổi công thức
                        </Button>
                      )}
                    </div>
                  )}
                  <Input
                    label={`Số lượng (${line.unit || 'đơn vị'})`}
                    type="number"
                    step="any"
                    min="0"
                    value={line.quantity}
                    disabled={!writable}
                    onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) || 0 })}
                  />
                  <MoneyInput
                    label="Đơn giá"
                    value={line.unitPrice}
                    disabled={!writable}
                    onChange={(n) => updateLine(line.id, { unitPrice: n })}
                  />
                  <div className="flex items-end sm:col-span-2">
                    <p className="text-sm text-muted">
                      Thành tiền: <strong className="num text-accent">{formatMoney(line.lineTotal)}</strong>
                    </p>
                  </div>
                </div>

                {line.items.length > 0 && (
                  <div className="mt-3 rounded-2xl bg-surface/80 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Vật liệu / 1 {line.unit}</p>
                      {writable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const f = formulas.find((x) => x.id === line.formulaId)
                            setRatioModal({
                              lineId: line.id,
                              items: line.items.map((i) => ({ ...i })),
                              materialIds: f?.materialIds || line.items.map((i) => i.materialId),
                            })
                          }}
                        >
                          Tùy chỉnh tỷ lệ
                        </Button>
                      )}
                    </div>
                    {line.items.map((item) => (
                      <div key={item.materialId} className="flex justify-between text-sm">
                        <span>{item.materialName}</span>
                        <span className="num font-semibold">
                          {formatNumber(item.quantityPerUnit)} {item.unit}
                          <span className="ml-2 text-muted">→ {formatNumber(item.quantityPerUnit * line.quantity)} {item.unit}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <LineExtrasEditor
                  line={line}
                  writable={writable}
                  onChange={(extras) => updateLine(line.id, { extras })}
                />
              </Bento>
            ))}

            {writable && (
              <Button variant="outline" className="w-full" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus size={16} /> Thêm sản phẩm
              </Button>
            )}
          </div>

          <div className="space-y-3 lg:col-span-2">
            <Bento title="Vật liệu cần xuất kho">
              {materialNeed.length === 0 ? (
                <Empty text="Chọn sản phẩm để xem vật liệu." />
              ) : (
                <div className="space-y-2">
                  {materialNeed.map((m) => (
                    <div key={m.id + m.unit} className="rounded-xl bg-surface px-3 py-2">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{m.name}</span>
                        <span className="num font-bold">
                          {formatNumber(m.qty)} {m.unit}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Trừ kho: {formatNumber(m.stockQty)} {m.stockUnit}
                        {m.stockAvailable != null && (
                          <> · Tồn: {formatNumber(m.stockAvailable)} {m.stockUnit}</>
                        )}
                        {m.convertedAvailable != null && m.convertedUnit && (
                          <> ({formatNumber(m.convertedAvailable)} {m.convertedUnit})</>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Bento>

            <Bento title="Thanh toán & trạng thái">
              <div className="grid gap-3">
                <div className="rounded-xl bg-surface/80 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted">Tổng tiền hàng / hợp đồng</p>
                  <p className="num text-2xl font-extrabold text-accent">{formatMoney(totalAmount)}</p>
                </div>
                <div className="rounded-xl bg-ink px-3 py-3 text-surface">
                  <p className="text-xs uppercase tracking-wider opacity-70">Đã thanh toán (cọc + các đợt)</p>
                  <p className="num text-2xl font-extrabold">{formatMoney(paidWithPending)}</p>
                  <p className="mt-1 text-sm opacity-80">
                    Công nợ: <strong className="num">{formatMoney(debt)}</strong>
                  </p>
                  {pendingPay > 0 && (
                    <p className="mt-1 text-xs opacity-70">
                      Đang nhập +{formatMoney(pendingPay)} — sẽ tự ghi nhận khi lưu đơn
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-line bg-white p-3">
                  <p className="mb-2 text-sm font-bold">Lịch sử thanh toán</p>
                  {payments.length === 0 && pendingPay <= 0 ? (
                    <p className="mb-3 text-xs text-muted">Chưa có tiền → đơn là Draft. Nhập cọc bên dưới để chuyển Đang hoạt động.</p>
                  ) : (
                    <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
                      {payments.map((p) => (
                        <div key={p.id} className="flex items-start justify-between gap-2 rounded-xl bg-surface px-3 py-2">
                          <div className="min-w-0">
                            <p className="num text-base font-extrabold text-ok">{formatMoney(p.amount)}</p>
                            <p className="text-xs text-muted">{formatDateTime(p.paidAt)}</p>
                            {p.note && <p className="text-xs">{p.note}</p>}
                          </div>
                          {writable && (
                            <Button size="sm" variant="ghost" onClick={() => removePaymentRow(p.id)}>
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      ))}
                      {pendingPay > 0 && (
                        <div className="rounded-xl border border-dashed border-ok/40 bg-emerald-50 px-3 py-2">
                          <p className="num text-base font-extrabold text-ok">{formatMoney(pendingPay)}</p>
                          <p className="text-xs text-muted">Chưa lưu · sẽ ghi khi Chốt / Lưu đơn</p>
                        </div>
                      )}
                    </div>
                  )}
                  {writable && (
                    <div className="space-y-2 border-t border-line pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Nhập cọc / đợt thanh toán</p>
                      <MoneyInput label="Số tiền thanh toán" value={payAmount} onChange={setPayAmount} />
                      <Input
                        label="Thời gian thanh toán"
                        type="datetime-local"
                        value={payAt}
                        onChange={(e) => setPayAt(e.target.value)}
                      />
                      <Input label="Ghi chú đợt" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Cọc, đợt 1…" />
                      <Button variant="secondary" className="w-full" disabled={payAmount <= 0} onClick={addPaymentRow}>
                        <Plus size={14} /> Thêm vào lịch sử thanh toán
                      </Button>
                    </div>
                  )}
                </div>

                <MoneyInput
                  label="Giá trị hợp đồng (tuỳ chọn)"
                  value={contractAmount}
                  disabled={!writable}
                  onChange={setContractAmount}
                  hint={contractAmount <= 0 ? `Để trống sẽ lấy tổng tiền hàng: ${formatMoney(totalAmount)}` : undefined}
                />

                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Trạng thái (theo tiền đã thanh toán)</p>
                  <div className="flex flex-wrap gap-2">
                    {ORDER_STATUS_CORE.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={!writable || (s === 'draft' && paidWithPending > 0) || (s !== 'huy' && s !== autoStatus && !(s === 'draft' && paidWithPending <= 0))}
                        onClick={() => {
                          if (s === 'huy') setOrderStatusOverride('huy')
                          else setOrderStatusOverride(null)
                        }}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-sm font-semibold',
                          ORDER_STATUS_COLORS[s].bg,
                          ORDER_STATUS_COLORS[s].text,
                          orderStatus === s ? 'ring-2 ring-ink/30' : 'opacity-70',
                        )}
                      >
                        {ORDER_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Chưa có tiền → Draft · Có cọc → Đang hoạt động · Đủ tiền → Hoàn thiện. Draft chưa trừ kho.
                  </p>
                </div>
                <Textarea label="Ghi chú" value={note} disabled={!writable} onChange={(e) => setNote(e.target.value)} />
              </div>
            </Bento>

            {writable && (
              <div className="grid gap-2">
                <Button size="lg" disabled={busy} onClick={() => confirmOrder(false)}>
                  {busy
                    ? 'Đang lưu…'
                    : editingOrder
                      ? `Lưu đơn · ${ORDER_STATUS_LABELS[orderStatus]}`
                      : paidWithPending > 0
                        ? `Chốt đơn · ${ORDER_STATUS_LABELS[orderStatus]}`
                        : 'Chốt đơn hàng'}
                </Button>
                {paidWithPending <= 0 && (
                  <Button
                    size="lg"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void confirmOrder(true)}
                  >
                    Lưu Draft (nháp — chưa có tiền)
                  </Button>
                )}
              </div>
            )}
            {message && <p className="text-sm font-medium text-info">{message}</p>}
          </div>
        </div>
      )}

      {tab === 'don' && (
        <div className="space-y-3">
          {activeOrders.length > 0 && (
            <Bento title="Đang triển khai" subtitle={`${activeOrders.length} đơn`}>
              <div className="space-y-2">
                {activeOrders.slice(0, 10).map((o) => (
                  <button key={o.id} type="button" onClick={() => void openOrderDetail(o)} className="flex w-full items-center justify-between rounded-xl bg-surface/70 px-3 py-2 text-left">
                    <span className="font-semibold">{o.code} · {o.customerName}</span>
                    <StatusBadge status={o.status} paidTotal={orderPaidTotal(o)} totalAmount={o.totalAmount} />
                  </button>
                ))}
              </div>
            </Bento>
          )}
          <Bento title="Tất cả đơn hàng">
            {orders.length === 0 ? (
              <Empty text="Chưa có đơn hàng." />
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <button key={o.id} type="button" onClick={() => void openOrderDetail(o)} className="bento flex w-full items-center justify-between gap-3 p-4 text-left">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display font-bold">{o.code}</p>
                        {o.locked && <Badge tone="warn"><Lock size={10} className="mr-1 inline" />Khoá</Badge>}
                        <StatusBadge status={o.status} paidTotal={orderPaidTotal(o)} totalAmount={o.totalAmount} />
                      </div>
                      <p className="truncate text-sm text-muted">
                        {o.customerName} · {formatDateTime(o.orderAt)}
                        {o.assignedToName && ` · PT: ${o.assignedToName}`}
                      </p>
                    </div>
                    <p className="num shrink-0 text-lg font-extrabold">{formatMoney(o.totalAmount)}</p>
                  </button>
                ))}
              </div>
            )}
          </Bento>
        </div>
      )}

      <Modal open={!!recipePick} onClose={() => setRecipePick(null)} title="Chọn công thức">
        {recipePick && (
          <div className="space-y-2">
            {getProductRecipes(recipePick.formula).map((r) => (
              <Button
                key={r.id}
                variant={r.isDefault ? 'primary' : 'outline'}
                className="w-full justify-start"
                onClick={() => {
                  applyRecipe(recipePick.lineId, recipePick.formula, r)
                  setRecipePick(null)
                }}
              >
                {r.label} {r.isDefault && '(mặc định)'}
              </Button>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!ratioModal} onClose={() => setRatioModal(null)} title="Tùy chỉnh công thức cho đơn này" wide>
        {ratioModal && (
          <div className="space-y-3">
            <FormulaBuilder
              materials={materials}
              conversions={conversions}
              materialIds={ratioModal.materialIds}
              expression={ratioModal.items.map((i) => ({
                id: i.materialId,
                kind: 'material' as const,
                materialId: i.materialId,
                materialName: i.materialName,
                quantityPerUnit: i.quantityPerUnit,
                unit: i.unit,
              }))}
              onChange={(expr) => setRatioModal({ ...ratioModal, items: itemsFromExpression(expr) })}
            />
            <Button className="w-full" onClick={() => { updateLine(ratioModal.lineId, { items: ratioModal.items }); setRatioModal(null) }}>
              Áp dụng cho đơn
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={!!detailOrder} onClose={() => setDetailOrder(null)} title={detailOrder ? `Đơn ${detailOrder.code}` : 'Đơn'} wide>
        {detailOrder && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                status={detailOrder.status}
                paidTotal={orderPaidTotal(detailOrder)}
                totalAmount={detailOrder.totalAmount}
              />
              {detailOrder.locked && <Badge tone="warn">Đã khoá</Badge>}
              {normalizeOrderStatus(detailOrder.status) === 'draft' && (
                <Badge tone="info">Chưa trừ kho</Badge>
              )}
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-muted">Khách:</span> {detailOrder.customerName}</p>
              <p><span className="text-muted">Thời gian:</span> {formatDateTime(detailOrder.orderAt)}</p>
              <p><span className="text-muted">Người phụ trách:</span> {detailOrder.assignedToName || detailOrder.createdByName || '—'}</p>
              <p><span className="text-muted">Tổng:</span> <strong className="num">{formatMoney(detailOrder.totalAmount)}</strong></p>
              <p><span className="text-muted">Đã thanh toán:</span> <strong className="num text-ok">{formatMoney(orderPaidTotal(detailOrder))}</strong></p>
              <p><span className="text-muted">Công nợ:</span> <strong className="text-warn">{formatMoney(detailOrder.debt)}</strong></p>
            </div>

            <div className="rounded-2xl border-2 border-ink/10 bg-surface p-4">
              <p className="mb-1 font-display text-lg font-bold">Lịch sử thanh toán</p>
              <p className="mb-3 text-xs text-muted">Mỗi đợt ghi rõ số tiền và thời gian thanh toán</p>
              {orderPaymentsList(detailOrder).length === 0 ? (
                <p className="mb-3 text-sm text-muted">Chưa có thanh toán / cọc.</p>
              ) : (
                <div className="mb-4 space-y-2">
                  {orderPaymentsList(detailOrder).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
                      <div>
                        <p className="num text-xl font-extrabold text-ok">{formatMoney(p.amount)}</p>
                        <p className="text-sm font-medium text-ink">{formatDateTime(p.paidAt)}</p>
                        {p.note && <p className="text-xs text-muted">{p.note}</p>}
                        {p.createdByName && <p className="text-xs text-muted">Ghi bởi {p.createdByName}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {writable && !(detailOrder.locked && !canUnlockOrder(profile?.role)) && (
                <div className="space-y-2 rounded-xl border border-dashed border-line bg-white p-3">
                  <p className="text-sm font-semibold">Thêm đợt thanh toán</p>
                  <MoneyInput label="Số tiền" value={detailPayAmount} onChange={setDetailPayAmount} />
                  <Input
                    label="Thời gian thanh toán"
                    type="datetime-local"
                    value={detailPayAt}
                    onChange={(e) => setDetailPayAt(e.target.value)}
                  />
                  <Input label="Ghi chú" value={detailPayNote} onChange={(e) => setDetailPayNote(e.target.value)} placeholder="Cọc, đợt 2…" />
                  <Button className="w-full" disabled={detailPayBusy || detailPayAmount <= 0} onClick={addDetailPayment}>
                    {detailPayBusy ? 'Đang lưu…' : 'Ghi nhận thanh toán'}
                  </Button>
                </div>
              )}
            </div>

            {detailOrder.lines.map((l) => (
              <div key={l.id} className="rounded-2xl bg-surface px-3 py-3">
                <p className="font-semibold">{l.formulaName} × {formatNumber(l.quantity)} {l.unit}</p>
                {l.recipeLabel && <p className="text-xs text-muted">Công thức: {l.recipeLabel}</p>}
                <p className="num text-sm">{formatMoney(l.lineTotal)}</p>
              </div>
            ))}
            {writable && (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted">Đổi trạng thái thủ công</p>
                <div className="flex flex-wrap gap-2">
                  {ORDER_STATUS_CORE.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={detailOrder.locked && !canUnlockOrder(profile?.role)}
                      onClick={() => changeOrderStatus(detailOrder, s)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm font-semibold',
                        ORDER_STATUS_COLORS[s].bg,
                        ORDER_STATUS_COLORS[s].text,
                        normalizeOrderStatus(detailOrder.status) === s ? 'ring-2 ring-ink/30' : 'opacity-80',
                      )}
                    >
                      {ORDER_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                {(!detailOrder.locked || canUnlockOrder(profile?.role)) && (
                  <Button variant="outline" onClick={() => loadOrderForEdit(detailOrder)}>
                    <Pencil size={14} /> Chỉnh sửa đơn hàng
                  </Button>
                )}
                <Button variant="secondary" disabled={detailOrder.locked && !canUnlockOrder(profile?.role)} onClick={() => lockAndConfirm(detailOrder)}>
                  Xác nhận & khoá đơn
                </Button>
                <Button variant="outline" onClick={() => exportContract(detailOrder)}>Xuất hợp đồng (n8n)</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
