export type UserRole = 'superadmin' | 'admin' | 'viewer'

export type WeightUnit = 'TẤN' | 'KG' | 'm3' | 'LÍT' | 'BAO'

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

export const WEIGHT_UNITS: WeightUnit[] = ['TẤN', 'KG', 'm3', 'LÍT', 'BAO']

export interface AppUser {
  id: string
  email: string
  displayName: string
  role: UserRole
  active: boolean
  createdAt: number
}

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

export interface Formula {
  id: string
  name: string
  description: string
  unit: WeightUnit
  unitPrice: number
  items: FormulaItem[]
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
