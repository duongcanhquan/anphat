function roundMoney(n: number): number {
  return Math.round(n || 0)
}

export type SalesDeliveryLike = {
  orderId?: string
  orderLineId?: string
  quantity: number
  lineTotal: number
}

export interface LineFulfillment {
  deliveredQty: number
  deliveredAmount: number
  remainingQty: number
  remainingAmount: number
}

export function lineFulfillment(
  line: { id: string; quantity: number; lineTotal: number },
  deliveries: SalesDeliveryLike[],
): LineFulfillment {
  const matched = deliveries.filter((d) => d.orderLineId === line.id)
  const deliveredQty = matched.reduce((s, d) => s + (Number(d.quantity) || 0), 0)
  const deliveredAmount = roundMoney(matched.reduce((s, d) => s + (Number(d.lineTotal) || 0), 0))
  return {
    deliveredQty,
    deliveredAmount,
    remainingQty: (Number(line.quantity) || 0) - deliveredQty,
    remainingAmount: roundMoney((Number(line.lineTotal) || 0) - deliveredAmount),
  }
}

export function orderFulfillment(
  lines: { id: string; quantity: number; lineTotal: number }[],
  deliveries: SalesDeliveryLike[],
): { deliveredQty: number; deliveredAmount: number; remainingQty: number; remainingAmount: number } {
  let deliveredQty = 0
  let deliveredAmount = 0
  let orderedQty = 0
  let orderedAmount = 0
  for (const l of lines) {
    const f = lineFulfillment(l, deliveries)
    deliveredQty += f.deliveredQty
    deliveredAmount += f.deliveredAmount
    orderedQty += Number(l.quantity) || 0
    orderedAmount += Number(l.lineTotal) || 0
  }
  return {
    deliveredQty,
    deliveredAmount: roundMoney(deliveredAmount),
    remainingQty: orderedQty - deliveredQty,
    remainingAmount: roundMoney(orderedAmount - deliveredAmount),
  }
}

export function wouldExceedSalesPlan(
  ordered: number,
  delivered: number,
  next: number,
): boolean {
  const n = Number(next) || 0
  if (!(n > 0)) return false
  return delivered + n > ordered + 1e-9
}
