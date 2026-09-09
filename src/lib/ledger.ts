export type PurchaseStatus = 'draft' | 'open' | 'closed' | 'huy'

export interface LedgerSupplier {
  id: string
  name: string
  openingDebt: number
  openingAt: number
}

export interface LedgerPurchaseOrder {
  id: string
  supplierId: string
  status: PurchaseStatus
  orderAt: number
  lineTotal: number
  payments: { amount: number; paidAt: number }[]
}

export function isPostedPurchase(status: PurchaseStatus): boolean {
  return status === 'open' || status === 'closed'
}

export function supplierPeriodLedger(input: {
  from: number
  to: number
  suppliers: LedgerSupplier[]
  orders: LedgerPurchaseOrder[]
}): {
  supplierId: string
  name: string
  opening: number
  purchases: number
  payments: number
  closing: number
}[] {
  const { from, to } = input
  return input.suppliers.map((s) => {
    const posted = input.orders.filter((o) => o.supplierId === s.id && isPostedPurchase(o.status))
    const openingDebt = (Number(s.openingAt) || 0) <= to ? Number(s.openingDebt) || 0 : 0
    const purchasesBefore = posted
      .filter((o) => o.orderAt < from)
      .reduce((sum, o) => sum + (Number(o.lineTotal) || 0), 0)
    const paymentsBefore = posted
      .flatMap((o) => o.payments || [])
      .filter((p) => p.paidAt < from)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const purchases = posted
      .filter((o) => o.orderAt >= from && o.orderAt <= to)
      .reduce((sum, o) => sum + (Number(o.lineTotal) || 0), 0)
    const payments = posted
      .flatMap((o) => o.payments || [])
      .filter((p) => p.paidAt >= from && p.paidAt <= to)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const opening = openingDebt + purchasesBefore - paymentsBefore
    return {
      supplierId: s.id,
      name: s.name,
      opening,
      purchases,
      payments,
      closing: opening + purchases - payments,
    }
  })
}

export function stockPeriodRows(input: {
  from: number
  to: number
  now: number
  materials: { id: string; name: string; unit: string; stock: number; active: boolean }[]
  entries: { materialId: string; type?: string; quantity: number; createdAt: number }[]
}): {
  materialId: string
  name: string
  unit: string
  opening: number
  inQty: number
  outQty: number
  closing: number
}[] {
  const { from, to } = input
  return input.materials
    .filter((m) => m.active)
    .map((m) => {
      const list = input.entries.filter((e) => e.materialId === m.id)
      const isIn = (e: (typeof list)[0]) => e.type !== 'export'
      const inAfter = list.filter((e) => isIn(e) && e.createdAt > to).reduce((s, e) => s + e.quantity, 0)
      const outAfter = list.filter((e) => !isIn(e) && e.createdAt > to).reduce((s, e) => s + e.quantity, 0)
      const inQty = list.filter((e) => isIn(e) && e.createdAt >= from && e.createdAt <= to).reduce((s, e) => s + e.quantity, 0)
      const outQty = list.filter((e) => !isIn(e) && e.createdAt >= from && e.createdAt <= to).reduce((s, e) => s + e.quantity, 0)
      const closing = (Number(m.stock) || 0) - inAfter + outAfter
      const opening = closing - inQty + outQty
      return { materialId: m.id, name: m.name, unit: m.unit, opening, inQty, outQty, closing }
    })
}

export function salesOrderTracking(input: {
  orders: { id: string; code: string; totalAmount: number; status: string }[]
  productions: {
    salesOrderId?: string
    status: string
    quantity: number
    salesUnitPrice: number
  }[]
}): { orderId: string; code: string; orderValue: number; fulfilledValue: number; remainingValue: number }[] {
  return input.orders
    .filter((o) => o.status !== 'huy')
    .map((o) => {
      const fulfilledValue = input.productions
        .filter((p) => p.status === 'confirmed' && p.salesOrderId === o.id)
        .reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.salesUnitPrice) || 0), 0)
      const orderValue = Number(o.totalAmount) || 0
      return {
        orderId: o.id,
        code: o.code,
        orderValue,
        fulfilledValue,
        remainingValue: orderValue - fulfilledValue,
      }
    })
}
