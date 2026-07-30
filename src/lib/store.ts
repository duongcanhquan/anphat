import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  AppUser,
  Material,
  StockEntry,
  Conversion,
  Formula,
  Customer,
  Order,
  CompanySettings,
  DebtPayment,
  FormulaItem,
  AuditLog,
} from '@/types'

const COL = {
  users: 'users',
  materials: 'materials',
  stockEntries: 'stockEntries',
  conversions: 'conversions',
  formulas: 'formulas',
  customers: 'customers',
  orders: 'orders',
  settings: 'settings',
  payments: 'debtPayments',
  auditLogs: 'auditLogs',
} as const

export const DEFAULT_SETTINGS: CompanySettings = {
  name: 'ASPHALT AN PHÁT',
  taxCode: '',
  address: '',
  phone: '',
  email: '',
  bankAccount: '',
  bankName: '',
  representative: '',
  n8nWebhookUrl: '',
  n8nEnabled: false,
  logoText: 'AN PHÁT',
  customUnits: [],
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = { ...obj }
  for (const k of Object.keys(out)) {
    const v = out[k]
    if (v === undefined) {
      delete out[k]
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripUndefined(item as Record<string, unknown>)
          : item,
      )
    } else if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      out[k] = stripUndefined(v as Record<string, unknown>)
    }
  }
  return out as T
}

// ——— Users ———
export async function getUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, COL.users, uid))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as AppUser
}

export async function upsertUser(user: AppUser) {
  await setDoc(doc(db, COL.users, user.id), stripUndefined({ ...user }), { merge: true })
}

export async function deleteUserDoc(uid: string) {
  await deleteDoc(doc(db, COL.users, uid))
}

export async function listUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, COL.users))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppUser)
}

export function watchUsers(cb: (users: AppUser[]) => void): Unsubscribe {
  return onSnapshot(collection(db, COL.users), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppUser))
  })
}

// ——— Settings ———
export async function getSettings(): Promise<CompanySettings> {
  const snap = await getDoc(doc(db, COL.settings, 'company'))
  if (!snap.exists()) return DEFAULT_SETTINGS
  return { ...DEFAULT_SETTINGS, ...snap.data() } as CompanySettings
}

export async function saveSettings(settings: CompanySettings) {
  await setDoc(doc(db, COL.settings, 'company'), settings, { merge: true })
}

export function watchSettings(cb: (s: CompanySettings) => void): Unsubscribe {
  return onSnapshot(doc(db, COL.settings, 'company'), (snap) => {
    if (!snap.exists()) cb(DEFAULT_SETTINGS)
    else cb({ ...DEFAULT_SETTINGS, ...snap.data() } as CompanySettings)
  })
}

// ——— Materials ———
export function watchMaterials(cb: (items: Material[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, COL.materials), orderBy('name')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Material))
  })
}

export async function createMaterial(data: Omit<Material, 'id'>) {
  const ref = await addDoc(collection(db, COL.materials), data)
  return ref.id
}

export async function updateMaterial(id: string, data: Partial<Material>) {
  await updateDoc(doc(db, COL.materials, id), stripUndefined({ ...data, updatedAt: Date.now() }))
}

export async function deleteMaterial(id: string) {
  await deleteDoc(doc(db, COL.materials, id))
}

// ——— Stock ———
export function watchStockEntries(cb: (items: StockEntry[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL.stockEntries), orderBy('createdAt', 'desc')),
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StockEntry))
    },
  )
}

export async function addStockEntry(entry: Omit<StockEntry, 'id'>, materialStock: number) {
  const batch = writeBatch(db)
  const entryRef = doc(collection(db, COL.stockEntries))
  batch.set(entryRef, { type: 'import', ...entry })
  const matRef = doc(db, COL.materials, entry.materialId)
  const matSnap = await getDoc(matRef)
  if (matSnap.exists()) {
    const mat = matSnap.data() as Material
    const newStock = materialStock + entry.quantity
    const totalValue = mat.avgCost * mat.stock + entry.cost
    const avgCost = newStock > 0 ? totalValue / newStock : 0
    batch.update(matRef, { stock: newStock, avgCost, updatedAt: Date.now() })
  }
  await batch.commit()
  return entryRef.id
}

export interface DeductStockOptions {
  orderId?: string
  orderCode?: string
  createdBy?: string
  createdByName?: string
  note?: string
}

export async function deductStock(
  items: { materialId: string; quantity: number; materialName?: string; unit?: string }[],
  opts: DeductStockOptions = {},
): Promise<void> {
  const batch = writeBatch(db)
  for (const item of items) {
    const matRef = doc(db, COL.materials, item.materialId)
    const snap = await getDoc(matRef)
    if (!snap.exists()) continue
    const mat = snap.data() as Material
    const newStock = Math.max(0, mat.stock - item.quantity)
    batch.update(matRef, {
      stock: newStock,
      updatedAt: Date.now(),
    })
    const exportRef = doc(collection(db, COL.stockEntries))
    batch.set(exportRef, {
      materialId: item.materialId,
      materialName: item.materialName || mat.name,
      quantity: item.quantity,
      unit: item.unit || mat.unit,
      cost: 0,
      contractor: '',
      note: opts.note || (opts.orderCode ? `Xuất cho đơn ${opts.orderCode}` : 'Xuất kho'),
      createdAt: Date.now(),
      createdBy: opts.createdBy || '',
      createdByName: opts.createdByName || '',
      type: 'export',
      orderId: opts.orderId || '',
      orderCode: opts.orderCode || '',
    })
  }
  await batch.commit()
}

// ——— Conversions ———
export function watchConversions(cb: (items: Conversion[]) => void): Unsubscribe {
  return onSnapshot(collection(db, COL.conversions), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversion))
  })
}

export async function createConversion(data: Omit<Conversion, 'id'>) {
  const ref = await addDoc(collection(db, COL.conversions), data)
  return ref.id
}

export async function updateConversion(id: string, data: Partial<Conversion>) {
  await updateDoc(doc(db, COL.conversions, id), stripUndefined({ ...data }))
}

export async function deleteConversion(id: string) {
  await deleteDoc(doc(db, COL.conversions, id))
}

// ——— Formulas ———
export function watchFormulas(cb: (items: Formula[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, COL.formulas), orderBy('name')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Formula))
  })
}

export async function createFormula(data: Omit<Formula, 'id'>) {
  const ref = await addDoc(collection(db, COL.formulas), data)
  return ref.id
}

export async function updateFormula(id: string, data: Partial<Formula>) {
  await updateDoc(doc(db, COL.formulas, id), stripUndefined({ ...data, updatedAt: Date.now() }))
}

export async function deleteFormula(id: string) {
  await deleteDoc(doc(db, COL.formulas, id))
}

// ——— Customers ———
export function watchCustomers(cb: (items: Customer[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, COL.customers), orderBy('name')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer))
  })
}

export async function createCustomer(data: Omit<Customer, 'id'>) {
  const ref = await addDoc(collection(db, COL.customers), data)
  return ref.id
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  await updateDoc(doc(db, COL.customers, id), stripUndefined({ ...data, updatedAt: Date.now() }))
}

export async function deleteCustomer(id: string) {
  await deleteDoc(doc(db, COL.customers, id))
}

export async function bulkCreateCustomers(rows: Omit<Customer, 'id'>[]) {
  const batch = writeBatch(db)
  for (const row of rows) {
    const ref = doc(collection(db, COL.customers))
    batch.set(ref, row)
  }
  await batch.commit()
}

// ——— Orders ———
export function watchOrders(cb: (items: Order[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, COL.orders), orderBy('orderAt', 'desc')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order))
  })
}

export async function createOrder(data: Omit<Order, 'id'>) {
  const ref = await addDoc(collection(db, COL.orders), stripUndefined({ ...data } as Record<string, unknown>))
  return ref.id
}

export async function updateOrder(id: string, data: Partial<Order>) {
  await updateDoc(doc(db, COL.orders, id), stripUndefined({ ...data, updatedAt: Date.now() }))
}

export async function getOrdersInRange(from: number, to: number): Promise<Order[]> {
  const q = query(
    collection(db, COL.orders),
    where('orderAt', '>=', from),
    where('orderAt', '<=', to),
    orderBy('orderAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order)
}

// ——— Payments ———
export function watchPayments(cb: (items: DebtPayment[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL.payments), orderBy('createdAt', 'desc')),
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DebtPayment))
    },
  )
}

export async function createPayment(data: Omit<DebtPayment, 'id'>) {
  const ref = await addDoc(collection(db, COL.payments), data)
  if (data.customerId) {
    const custRef = doc(db, COL.customers, data.customerId)
    const snap = await getDoc(custRef)
    if (snap.exists()) {
      const c = snap.data() as Customer
      await updateDoc(custRef, {
        totalDebt: Math.max(0, (c.totalDebt || 0) - data.amount),
        updatedAt: Date.now(),
      })
    }
  }
  return ref.id
}

export function scaleFormulaItems(items: FormulaItem[], quantity: number): FormulaItem[] {
  return items.map((i) => ({
    ...i,
    quantityPerUnit: i.quantityPerUnit * quantity,
  }))
}

export function generateOrderCode(date = new Date()): string {
  const y = date.getFullYear().toString().slice(-2)
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const r = Math.floor(Math.random() * 9000) + 1000
  return `AP${y}${m}${d}-${r}`
}

// ——— Audit logs ———
export async function createAuditLog(data: Omit<AuditLog, 'id'>) {
  const ref = await addDoc(collection(db, COL.auditLogs), stripUndefined({ ...data }))
  return ref.id
}

export function watchAuditLogs(cb: (items: AuditLog[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL.auditLogs), orderBy('createdAt', 'desc')),
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLog))
    },
  )
}
