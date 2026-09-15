export function roundMoney(n: number): number {
  return Math.round(n || 0)
}

export function purchaseLineTotal(quantity: number, unitPrice: number): number {
  return roundMoney((Number(quantity) || 0) * (Number(unitPrice) || 0))
}

/** Số lượng kế hoạch suy ra từ số tiền đặt ÷ đơn giá */
export function plannedQtyFromAmount(orderAmount: number, unitPrice: number): number {
  const p = Number(unitPrice) || 0
  if (!(p > 0)) return 0
  return (Number(orderAmount) || 0) / p
}

export type PurchasePaymentLike = { amount: number }
export type PurchaseReceiptLike = { quantity: number; lineTotal?: number }

export interface PurchaseCalcInput {
  /** @deprecated legacy — dùng plannedWeight / orderAmount */
  quantity?: number
  unitPrice: number
  orderAmount?: number
  plannedWeight?: number
  lineTotal?: number
  carriedIn: number
  carriedOut: number
  payments: PurchasePaymentLike[]
  receipts: PurchaseReceiptLike[]
}

export interface PurchaseTotals {
  /** Số tiền đặt hàng (cam kết) */
  orderAmount: number
  /** Alias = orderAmount (tương thích) */
  lineTotal: number
  plannedWeight: number
  plannedQty: number
  totalAmount: number
  paidTotal: number
  /** Còn lại tiền phải chuyển (đặt + carry − đã chuyển − carry out) */
  remainingAmount: number
  receivedQty: number
  receivedAmount: number
  /** Còn lại khối lượng kế hoạch */
  remainingWeight: number
  /** Còn lại tiền trên đơn theo phiếu nhập */
  remainingOrderAmount: number
  /** @deprecated = remainingWeight */
  remainingQty: number
}

/** Chuẩn hoá số tiền đặt từ đơn (legacy: lineTotal hoặc quantity × unitPrice) */
export function resolveOrderAmount(o: {
  orderAmount?: number
  lineTotal?: number
  quantity?: number
  unitPrice?: number
}): number {
  if (o.orderAmount != null && Number.isFinite(Number(o.orderAmount))) {
    return roundMoney(Number(o.orderAmount))
  }
  if (o.lineTotal != null && Number.isFinite(Number(o.lineTotal)) && Number(o.lineTotal) > 0) {
    return roundMoney(Number(o.lineTotal))
  }
  return purchaseLineTotal(Number(o.quantity) || 0, Number(o.unitPrice) || 0)
}

/** Chuẩn hoá khối lượng kế hoạch (legacy: quantity) */
export function resolvePlannedWeight(o: { plannedWeight?: number; quantity?: number }): number {
  if (o.plannedWeight != null && Number.isFinite(Number(o.plannedWeight))) {
    return Number(o.plannedWeight) || 0
  }
  return Number(o.quantity) || 0
}

export function purchaseTotals(input: PurchaseCalcInput): PurchaseTotals {
  const unitPrice = Number(input.unitPrice) || 0
  const orderAmount = resolveOrderAmount(input)
  const plannedWeight = resolvePlannedWeight(input)
  const plannedQty = plannedQtyFromAmount(orderAmount, unitPrice)
  const carriedIn = Number(input.carriedIn) || 0
  const carriedOut = Number(input.carriedOut) || 0
  const totalAmount = roundMoney(orderAmount + carriedIn)
  const paidTotal = roundMoney(
    (input.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0),
  )
  const remainingAmount = roundMoney(totalAmount - paidTotal - carriedOut)
  const receivedQty = (input.receipts || []).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
  const receivedAmount = roundMoney(
    (input.receipts || []).reduce((s, r) => {
      if (r.lineTotal != null && Number.isFinite(Number(r.lineTotal))) {
        return s + (Number(r.lineTotal) || 0)
      }
      return s + purchaseLineTotal(Number(r.quantity) || 0, unitPrice)
    }, 0),
  )
  const remainingWeight = plannedWeight - receivedQty
  const remainingOrderAmount = roundMoney(orderAmount - receivedAmount)
  return {
    orderAmount,
    lineTotal: orderAmount,
    plannedWeight,
    plannedQty,
    totalAmount,
    paidTotal,
    remainingAmount,
    receivedQty,
    receivedAmount,
    remainingWeight,
    remainingOrderAmount,
    remainingQty: remainingWeight,
  }
}

/** Soft-check: true nếu nhận hợp lệ (sl > 0). Vượt kế hoạch vẫn cho phép (cảnh báo UI). */
export function canReceiveQty(_orderedQty: number, _receivedQty: number, nextQty: number): boolean {
  const n = Number(nextQty) || 0
  if (!(n > 0)) return false
  return true
}

/** Hard-check cũ: không vượt sl đặt — giữ cho chỗ còn cần */
export function wouldExceedPlan(orderedQty: number, receivedQty: number, nextQty: number): boolean {
  const n = Number(nextQty) || 0
  if (!(n > 0)) return false
  return receivedQty + n > orderedQty + 1e-9
}

/** Đóng + chuyển số dư: C_out = tổng − đã chuyển (trước khi ghi C_out). */
export function applyCarryOnClose(
  input: Omit<PurchaseCalcInput, 'carriedOut'>,
): PurchaseTotals & { carriedOut: number } {
  const before = purchaseTotals({ ...input, carriedOut: 0 })
  const carriedOut = before.remainingAmount
  return { ...purchaseTotals({ ...input, carriedOut }), carriedOut }
}
