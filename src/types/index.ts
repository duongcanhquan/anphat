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
  | 'dat_hang'
  | 'dang_san_xuat'
  | 'da_giao'
  | 'huy'
  | 'chua_thanh_toan'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  dat_hang: 'Đặt hàng',
  dang_san_xuat: 'Đang sản xuất',
  da_giao: 'Đã giao',
  huy: 'Huỷ',
  chua_thanh_toan: 'Chưa thanh toán',
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

/** Một công thức / tỷ lệ áp dụng cho thành phẩm */
export interface ProductRecipe {
  id: string
  label: string
  isDefault: boolean
  expression: FormulaExprToken[]
  items: FormulaItem[]
  createdAt: number
  createdBy?: string
}

export interface Formula {
  id: string
  name: string
  description: string
  unit: WeightUnit
  unitPrice: number
  items: FormulaItem[]
  expression?: FormulaExprToken[]
  /** Nhiều công thức cho cùng một thành phẩm */
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
  amount: number
  type: 'vat' | 'discount' | 'fee' | 'other'
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

export interface Order {
  id: string
  code: string
  customerId: string | null
  customerName: string
  lines: OrderLine[]
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
  confirmedAt?: number
  confirmedBy?: string
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

export function calcLineTotal(
  quantity: number,
  unitPrice: number,
  extras: OrderLineExtra[],
): number {
  const base = quantity * unitPrice
  return extras.reduce((sum, e) => {
    if (e.type === 'discount') return sum - e.amount
    return sum + e.amount
  }, base)
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

/** Chuẩn hoá thành phẩm cũ → có danh sách recipes */
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
  return recipes.find((r) => r.id === f.defaultRecipeId) || recipes.find((r) => r.isDefault) || recipes[0]
}

export function recipeItems(recipe: ProductRecipe): FormulaItem[] {
  return recipe.items?.length ? recipe.items : itemsFromExpression(recipe.expression)
}
