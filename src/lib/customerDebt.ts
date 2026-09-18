export function isPostedSalesStatus(status: string): boolean {
  return status !== 'draft' && status !== 'huy'
}

/** Công nợ đơn = KL thực giao × ĐG gốc − tiền ứng. Được âm (đã ứng vượt giao). */
export function orderCustomerDebt(input: { deliveredAmount: number; paidAmount: number }): number {
  return Math.round((Number(input.deliveredAmount) || 0) - (Number(input.paidAmount) || 0))
}

/** Giá trị giao theo đơn giá dòng đơn gốc. */
export function orderDeliveredValue(
  lines: { id: string; unitPrice: number }[],
  deliveries: { orderLineId?: string; quantity: number; unitPrice?: number; lineTotal?: number }[],
): number {
  return Math.round(
    (deliveries || []).reduce((sum, d) => {
      const line = (lines || []).find((l) => l.id === d.orderLineId)
      const price = Number(line?.unitPrice) || Number(d.unitPrice) || 0
      const qty = Number(d.quantity) || 0
      if (line) return sum + qty * price
      if (d.lineTotal != null && Number.isFinite(Number(d.lineTotal))) return sum + (Number(d.lineTotal) || 0)
      return sum + qty * price
    }, 0),
  )
}

/** null = không đụng thẻ nợ khách (nháp / huỷ giữ nguyên). */
export function customerDebtDelta(input: {
  wasPosted: boolean
  nextStatus: string
  oldDebt: number
  nextDebt: number
}): number | null {
  if (input.nextStatus === 'huy') return null
  if (input.nextStatus === 'draft') return null
  if (input.wasPosted) return (Number(input.nextDebt) || 0) - (Number(input.oldDebt) || 0)
  return Number(input.nextDebt) || 0
}

export function customerPurchasedDelta(input: {
  wasPosted: boolean
  nextStatus: string
  oldTotal: number
  nextTotal: number
}): number | null {
  if (input.nextStatus === 'huy' || input.nextStatus === 'draft') return null
  if (input.wasPosted) return (Number(input.nextTotal) || 0) - (Number(input.oldTotal) || 0)
  return Number(input.nextTotal) || 0
}

export function applyVatRate(amount: number, rate: 0 | 8 | 10): number {
  return Math.round((Number(amount) || 0) * (1 + rate / 100))
}

/** Đối chiếu: cộng thanh toán trên đơn + thu ngoài đơn. */
export function reconcileCustomerMoney(input: {
  orderPayments: { amount: number }[]
  offOrderPayments: { amount: number }[]
}): { onOrderPaid: number; offOrderPaid: number; combinedPaid: number } {
  const onOrderPaid = Math.round(
    (input.orderPayments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0),
  )
  const offOrderPaid = Math.round(
    (input.offOrderPayments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0),
  )
  return { onOrderPaid, offOrderPaid, combinedPaid: onOrderPaid + offOrderPaid }
}
