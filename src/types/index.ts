export type UserRole = 'superadmin' | 'admin' | 'viewer'

/** Đơn vị tính — mặc định + admin thêm tùy chỉnh */
export type WeightUnit = string

export const DEFAULT_WEIGHT_UNITS: readonly string[] = ['Tấn', 'Kg', 'Khối', 'Lít', 'Thùng', 'Bao']

const LEGACY_UNIT_MAP: Record<string, string> = {
  TẤN: 'Tấn',
  TON: 'Tấn',
  KG: 'Kg',
  m3: 'Khối',
  M3: 'Khối',
  LÍT: 'Lít',
  LIT: 'Lít',
  BAO: 'Bao',
}

export function normalizeUnit(unit: string): string {
  return LEGACY_UNIT_MAP[unit] || unit
}

export function allWeightUnits(customUnits: string[] = []): string[] {
  const set = new Set([...DEFAULT_WEIGHT_UNITS, ...customUnits.map(normalizeUnit)])
  return [...set]
}

export type OrderStatus =
  | 'draft'
  | 'dang_lam'
  | 'hoan_thien'
  | 'huy'
  /** legacy — vẫn đọc được dữ liệu cũ */
  | 'dat_hang'
  | 'dang_san_xuat'
  | 'da_giao'
  | 'chua_thanh_toan'

/** Trạng thái chính dùng trong UI */
export type OrderStatusCore = 'draft' | 'dang_lam' | 'hoan_thien' | 'huy'

export const ORDER_STATUS_CORE: OrderStatusCore[] = ['draft', 'dang_lam', 'hoan_thien', 'huy']

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft (nháp)',
  dang_lam: 'Đang thực hiện',
  hoan_thien: 'Hoàn thiện',
  huy: 'Huỷ',
  dat_hang: 'Draft (nháp)',
  dang_san_xuat: 'Đang thực hiện',
  da_giao: 'Hoàn thiện',
  chua_thanh_toan: 'Draft (nháp)',
}

export function normalizeOrderStatus(s: OrderStatus | undefined): OrderStatusCore {
  if (s === 'dang_lam' || s === 'dang_san_xuat') return 'dang_lam'
  if (s === 'hoan_thien' || s === 'da_giao') return 'hoan_thien'
  if (s === 'huy') return 'huy'
  return 'draft'
}

/**
 * Trạng thái theo tiền đã thanh toán:
 * - Chưa có tiền → Draft
 * - Đã có cọc / thanh toán một phần → Đang thực hiện
 * - Đủ tiền (≥ tổng hợp đồng) → Hoàn thiện
 * Có tiền thì không bao giờ là Draft.
 */
export function statusFromPayment(totalAmount: number, paidTotal: number): OrderStatusCore {
  const paid = Number(paidTotal) || 0
  const total = Number(totalAmount) || 0
  if (paid > 0) {
    if (total > 0 && paid + 0.5 >= total) return 'hoan_thien'
    return 'dang_lam'
  }
  return 'draft'
}

/** Trạng thái hiển thị / lưu: luôn theo tiền (trừ khi Huỷ) */
export function resolveOrderStatus(
  o: Pick<Order, 'status' | 'totalAmount' | 'deposit' | 'paidAmount' | 'payments'>,
): OrderStatusCore {
  if (normalizeOrderStatus(o.status) === 'huy') return 'huy'
  return statusFromPayment(o.totalAmount || 0, orderPaidTotal(o))
}

/** @deprecated dùng allWeightUnits(settings.customUnits) */
export const WEIGHT_UNITS: WeightUnit[] = [...DEFAULT_WEIGHT_UNITS]

export interface AppUser {
  id: string
  email: string
  displayName: string
  role: UserRole
  active: boolean
  createdAt: number
  createdBy?: string
}

export type FormulaOp = '+' | '-' | '*' | '/'

export type FormulaExprToken =
  | {
      id: string
      kind: 'material'
      materialId: string
      materialName: string
      quantityPerUnit: number
      unit: WeightUnit
    }
  | { id: string; kind: 'op'; op: FormulaOp }
  | { id: string; kind: 'number'; value: number }

export interface Material {
  id: string
  name: string
  description: string
  unit: WeightUnit
  stock: number
  avgCost: number
  lowStockAlert: number
  active: boolean
  createdAt: number
  updatedAt: number
}

export type StockMovementType = 'import' | 'export'

export interface StockEntry {
  id: string
  materialId: string
  materialName: string
  quantity: number
  unit: WeightUnit
  cost: number
  contractor: string
  note: string
  createdAt: number
  createdBy: string
  createdByName?: string
  /** import = nhập kho, export = xuất kho (đơn hàng) */
  type?: StockMovementType
  batchLabel?: string
  orderId?: string
  orderCode?: string
}

export interface Conversion {
  id: string
  materialId: string
  materialName: string
  fromUnit: WeightUnit
  toUnit: WeightUnit
  factor: number
  note: string
  createdAt: number
}

export interface FormulaItem {
  materialId: string
  materialName: string
  quantityPerUnit: number
  unit: WeightUnit
}

export interface FormulaVersion {
  id: string
  label: string
  items: FormulaItem[]
  createdAt: number
  createdBy: string
}

/** Một công thức / tỷ lệ áp dụng cho sản phẩm */
export interface ProductRecipe {
  id: string
  label: string
  isDefault: boolean
  expression: FormulaExprToken[]
  items: FormulaItem[]
  createdAt: number
  createdBy?: string
  /** Công thức riêng cho một khách hàng — tự áp dụng khi tạo đơn cho khách đó */
  customerId?: string
  customerName?: string
}

export interface Formula {
  id: string
  name: string
  description: string
  unit: WeightUnit
  unitPrice: number
  items: FormulaItem[]
  expression?: FormulaExprToken[]
  /** Nhiều công thức cho cùng một sản phẩm */
  recipes?: ProductRecipe[]
  defaultRecipeId?: string
  /** Vật liệu thành phần (đơn vị tương đương) */
  materialIds?: string[]
  history: FormulaVersion[]
  active: boolean
  createdAt: number
  updatedAt: number
}

export interface Customer {
  id: string
  name: string
  taxCode: string
  address: string
  representative: string
  phone: string
  email: string
  note: string
  totalDebt: number
  totalPurchased: number
  createdAt: number
  updatedAt: number
}

export interface OrderLineExtra {
  id: string
  label: string
  /** Giá trị số tiền hoặc % tuỳ mode */
  amount: number
  mode?: 'amount' | 'percent'
  type: 'vat' | 'discount' | 'other'
}

export interface OrderLine {
  id: string
  formulaId: string
  formulaName: string
  quantity: number
  unit: WeightUnit
  unitPrice: number
  items: FormulaItem[]
  recipeId?: string
  recipeLabel?: string
  usedHistoryId?: string
  extras: OrderLineExtra[]
  lineTotal: number
  status: OrderStatus
  note: string
}

export interface OrderPayment {
  id: string
  amount: number
  note: string
  paidAt: number
  createdBy: string
  createdByName?: string
}

export interface Order {
  id: string
  code: string
  customerId: string | null
  customerName: string
  lines: OrderLine[]
  /** @deprecated gộp vào paidAmount / payments */
  deposit: number
  paidAmount: number
  contractAmount: number
  debt: number
  totalAmount: number
  status: OrderStatus
  locked: boolean
  contractExported: boolean
  note: string
  orderAt: number
  createdAt: number
  updatedAt: number
  createdBy: string
  createdByName?: string
  assignedTo?: string
  assignedToName?: string
  confirmedAt?: number
  confirmedBy?: string
  /** Lịch sử thanh toán nhiều đợt */
  payments?: OrderPayment[]
  /** Đã trừ kho chưa (draft chưa trừ) */
  stockDeducted?: boolean
}

export interface CompanySettings {
  name: string
  taxCode: string
  address: string
  phone: string
  email: string
  bankAccount: string
  bankName: string
  representative: string
  n8nWebhookUrl: string
  n8nEnabled: boolean
  logoText: string
  customUnits?: string[]
}

export interface DebtPayment {
  id: string
  customerId: string
  customerName: string
  orderId?: string
  amount: number
  note: string
  createdAt: number
  createdBy: string
}

/** Lịch sử chỉnh sửa — Superadmin xem */
export interface AuditLog {
  id: string
  entityType: string
  entityId: string
  entityLabel: string
  action: 'create' | 'update' | 'delete'
  summary: string
  before?: string
  after?: string
  userId: string
  userName: string
  createdAt: number
}

export const ORDER_STATUS_COLORS: Record<
  OrderStatus,
  { tone: 'default' | 'accent' | 'ok' | 'warn' | 'danger' | 'info'; bg: string; text: string }
> = {
  draft: { tone: 'info', bg: 'bg-slate-100', text: 'text-slate-700' },
  dang_lam: { tone: 'warn', bg: 'bg-amber-100', text: 'text-amber-900' },
  hoan_thien: { tone: 'ok', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  huy: { tone: 'danger', bg: 'bg-red-100', text: 'text-red-800' },
  dat_hang: { tone: 'info', bg: 'bg-slate-100', text: 'text-slate-700' },
  dang_san_xuat: { tone: 'warn', bg: 'bg-amber-100', text: 'text-amber-900' },
  da_giao: { tone: 'ok', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  chua_thanh_toan: { tone: 'info', bg: 'bg-slate-100', text: 'text-slate-700' },
}

/** Tổng tiền dòng = SL × đơn giá + VAT − chiết khấu ± khác */
export function calcLineTotal(
  quantity: number,
  unitPrice: number,
  extras: OrderLineExtra[],
): number {
  const base = quantity * unitPrice
  return extras.reduce((sum, e) => {
    const mode = e.mode || 'amount'
    const delta = mode === 'percent' ? (base * (e.amount || 0)) / 100 : e.amount || 0
    if (e.type === 'discount') return sum - delta
    return sum + delta
  }, base)
}

export function extraMoneyValue(extra: OrderLineExtra, base: number): number {
  const mode = extra.mode || 'amount'
  return mode === 'percent' ? (base * (extra.amount || 0)) / 100 : extra.amount || 0
}

/** Tổng đã thanh toán (payments + paidAmount + deposit cũ) */
export function orderPaidTotal(
  o: Pick<Order, 'deposit' | 'paidAmount' | 'payments'>,
): number {
  const fromPayments = (o.payments || []).reduce((s, p) => s + (Number(p?.amount) || 0), 0)
  const fromLegacy = (Number(o.paidAmount) || 0) + (Number(o.deposit) || 0)
  // Ưu tiên lịch sử thanh toán; nếu rỗng thì lấy paidAmount/deposit cũ
  if ((o.payments?.length || 0) > 0) return fromPayments
  return fromLegacy
}

export function orderPaymentsList(o: Pick<Order, 'payments' | 'paidAmount' | 'deposit' | 'createdAt' | 'createdBy' | 'createdByName'>): OrderPayment[] {
  if (o.payments?.length) {
    return [...o.payments]
      .map((p) => ({ ...p, amount: Number(p.amount) || 0 }))
      .sort((a, b) => b.paidAt - a.paidAt)
  }
  const legacy = (Number(o.paidAmount) || 0) + (Number(o.deposit) || 0)
  if (legacy <= 0) return []
  return [
    {
      id: 'legacy',
      amount: legacy,
      note: 'Thanh toán (dữ liệu cũ)',
      paidAt: o.createdAt,
      createdBy: o.createdBy || '',
      createdByName: o.createdByName,
    },
  ]
}

export function canWrite(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'superadmin'
}

export function canDeleteMaterial(role: UserRole | undefined): boolean {
  return role === 'superadmin'
}

export function canUnlockOrder(role: UserRole | undefined): boolean {
  return role === 'superadmin'
}

export function canManageUsers(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'superadmin'
}

/** Admin không thấy Superadmin và Viewer */
export function visibleUsersFor(
  role: UserRole | undefined,
  users: AppUser[],
  currentUserId?: string,
): AppUser[] {
  if (role === 'superadmin') return users
  if (role === 'admin') {
    return users.filter(
      (u) =>
        u.role === 'admin' &&
        (u.id === currentUserId || u.createdBy === currentUserId),
    )
  }
  return []
}

export function itemsFromExpression(expression: FormulaExprToken[] | undefined): FormulaItem[] {
  if (!expression?.length) return []
  const map = new Map<string, FormulaItem>()
  for (const t of expression) {
    if (t.kind !== 'material') continue
    const prev = map.get(t.materialId)
    if (prev) {
      prev.quantityPerUnit += t.quantityPerUnit
    } else {
      map.set(t.materialId, {
        materialId: t.materialId,
        materialName: t.materialName,
        quantityPerUnit: t.quantityPerUnit,
        unit: t.unit,
      })
    }
  }
  return [...map.values()]
}

/** Chuẩn hoá sản phẩm cũ → có danh sách recipes */
export function getProductRecipes(f: Formula): ProductRecipe[] {
  if (f.recipes?.length) return f.recipes
  const items = f.items?.length ? f.items : itemsFromExpression(f.expression)
  const expression = f.expression?.length
    ? f.expression
    : items.flatMap((i, idx) => {
        const tokens: FormulaExprToken[] = []
        if (idx > 0) tokens.push({ id: `op-${idx}`, kind: 'op', op: '+' })
        tokens.push({
          id: `mat-${i.materialId}`,
          kind: 'material',
          materialId: i.materialId,
          materialName: i.materialName,
          quantityPerUnit: i.quantityPerUnit,
          unit: i.unit,
        })
        return tokens
      })
  const recipe: ProductRecipe = {
    id: f.defaultRecipeId || 'default',
    label: 'Mặc định',
    isDefault: true,
    expression,
    items,
    createdAt: f.createdAt,
  }
  return [recipe]
}

export function getDefaultRecipe(f: Formula): ProductRecipe {
  const recipes = getProductRecipes(f)
  return (
    recipes.find((r) => r.id === f.defaultRecipeId && !r.customerId) ||
    recipes.find((r) => r.isDefault && !r.customerId) ||
    recipes.find((r) => !r.customerId) ||
    recipes[0]
  )
}

/** Công thức riêng đã lưu cho một khách hàng (nếu có) */
export function getCustomerRecipe(f: Formula, customerId: string | undefined | null): ProductRecipe | undefined {
  if (!customerId) return undefined
  return getProductRecipes(f).find((r) => r.customerId === customerId)
}

export function recipeItems(recipe: ProductRecipe): FormulaItem[] {
  return recipe.items?.length ? recipe.items : itemsFromExpression(recipe.expression)
}
