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
  runTransaction,
  type Unsubscribe,
  type Transaction,
} from 'firebase/firestore'
import { db } from './firebase'
import { applyCarryOnClose, canReceiveQty, purchaseLineTotal } from './purchase'
import { allocateDeductedQty, mergeDeductItems } from './production'
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
  Supplier,
  PurchaseOrder,
  PurchasePayment,
  PurchaseReceipt,
  ProductionOrder,
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
  suppliers: 'suppliers',
  purchaseOrders: 'purchaseOrders',
  productionOrders: 'productionOrders',
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

export async function addStockEntry(entry: Omit<StockEntry, 'id'>, _materialStock?: number) {
  const entryRef = doc(collection(db, COL.stockEntries))
  await runTransaction(db, async (tx) => {
    const matRef = doc(db, COL.materials, entry.materialId)
    const matSnap = await tx.get(matRef)
    tx.set(entryRef, { type: 'import', ...entry })
    if (matSnap.exists()) {
      const mat = matSnap.data() as Material
      const current = Number(mat.stock) || 0
      const newStock = current + entry.quantity
      const totalValue = (Number(mat.avgCost) || 0) * current + entry.cost
      const avgCost = newStock > 0 ? totalValue / newStock : 0
      tx.update(matRef, { stock: newStock, avgCost, updatedAt: Date.now() })
    }
  })
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

function generateCode(prefix: string, date = new Date()): string {
  const y = date.getFullYear().toString().slice(-2)
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const r = Math.floor(Math.random() * 9000) + 1000
  return `${prefix}${y}${m}${d}-${r}`
}

export function generatePurchaseCode(date = new Date()): string {
  return generateCode('MH', date)
}

export function generateProductionCode(date = new Date()): string {
  return generateCode('SX', date)
}

// ——— Suppliers ———
export function watchSuppliers(cb: (items: Supplier[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, COL.suppliers), orderBy('name')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier))
  })
}

export async function createSupplier(data: Omit<Supplier, 'id'>) {
  const ref = await addDoc(collection(db, COL.suppliers), stripUndefined({ ...data } as Record<string, unknown>))
  return ref.id
}

export async function updateSupplier(id: string, data: Partial<Supplier>) {
  await updateDoc(doc(db, COL.suppliers, id), stripUndefined({ ...data, updatedAt: Date.now() }))
}

export async function deleteSupplier(id: string) {
  await deleteDoc(doc(db, COL.suppliers, id))
}

// ——— Purchase orders ———
export function watchPurchaseOrders(cb: (items: PurchaseOrder[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL.purchaseOrders), orderBy('orderAt', 'desc')),
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseOrder))
    },
  )
}

export async function createPurchaseOrder(data: Omit<PurchaseOrder, 'id'>) {
  const ref = await addDoc(
    collection(db, COL.purchaseOrders),
    stripUndefined({ ...data } as Record<string, unknown>),
  )
  return ref.id
}

export async function updatePurchaseOrder(id: string, data: Partial<PurchaseOrder>) {
  await updateDoc(doc(db, COL.purchaseOrders, id), stripUndefined({ ...data, updatedAt: Date.now() }))
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const snap = await getDoc(doc(db, COL.suppliers, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Supplier
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  const snap = await getDoc(doc(db, COL.purchaseOrders, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as PurchaseOrder
}

// ——— Production orders ———
export function watchProductionOrders(cb: (items: ProductionOrder[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL.productionOrders), orderBy('createdAt', 'desc')),
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProductionOrder))
    },
  )
}

export async function createProductionOrder(data: Omit<ProductionOrder, 'id'>) {
  const ref = await addDoc(
    collection(db, COL.productionOrders),
    stripUndefined({ ...data } as Record<string, unknown>),
  )
  return ref.id
}

export async function updateProductionOrder(id: string, data: Partial<ProductionOrder>) {
  await updateDoc(doc(db, COL.productionOrders, id), stripUndefined({ ...data, updatedAt: Date.now() }))
}

export async function getProductionOrder(id: string): Promise<ProductionOrder | null> {
  const snap = await getDoc(doc(db, COL.productionOrders, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as ProductionOrder
}

type DeductItem = { materialId: string; quantity: number; materialName?: string; unit?: string }

async function readMaterialsForQty(
  tx: Transaction,
  items: DeductItem[],
): Promise<{ item: DeductItem; ref: ReturnType<typeof doc>; mat: Material | null }[]> {
  const merged = mergeDeductItems(items.filter((i) => i.quantity > 0))
  const rows: { item: DeductItem; ref: ReturnType<typeof doc>; mat: Material | null }[] = []
  for (const item of merged) {
    const ref = doc(db, COL.materials, item.materialId)
    const snap = await tx.get(ref)
    rows.push({ item, ref, mat: snap.exists() ? (snap.data() as Material) : null })
  }
  return rows
}

function applyCappedDeduct(
  tx: Transaction,
  rows: { item: DeductItem; ref: ReturnType<typeof doc>; mat: Material | null }[],
  opts: DeductStockOptions & { productionOrderId?: string },
): Record<string, number> {
  const deducted: Record<string, number> = {}
  const now = Date.now()
  for (const { item, ref, mat } of rows) {
    if (!mat) {
      deducted[item.materialId] = 0
      continue
    }
    const take = Math.min(Math.max(0, Number(mat.stock) || 0), item.quantity)
    deducted[item.materialId] = take
    if (take <= 0) continue
    tx.update(ref, { stock: (Number(mat.stock) || 0) - take, updatedAt: now })
    const exportRef = doc(collection(db, COL.stockEntries))
    tx.set(exportRef, {
      materialId: item.materialId,
      materialName: item.materialName || mat.name,
      quantity: take,
      unit: item.unit || mat.unit,
      cost: 0,
      contractor: '',
      note: opts.note || (opts.orderCode ? `Xuất SX ${opts.orderCode}` : 'Xuất kho SX'),
      createdAt: now,
      createdBy: opts.createdBy || '',
      createdByName: opts.createdByName || '',
      type: 'export',
      orderId: opts.orderId || '',
      orderCode: opts.orderCode || '',
      productionOrderId: opts.productionOrderId || '',
    })
  }
  return deducted
}

function applyRestore(
  tx: Transaction,
  rows: { item: DeductItem; ref: ReturnType<typeof doc>; mat: Material | null }[],
  opts: { note?: string; createdBy?: string; createdByName?: string },
) {
  const now = Date.now()
  for (const { item, ref, mat } of rows) {
    if (!mat || !(item.quantity > 0)) continue
    tx.update(ref, { stock: (Number(mat.stock) || 0) + item.quantity, updatedAt: now })
    const entryRef = doc(collection(db, COL.stockEntries))
    tx.set(entryRef, {
      materialId: item.materialId,
      materialName: item.materialName || mat.name,
      quantity: item.quantity,
      unit: item.unit || mat.unit,
      cost: 0,
      contractor: '',
      note: opts.note || 'Hoàn kho huỷ lệnh SX',
      createdAt: now,
      createdBy: opts.createdBy || '',
      createdByName: opts.createdByName || '',
      type: 'import',
    })
  }
}

/** Trừ kho, tồn không âm; phiếu xuất = số thực trừ. Trả về map materialId → deductedQty */
export async function deductStockCapped(
  items: DeductItem[],
  opts: DeductStockOptions & { productionOrderId?: string } = {},
): Promise<Record<string, number>> {
  let deducted: Record<string, number> = {}
  await runTransaction(db, async (tx) => {
    const rows = await readMaterialsForQty(tx, items)
    deducted = applyCappedDeduct(tx, rows, opts)
  })
  return deducted
}

export async function restoreStock(
  items: DeductItem[],
  opts: { note?: string; createdBy?: string; createdByName?: string } = {},
) {
  await runTransaction(db, async (tx) => {
    const rows = await readMaterialsForQty(tx, items)
    applyRestore(tx, rows, opts)
  })
}

export async function confirmProductionOrder(
  orderId: string,
  opts: DeductStockOptions = {},
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const poRef = doc(db, COL.productionOrders, orderId)
    const poSnap = await tx.get(poRef)
    if (!poSnap.exists()) throw new Error('Không tìm thấy lệnh SX')
    const po = { id: poSnap.id, ...poSnap.data() } as ProductionOrder
    if (po.status === 'huy') throw new Error('Lệnh đã huỷ')
    if (po.stockDeducted) {
      if (po.status !== 'confirmed') {
        tx.update(poRef, { status: 'confirmed', confirmedAt: po.confirmedAt || Date.now(), updatedAt: Date.now() })
      }
      return
    }
    const lines = po.lines || []
    const rows = await readMaterialsForQty(
      tx,
      lines.map((l) => ({
        materialId: l.materialId,
        quantity: l.quantity,
        materialName: l.materialName,
        unit: l.unit,
      })),
    )
    const deducted = applyCappedDeduct(tx, rows, {
      ...opts,
      orderCode: opts.orderCode || po.code,
      productionOrderId: orderId,
      note: opts.note || `Xuất SX ${po.code}`,
    })
    const qtys = allocateDeductedQty(lines, deducted)
    const now = Date.now()
    tx.update(poRef, {
      status: 'confirmed',
      stockDeducted: true,
      confirmedAt: now,
      updatedAt: now,
      lines: lines.map((l, i) => ({ ...l, deductedQty: qtys[i] || 0 })),
    })
  })
}

export async function createConfirmedProductionOrder(
  data: Omit<ProductionOrder, 'id'>,
  opts: DeductStockOptions = {},
): Promise<string> {
  const poRef = doc(collection(db, COL.productionOrders))
  await runTransaction(db, async (tx) => {
    const lines = data.lines || []
    const rows = await readMaterialsForQty(
      tx,
      lines.map((l) => ({
        materialId: l.materialId,
        quantity: l.quantity,
        materialName: l.materialName,
        unit: l.unit,
      })),
    )
    const deducted = applyCappedDeduct(tx, rows, {
      ...opts,
      orderCode: opts.orderCode || data.code,
      productionOrderId: poRef.id,
      note: opts.note || `Xuất SX ${data.code}`,
    })
    const qtys = allocateDeductedQty(lines, deducted)
    const now = Date.now()
    tx.set(
      poRef,
      stripUndefined({
        ...data,
        status: 'confirmed',
        stockDeducted: true,
        confirmedAt: now,
        updatedAt: now,
        lines: lines.map((l, i) => ({ ...l, deductedQty: qtys[i] || 0 })),
      } as Record<string, unknown>),
    )
  })
  return poRef.id
}

export async function cancelProductionOrder(
  orderId: string,
  opts: { note?: string; createdBy?: string; createdByName?: string } = {},
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const poRef = doc(db, COL.productionOrders, orderId)
    const poSnap = await tx.get(poRef)
    if (!poSnap.exists()) throw new Error('Không tìm thấy lệnh SX')
    const po = { id: poSnap.id, ...poSnap.data() } as ProductionOrder
    if (po.status === 'huy') return
    let rows: { item: DeductItem; ref: ReturnType<typeof doc>; mat: Material | null }[] = []
    if (po.stockDeducted) {
      rows = await readMaterialsForQty(
        tx,
        (po.lines || [])
          .filter((l) => (l.deductedQty || 0) > 0)
          .map((l) => ({
            materialId: l.materialId,
            quantity: l.deductedQty || 0,
            materialName: l.materialName,
            unit: l.unit,
          })),
      )
    }
    if (po.stockDeducted) {
      applyRestore(tx, rows, { note: opts.note || `Hoàn kho huỷ ${po.code}`, createdBy: opts.createdBy, createdByName: opts.createdByName })
    }
    tx.update(poRef, { status: 'huy', updatedAt: Date.now() })
  })
}

export async function createOpenPurchaseOrder(data: Omit<PurchaseOrder, 'id'>): Promise<string> {
  const poRef = doc(collection(db, COL.purchaseOrders))
  await runTransaction(db, async (tx) => {
    const supRef = doc(db, COL.suppliers, data.supplierId)
    const supSnap = await tx.get(supRef)
    if (!supSnap.exists()) throw new Error('Không tìm thấy NCC')
    const sup = { id: supSnap.id, ...supSnap.data() } as Supplier
    const carriedIn = Number(sup.pendingCarry) || 0
    const paid = (data.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const lineTotal = purchaseLineTotal(data.quantity, data.unitPrice)
    const now = Date.now()
    tx.set(
      poRef,
      stripUndefined({
        ...data,
        lineTotal,
        carriedIn,
        carriedFromOrderId: carriedIn ? (sup.pendingCarryFromOrderId || '') : '',
        carriedOut: 0,
        status: 'open',
        updatedAt: now,
      } as Record<string, unknown>),
    )
    tx.update(supRef, {
      pendingCarry: 0,
      pendingCarryFromOrderId: '',
      totalDebt: (Number(sup.totalDebt) || 0) + lineTotal - paid,
      totalPurchased: (Number(sup.totalPurchased) || 0) + lineTotal,
      updatedAt: now,
    })
  })
  return poRef.id
}

export async function confirmDraftPurchaseOrder(poId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const poRef = doc(db, COL.purchaseOrders, poId)
    const poSnap = await tx.get(poRef)
    if (!poSnap.exists()) throw new Error('Không tìm thấy đơn')
    const po = { id: poSnap.id, ...poSnap.data() } as PurchaseOrder
    if (po.status === 'open') return
    if (po.status !== 'draft') throw new Error('Đơn không còn là nháp')
    const supRef = doc(db, COL.suppliers, po.supplierId)
    const supSnap = await tx.get(supRef)
    if (!supSnap.exists()) throw new Error('Không tìm thấy NCC')
    const sup = { id: supSnap.id, ...supSnap.data() } as Supplier
    const carriedIn = Number(sup.pendingCarry) || 0
    const paid = (po.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const lineTotal = purchaseLineTotal(po.quantity, po.unitPrice)
    const now = Date.now()
    tx.update(poRef, {
      status: 'open',
      carriedIn,
      carriedFromOrderId: carriedIn ? (sup.pendingCarryFromOrderId || '') : '',
      lineTotal,
      orderAt: now,
      updatedAt: now,
    })
    tx.update(supRef, {
      pendingCarry: 0,
      pendingCarryFromOrderId: '',
      totalDebt: (Number(sup.totalDebt) || 0) + lineTotal - paid,
      totalPurchased: (Number(sup.totalPurchased) || 0) + lineTotal,
      updatedAt: now,
    })
  })
}

export async function receivePurchaseOrder(
  poId: string,
  qty: number,
  receipt: Omit<PurchaseReceipt, 'stockEntryId'>,
  entry: Omit<StockEntry, 'id'>,
): Promise<void> {
  const entryRef = doc(collection(db, COL.stockEntries))
  await runTransaction(db, async (tx) => {
    const poRef = doc(db, COL.purchaseOrders, poId)
    const poSnap = await tx.get(poRef)
    if (!poSnap.exists()) throw new Error('Không tìm thấy đơn')
    const po = { id: poSnap.id, ...poSnap.data() } as PurchaseOrder
    if (po.status !== 'open') throw new Error('Chỉ nhận hàng khi đơn đang mở')
    const rec = po.receipts || []
    const received = rec.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    if (!canReceiveQty(po.quantity, received, qty)) {
      throw new Error('Số nhận không hợp lệ (phải > 0 và không vượt sl đặt).')
    }
    const matRef = doc(db, COL.materials, po.materialId)
    const matSnap = await tx.get(matRef)
    if (!matSnap.exists()) throw new Error('Không tìm thấy vật liệu')
    const mat = matSnap.data() as Material
    const cost = qty * (Number(po.unitPrice) || 0)
    const current = Number(mat.stock) || 0
    const newStock = current + qty
    const totalValue = (Number(mat.avgCost) || 0) * current + cost
    const avgCost = newStock > 0 ? totalValue / newStock : 0
    const now = Date.now()
    tx.set(entryRef, { type: 'import', ...entry, cost, quantity: qty, materialId: po.materialId })
    tx.update(matRef, { stock: newStock, avgCost, updatedAt: now })
    tx.update(poRef, {
      receipts: [...rec, { ...receipt, stockEntryId: entryRef.id }],
      updatedAt: now,
    })
  })
}

export async function addPurchasePayment(poId: string, payment: PurchasePayment): Promise<void> {
  await runTransaction(db, async (tx) => {
    const poRef = doc(db, COL.purchaseOrders, poId)
    const poSnap = await tx.get(poRef)
    if (!poSnap.exists()) throw new Error('Không tìm thấy đơn')
    const po = { id: poSnap.id, ...poSnap.data() } as PurchaseOrder
    if (po.status === 'huy') throw new Error('Đơn đã huỷ')
    const amt = Number(payment.amount) || 0
    if (!(amt > 0)) throw new Error('Số tiền phải > 0')
    const applyToDebt = po.status === 'open' || po.status === 'closed'
    const supRef = applyToDebt ? doc(db, COL.suppliers, po.supplierId) : null
    const supSnap = supRef ? await tx.get(supRef) : null
    const now = Date.now()
    tx.update(poRef, { payments: [...(po.payments || []), payment], updatedAt: now })
    if (applyToDebt && supRef && supSnap?.exists()) {
      const sup = supSnap.data() as Supplier
      tx.update(supRef, { totalDebt: (Number(sup.totalDebt) || 0) - amt, updatedAt: now })
    }
  })
}

export async function closePurchaseOrder(poId: string, carry: boolean): Promise<void> {
  await runTransaction(db, async (tx) => {
    const poRef = doc(db, COL.purchaseOrders, poId)
    const poSnap = await tx.get(poRef)
    if (!poSnap.exists()) throw new Error('Không tìm thấy đơn')
    const po = { id: poSnap.id, ...poSnap.data() } as PurchaseOrder
    if (po.status !== 'open') throw new Error('Chỉ đóng đơn đang mở')
    let carriedOut = 0
    const supRef = carry ? doc(db, COL.suppliers, po.supplierId) : null
    const supSnap = supRef ? await tx.get(supRef) : null
    if (carry) {
      if (!supSnap?.exists()) throw new Error('Không tìm thấy NCC')
      carriedOut = applyCarryOnClose({
        quantity: po.quantity,
        unitPrice: po.unitPrice,
        carriedIn: po.carriedIn || 0,
        payments: po.payments || [],
        receipts: po.receipts || [],
      }).carriedOut
    }
    const now = Date.now()
    tx.update(poRef, { status: 'closed', carriedOut, updatedAt: now })
    if (carry && supRef && supSnap?.exists()) {
      const sup = supSnap.data() as Supplier
      tx.update(supRef, {
        pendingCarry: (Number(sup.pendingCarry) || 0) + carriedOut,
        pendingCarryFromOrderId: poId,
        updatedAt: now,
      })
    }
  })
}

export async function cancelPurchaseOrder(poId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const poRef = doc(db, COL.purchaseOrders, poId)
    const poSnap = await tx.get(poRef)
    if (!poSnap.exists()) throw new Error('Không tìm thấy đơn')
    const po = { id: poSnap.id, ...poSnap.data() } as PurchaseOrder
    if (po.status === 'huy') return
    if (po.status === 'closed') throw new Error('Đơn đã đóng — không huỷ được')
    if ((po.receipts || []).length > 0) throw new Error('Đơn đã nhận hàng — không huỷ được')
    const supRef = po.status === 'open' ? doc(db, COL.suppliers, po.supplierId) : null
    const supSnap = supRef ? await tx.get(supRef) : null
    const now = Date.now()
    if (po.status === 'open' && supRef && supSnap?.exists()) {
      const paid = (po.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const lineTotal = purchaseLineTotal(po.quantity, po.unitPrice)
      const sup = { id: supSnap.id, ...supSnap.data() } as Supplier
      tx.update(supRef, {
        totalDebt: (Number(sup.totalDebt) || 0) - lineTotal + paid,
        totalPurchased: Math.max(0, (Number(sup.totalPurchased) || 0) - lineTotal),
        pendingCarry: (Number(sup.pendingCarry) || 0) + (Number(po.carriedIn) || 0),
        pendingCarryFromOrderId: po.carriedFromOrderId || sup.pendingCarryFromOrderId || '',
        updatedAt: now,
      })
    }
    tx.update(poRef, { status: 'huy', updatedAt: now })
  })
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
