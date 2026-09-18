export function isPostedSalesStatus(status: string): boolean {
  return status !== 'draft' && status !== 'huy'
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

/** Dư giao (cam kết − đã giao) trừ thẳng công nợ. Dương = giao thiếu → giảm nợ. */
export function deliveryVarianceDebtDelta(remainingAmount: number): number {
  return -Math.round(Number(remainingAmount) || 0)
}
