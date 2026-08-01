import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Lock, Pencil } from 'lucide-react'
import { MoneyInput } from '@/components/MoneyInput'
import { FormulaBuilder, stockDualUnits, toPreferredUnitItem, toStockUnitQuantity } from '@/components/FormulaBuilder'
import {
  Badge,
  Bento,
  Button,
  Empty,
  Input,
  Modal,
  PageHeader,
  SearchableSelect,
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
  updateFormula,
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
  FormulaExprToken,
  FormulaItem,
  Material,
  Order,
  OrderLine,
  OrderLineExtra,
  OrderPayment,
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
  getCustomerRecipe,
  getDefaultRecipe,
  getProductRecipes,
  itemsFromExpression,
  normalizeOrderStatus,
  normalizeUnit,
  orderPaidTotal,
  orderPaymentsList,
  recipeItems,
  resolveOrderStatus,
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
    // Đơn vị luôn theo đơn vị sản phẩm đã cài đặt — chưa chọn sản phẩm thì để trống
    unit: f?.unit ? normalizeUnit(f.unit) : '',
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

function StatusBadge({ order }: { order: Pick<Order, 'status' | 'totalAmount' | 'deposit' | 'paidAmount' | 'payments'> }) {
  const core = resolveOrderStatus(order)
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
        <div className="grid gap-2 sm:grid-cols-[minmax(7rem,8rem)_minmax(0,1fr)]">
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
        <div className="grid gap-2 sm:grid-cols-[minmax(7rem,8rem)_minmax(0,1fr)]">
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
            <div
              key={ex.id}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)_2.25rem]"
            >
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
                  className="justify-self-end sm:justify-self-auto"
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
  const [ratioModal, setRatioModal] = useState<{
    lineId: string
    items: FormulaItem[]
    originalItems: FormulaItem[]
    materialIds: string[]
  } | null>(null)
  const [saveRecipeAsk, setSaveRecipeAsk] = useState<{
    lineId: string
    formulaId: string
    items: FormulaItem[]
  } | null>(null)
  const [savingRecipe, setSavingRecipe] = useState(false)
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

  /** Tự sửa đơn: đã thanh toán một phần mà vẫn Draft → Đang thực hiện */
  useEffect(() => {
    if (!writable || !profile || orders.length === 0) return
    let cancelled = false
    const fix = async () => {
      const stale = orders.filter((o) => {
        const expected = resolveOrderStatus(o)
        return normalizeOrderStatus(o.status) !== expected
      })
      for (const o of stale.slice(0, 30)) {
        if (cancelled) return
        const expected = resolveOrderStatus(o)
        try {
          await updateOrder(o.id, { status: expected })
        } catch {
          /* ignore single fail */
        }
      }
    }
    void fix()
    return () => { cancelled = true }
  }, [orders, writable, profile])

  const managers = users.filter((u) => u.active && (u.role === 'admin' || u.role === 'superadmin'))
  const activeFormulas = formulas.filter((f) => f.active)
  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: c.id,
        label: c.name,
        searchText: `${c.taxCode || ''} ${c.phone || ''} ${c.address || ''}`,
        hint: [c.taxCode && `MST ${c.taxCode}`, c.phone].filter(Boolean).join(' · ') || undefined,
      })),
    [customers],
  )
  const productOptions = useMemo(
    () =>
      activeFormulas.map((f) => ({
        value: f.id,
        label: f.name,
        searchText: `${f.description || ''} ${normalizeUnit(f.unit)}`,
        hint: normalizeUnit(f.unit),
      })),
    [activeFormulas],
  )
  const managerOptions = useMemo(
    () =>
      managers.map((u) => ({
        value: u.id,
        label: u.displayName,
        searchText: `${u.email || ''} ${u.role}`,
        hint: u.role,
      })),
    [managers],
  )

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
        /** Vật liệu không còn trong kho hoặc tồn không đủ để trừ */
        missing: mat == null,
        shortage: mat == null ? stockQty : Math.max(0, stockQty - mat.stock),
      }
    })
  }, [lines, materials, conversions])

  /** Các vật liệu kho không đủ cho đơn đang tạo */
  const stockShortages = useMemo(
    () => materialNeed.filter((m) => m.qty > 0 && (m.missing || m.shortage > 0.000001)),
    [materialNeed],
  )

  const shortageText = (list: typeof stockShortages) =>
    list
      .map((m) =>
        m.missing
          ? `${m.name} (không còn trong kho)`
          : `${m.name} thiếu ${formatNumber(m.shortage)} ${m.stockUnit}`,
      )
      .join(', ')

  /** Kiểm tra thiếu kho cho danh sách trừ kho của một đơn đã lưu */
  const shortagesForDeduct = (
    items: { materialId: string; materialName: string; unit: string; quantity: number }[],
  ): string[] => {
    const agg = new Map<string, { name: string; unit: string; qty: number }>()
    for (const it of items) {
      const cur = agg.get(it.materialId) || { name: it.materialName, unit: it.unit, qty: 0 }
      cur.qty += it.quantity
      agg.set(it.materialId, cur)
    }
    const out: string[] = []
    for (const [id, v] of agg) {
      if (!(v.qty > 0)) continue
      const mat = materials.find((m) => m.id === id)
      if (!mat) out.push(`${v.name} (không còn trong kho)`)
      else if (v.qty > mat.stock + 0.000001)
        out.push(`${mat.name} thiếu ${formatNumber(v.qty - mat.stock)} ${mat.unit}`)
    }
    return out
  }

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

  /** Đơn vị chuẩn của dòng — luôn lấy theo đơn vị sản phẩm đang cài đặt */
  const lineUnit = (line: OrderLine): string => {
    const f = formulas.find((x) => x.id === line.formulaId)
    return normalizeUnit(f?.unit || line.unit || '')
  }

  const applyRecipe = (lineId: string, f: Formula, recipe: ProductRecipe) => {
    // Ưu tiên đơn vị sau quy đổi; không có quy đổi thì dùng đơn vị nhập kho
    const items = recipeItems(recipe).map((i) => toPreferredUnitItem({ ...i }, materials, conversions))
    updateLine(lineId, {
      formulaId: f.id,
      formulaName: f.name,
      unit: normalizeUnit(f.unit),
      unitPrice: f.unitPrice,
      items,
      recipeId: recipe.id,
      recipeLabel: recipe.label,
    })
  }

  const pickFormula = (lineId: string, formulaId: string) => {
    const f = formulas.find((x) => x.id === formulaId)
    if (!f) return
    // Có công thức riêng đã lưu cho khách này → tự áp dụng
    const custRecipe = getCustomerRecipe(f, customerId)
    if (custRecipe) {
      applyRecipe(lineId, f, custRecipe)
      setMessage(`Đã áp dụng công thức riêng của khách hàng cho "${f.name}".`)
      return
    }
    const general = getProductRecipes(f).filter((r) => !r.customerId)
    if (general.length > 1) {
      setRecipePick({ lineId, formula: f })
      return
    }
    applyRecipe(lineId, f, general[0] || getDefaultRecipe(f))
  }

  /** Lưu công thức vừa chỉnh làm công thức riêng cho khách hàng hiện tại */
  const saveCustomerRecipe = async () => {
    if (!saveRecipeAsk || !profile) return
    const f = formulas.find((x) => x.id === saveRecipeAsk.formulaId)
    const cust = customers.find((c) => c.id === customerId)
    if (!f || !cust) {
      setSaveRecipeAsk(null)
      return
    }
    setSavingRecipe(true)
    try {
      const all = getProductRecipes(f)
      const existing = all.find((r) => r.customerId === cust.id)
      const expression: FormulaExprToken[] = saveRecipeAsk.items.map((i) => ({
        id: `mat-${i.materialId}`,
        kind: 'material' as const,
        materialId: i.materialId,
        materialName: i.materialName,
        quantityPerUnit: i.quantityPerUnit,
        unit: i.unit,
      }))
      const recipe: ProductRecipe = {
        id: existing?.id || uid(),
        label: `KH: ${cust.name}`,
        isDefault: false,
        expression,
        items: saveRecipeAsk.items.map((i) => ({ ...i })),
        createdAt: existing?.createdAt || Date.now(),
        createdBy: profile.id,
        customerId: cust.id,
        customerName: cust.name,
      }
      const next = existing
        ? all.map((r) => (r.customerId === cust.id ? recipe : r))
        : [...all, recipe]
      await updateFormula(f.id, {
        recipes: next,
        defaultRecipeId: f.defaultRecipeId || next.find((r) => r.isDefault)?.id || next[0].id,
      })
      updateLine(saveRecipeAsk.lineId, { recipeId: recipe.id, recipeLabel: recipe.label })
      await createAuditLog({
        entityType: 'formula',
        entityId: f.id,
        entityLabel: f.name,
        action: 'update',
        summary: `Lưu công thức riêng cho khách "${cust.name}" — sản phẩm "${f.name}"`,
        userId: profile.id,
        userName: profile.displayName,
        createdAt: Date.now(),
      })
      setMessage(`Đã lưu công thức riêng cho ${cust.name}. Lần sau tạo đơn sẽ tự áp dụng.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lỗi lưu công thức riêng')
    } finally {
      setSavingRecipe(false)
      setSaveRecipeAsk(null)
    }
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
    setLines(
      order.lines.map((l) => ({
        ...l,
        // Đồng bộ vật liệu về đơn vị sau quy đổi hiện hành (không có quy đổi → đơn vị nhập)
        items: l.items.map((i) => toPreferredUnitItem({ ...i }, materials, conversions)),
        extras: l.extras.map((e) => ({ ...e })),
      })),
    )
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

      // Chỉ Draft khi chưa có tiền. Có cọc → Đang thực hiện. Đủ tiền → Hoàn thiện.
      // Nút "Lưu Draft" chỉ hợp lệ khi chưa thanh toán.
      if (asDraft === true && finalPaid > 0) {
        setMessage('Đã có thanh toán/cọc — không thể lưu Draft. Trạng thái sẽ là Đang thực hiện.')
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

      // Chặn chốt đơn khi kho không đủ nguyên liệu (đơn sẽ trừ kho)
      if (shouldDeduct && stockShortages.length > 0) {
        setMessage(
          `Không thể chốt đơn — kho không đủ nguyên liệu: ${shortageText(stockShortages)}. Hãy nhập kho trước, hoặc lưu Draft (chưa trừ kho).`,
        )
        setBusy(false)
        return
      }

      const finalContract = contractAmount > 0 ? contractAmount : totalAmount

      const orderPayload: Omit<Order, 'id'> = {
        code: orderCode,
        customerId: cust.id,
        customerName: cust.name,
        // Đồng bộ lại đơn vị theo sản phẩm đang cài đặt trước khi lưu
        lines: lines.map((l) => ({ ...l, unit: lineUnit(l), status })),
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
    const paid = orderPaidTotal(order)
    // Không cho đặt Draft khi đã có tiền
    let next = status
    if (status === 'draft' && paid > 0) {
      next = statusFromPayment(order.totalAmount, paid)
      setMessage('Đã có thanh toán — không thể để Draft. Chuyển Đang thực hiện.')
    } else if (status !== 'huy') {
      next = statusFromPayment(order.totalAmount, paid)
    }
    const patch: Partial<Order> = { status: next }
    if (next !== 'draft' && next !== 'huy' && !order.stockDeducted) {
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
      const lack = shortagesForDeduct(deductItems)
      if (lack.length > 0) {
        setMessage(`Không thể chuyển trạng thái — kho không đủ nguyên liệu: ${lack.join(', ')}. Hãy nhập kho trước.`)
        return
      }
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
      summary: `Đổi trạng thái đơn ${order.code} → ${ORDER_STATUS_LABELS[next]}`,
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
        const lack = shortagesForDeduct(deductItems)
        if (lack.length > 0) {
          setMessage(
            `Không thể ghi thanh toán — đơn sẽ trừ kho nhưng kho không đủ nguyên liệu: ${lack.join(', ')}. Hãy nhập kho trước.`,
          )
          setDetailPayBusy(false)
          return
        }
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
    // Sửa đơn cũ: đã có cọc mà vẫn Draft → chuyển Đang thực hiện
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
        const lack = shortagesForDeduct(deductItems)
        if (lack.length > 0) {
          // Không tự trừ kho khi thiếu — chỉ mở chi tiết kèm cảnh báo
          setDetailOrder(order)
          setMessage(`Đơn ${order.code} có thanh toán nhưng kho không đủ nguyên liệu để trừ: ${lack.join(', ')}.`)
          return
        }
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
    const s = resolveOrderStatus(o)
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
          <div className="min-w-0 space-y-3 lg:col-span-3">
            {editingOrder && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm">
                <span>Đang sửa đơn <strong>{editingOrder.code}</strong></span>
                <Button size="sm" variant="outline" onClick={resetDraft}>Huỷ sửa</Button>
              </div>
            )}

            <Bento title="Khách hàng">
              <SearchableSelect
                label="Chọn khách hàng"
                value={customerId}
                onChange={setCustomerId}
                options={customerOptions}
                placeholder="— Chọn khách hàng —"
                searchPlaceholder="Gõ tên, MST, SĐT…"
                disabled={!writable}
                required
              />
            </Bento>

            <Bento title="Người phụ trách">
              <SearchableSelect
                label="Chọn Admin / Superadmin"
                value={assignedTo}
                onChange={setAssignedTo}
                options={managerOptions}
                placeholder="— Chọn người phụ trách —"
                searchPlaceholder="Gõ tên…"
                disabled={!writable}
                allowClear={false}
              />
            </Bento>

            {lines.map((line, idx) => (
              <Bento
                key={line.id}
                title={`Sản phẩm ${idx + 1}`}
                subtitle={lineUnit(line) ? `Đơn vị: ${lineUnit(line)}` : undefined}
                action={
                  lines.length > 1 && writable ? (
                    <Button variant="ghost" size="sm" onClick={() => setLines((p) => p.filter((l) => l.id !== line.id))}>
                      <Trash2 size={16} />
                    </Button>
                  ) : undefined
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <SearchableSelect
                    label="Sản phẩm"
                    value={line.formulaId}
                    disabled={!writable}
                    onChange={(v) => pickFormula(line.id, v)}
                    options={productOptions}
                    placeholder="— Chọn sản phẩm —"
                    searchPlaceholder="Gõ tên sản phẩm…"
                  />
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
                    label={`Số lượng (${lineUnit(line) || 'đơn vị'})`}
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
                      <p className="text-sm font-semibold">Vật liệu / 1 {lineUnit(line)}</p>
                      {writable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const f = formulas.find((x) => x.id === line.formulaId)
                            const normalized = line.items.map((i) =>
                              toPreferredUnitItem({ ...i }, materials, conversions),
                            )
                            setRatioModal({
                              lineId: line.id,
                              items: normalized,
                              originalItems: normalized.map((i) => ({ ...i })),
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

          <div className="min-w-0 space-y-3 lg:col-span-2">
            <Bento title="Vật liệu cần xuất kho">
              {materialNeed.length === 0 ? (
                <Empty text="Chọn sản phẩm để xem vật liệu." />
              ) : (
                <div className="space-y-2">
                  {stockShortages.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                      Kho không đủ nguyên liệu — không thể chốt đơn. Hãy nhập kho trước.
                    </div>
                  )}
                  {materialNeed.map((m) => {
                    const short = m.qty > 0 && (m.missing || m.shortage > 0.000001)
                    return (
                      <div
                        key={m.id + m.unit}
                        className={cn(
                          'rounded-xl px-3 py-2',
                          short ? 'border border-red-200 bg-red-50' : 'bg-surface',
                        )}
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{m.name}</span>
                          <span className={cn('num font-bold', short && 'text-red-700')}>
                            {formatNumber(m.qty)} {m.unit}
                          </span>
                        </div>
                        <p className={cn('mt-1 text-xs', short ? 'text-red-700' : 'text-muted')}>
                          Trừ kho: {formatNumber(m.stockQty)} {m.stockUnit}
                          {m.stockAvailable != null && (
                            <> · Tồn: {formatNumber(m.stockAvailable)} {m.stockUnit}</>
                          )}
                          {m.convertedAvailable != null && m.convertedUnit && (
                            <> ({formatNumber(m.convertedAvailable)} {m.convertedUnit})</>
                          )}
                          {m.missing && <> · Vật liệu không còn trong kho</>}
                          {!m.missing && m.shortage > 0.000001 && (
                            <>
                              {' '}· <strong>Thiếu {formatNumber(m.shortage)} {m.stockUnit}</strong>
                            </>
                          )}
                        </p>
                      </div>
                    )
                  })}
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
                  <p className="text-xs font-semibold uppercase tracking-wider text-surface/90">Đã thanh toán (cọc + các đợt)</p>
                  <p className="num text-2xl font-extrabold text-white">{formatMoney(paidWithPending)}</p>
                  <p className="mt-1 text-sm text-surface/90">
                    Công nợ: <strong className="num text-amber-300">{formatMoney(debt)}</strong>
                  </p>
                  {pendingPay > 0 && (
                    <p className="mt-1 text-xs text-surface/90">
                      Đang nhập +{formatMoney(pendingPay)} — sẽ tự ghi nhận khi lưu đơn
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-line bg-white p-3">
                  <p className="mb-2 text-sm font-bold">Lịch sử thanh toán</p>
                  {payments.length === 0 && pendingPay <= 0 ? (
                    <p className="mb-3 text-xs text-muted">Chưa có tiền → đơn là Draft. Nhập cọc bên dưới để chuyển Đang thực hiện.</p>
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
                  <div className="grid grid-cols-2 gap-2">
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
                          'rounded-xl border border-transparent px-2 py-2 text-center text-sm font-semibold leading-snug',
                          ORDER_STATUS_COLORS[s].bg,
                          ORDER_STATUS_COLORS[s].text,
                          orderStatus === s ? 'ring-2 ring-ink/30' : 'opacity-80',
                        )}
                      >
                        {ORDER_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Chưa có tiền → Draft · Có cọc → Đang thực hiện · Đủ tiền → Hoàn thiện. Draft chưa trừ kho.
                  </p>
                </div>
                <Textarea label="Ghi chú" value={note} disabled={!writable} onChange={(e) => setNote(e.target.value)} />
              </div>
            </Bento>

            {writable && (
              <div className="grid gap-2">
                {stockShortages.length > 0 && !editingOrder?.stockDeducted && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <p className="font-semibold">Kho không đủ nguyên liệu — không thể chốt đơn.</p>
                    <p className="mt-1 text-xs">
                      {shortageText(stockShortages)}.{' '}
                      {paidWithPending > 0
                        ? 'Hãy nhập kho trước, hoặc bỏ thanh toán để lưu Draft.'
                        : 'Hãy nhập kho trước, hoặc lưu Draft (chưa trừ kho).'}
                    </p>
                  </div>
                )}
                <Button
                  size="lg"
                  disabled={busy || (stockShortages.length > 0 && !editingOrder?.stockDeducted)}
                  onClick={() => confirmOrder(false)}
                >
                  {busy
                    ? 'Đang lưu…'
                    : stockShortages.length > 0 && !editingOrder?.stockDeducted
                      ? 'Thiếu nguyên liệu — không thể chốt'
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
                    Lưu Draft (nháp — chưa trừ kho)
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
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => void openOrderDetail(o)}
                    className="flex w-full flex-col gap-1.5 rounded-xl bg-surface/70 px-3 py-2 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 break-words font-semibold">
                      {o.code} · {o.customerName}
                    </span>
                    <StatusBadge order={o} />
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
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => void openOrderDetail(o)}
                    className="bento flex w-full flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display font-bold">{o.code}</p>
                        {o.locked && (
                          <Badge tone="warn">
                            <Lock size={10} className="mr-1 inline" />
                            Khoá
                          </Badge>
                        )}
                        <StatusBadge order={o} />
                      </div>
                      <p className="break-words text-sm text-muted">
                        {o.customerName} · {formatDateTime(o.orderAt)}
                        {o.assignedToName && ` · PT: ${o.assignedToName}`}
                      </p>
                    </div>
                    <p className="num text-lg font-extrabold sm:shrink-0">{formatMoney(o.totalAmount)}</p>
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
            {getProductRecipes(recipePick.formula)
              .filter((r) => !r.customerId || r.customerId === customerId)
              .map((r) => (
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
                  {r.customerId && ' · riêng cho khách này'}
                </Button>
              ))}
          </div>
        )}
      </Modal>

      <Modal
        open={!!saveRecipeAsk}
        onClose={() => setSaveRecipeAsk(null)}
        title="Lưu công thức riêng cho khách hàng?"
      >
        {saveRecipeAsk && (
          <div className="space-y-3">
            <p className="text-sm">
              Bạn vừa thay đổi công thức của sản phẩm{' '}
              <strong>{formulas.find((f) => f.id === saveRecipeAsk.formulaId)?.name || ''}</strong>.
              Lưu làm công thức riêng cho khách{' '}
              <strong>{customers.find((c) => c.id === customerId)?.name || ''}</strong>?
            </p>
            <div className="rounded-xl bg-surface/80 p-3">
              {saveRecipeAsk.items.map((i) => (
                <div key={i.materialId} className="flex justify-between text-sm">
                  <span>{i.materialName}</span>
                  <span className="num font-semibold">
                    {formatNumber(i.quantityPerUnit)} {i.unit}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">
              Nếu lưu, lần sau tạo đơn cho khách này với sản phẩm này sẽ tự áp dụng công thức riêng.
              Công thức mặc định của sản phẩm không thay đổi.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button disabled={savingRecipe} onClick={() => void saveCustomerRecipe()}>
                {savingRecipe ? 'Đang lưu…' : 'Lưu công thức riêng'}
              </Button>
              <Button variant="outline" disabled={savingRecipe} onClick={() => setSaveRecipeAsk(null)}>
                Không lưu — chỉ dùng cho đơn này
              </Button>
            </div>
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
            <Button
              className="w-full"
              onClick={() => {
                const changed =
                  JSON.stringify(ratioModal.items) !== JSON.stringify(ratioModal.originalItems)
                const line = lines.find((l) => l.id === ratioModal.lineId)
                updateLine(ratioModal.lineId, {
                  items: ratioModal.items,
                  ...(changed ? { recipeLabel: 'Tùy chỉnh cho đơn này' } : {}),
                })
                // Công thức đã thay đổi → hỏi có lưu riêng cho khách hàng không
                if (changed && writable && customerId && line?.formulaId) {
                  setSaveRecipeAsk({
                    lineId: ratioModal.lineId,
                    formulaId: line.formulaId,
                    items: ratioModal.items.map((i) => ({ ...i })),
                  })
                }
                setRatioModal(null)
              }}
            >
              Áp dụng cho đơn
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={!!detailOrder} onClose={() => setDetailOrder(null)} title={detailOrder ? `Đơn ${detailOrder.code}` : 'Đơn'} wide>
        {detailOrder && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge order={detailOrder} />
              {detailOrder.locked && <Badge tone="warn">Đã khoá</Badge>}
              {resolveOrderStatus(detailOrder) === 'draft' && (
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
                <p className="font-semibold">{l.formulaName} × {formatNumber(l.quantity)} {normalizeUnit(l.unit)}</p>
                {l.recipeLabel && <p className="text-xs text-muted">Công thức: {l.recipeLabel}</p>}
                <p className="num text-sm">{formatMoney(l.lineTotal)}</p>
              </div>
            ))}
            {writable && (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted">Đổi trạng thái thủ công</p>
                <div className="grid grid-cols-2 gap-2">
                  {ORDER_STATUS_CORE.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={detailOrder.locked && !canUnlockOrder(profile?.role)}
                      onClick={() => changeOrderStatus(detailOrder, s)}
                      className={cn(
                        'rounded-xl border border-transparent px-2 py-2 text-center text-sm font-semibold leading-snug',
                        ORDER_STATUS_COLORS[s].bg,
                        ORDER_STATUS_COLORS[s].text,
                        resolveOrderStatus(detailOrder) === s ? 'ring-2 ring-ink/30' : 'opacity-80',
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
