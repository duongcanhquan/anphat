export function roundMoney(n: number): number {
  return Math.round(n || 0)
}

export function purchaseLineTotal(quantity: number, unitPrice: number): number {
  return roundMoney((Number(quantity) || 0) * (Number(unitPrice) || 0))
}

export type PurchasePaymentLike = { amount: number }
export type PurchaseReceiptLike = { quantity: number }

export interface PurchaseCalcInput {
  quantity: number
  unitPrice: number
  carriedIn: number
  carriedOut: number
  payments: PurchasePaymentLike[]
  receipts: PurchaseReceiptLike[]
}

export interface PurchaseTotals {
  lineTotal: number
  totalAmount: number
  paidTotal: number
  remainingAmount: number
  receivedQty: number
  remainingQty: number
}

export function purchaseTotals(input: PurchaseCalcInput): PurchaseTotals {
  const lineTotal = purchaseLineTotal(input.quantity, input.unitPrice)
  const carriedIn = Number(input.carriedIn) || 0
  const carriedOut = Number(input.carriedOut) || 0
  const totalAmount = roundMoney(lineTotal + carriedIn)
  const paidTotal = roundMoney(
    (input.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0),
  )
  const remainingAmount = roundMoney(totalAmount - paidTotal - carriedOut)
  const receivedQty = (input.receipts || []).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
  const remainingQty = (Number(input.quantity) || 0) - receivedQty
  return { lineTotal, totalAmount, paidTotal, remainingAmount, receivedQty, remainingQty }
}

export function canReceiveQty(orderedQty: number, receivedQty: number, nextQty: number): boolean {
  const n = Number(nextQty) || 0
  if (!(n > 0)) return false
  return receivedQty + n <= orderedQty + 1e-9
}

/** Đóng + chuyển số dư: C_out = tổng − đã chuyển (trước khi ghi C_out). */
export function applyCarryOnClose(
  input: Omit<PurchaseCalcInput, 'carriedOut'>,
): PurchaseTotals & { carriedOut: number } {
  const before = purchaseTotals({ ...input, carriedOut: 0 })
  const carriedOut = before.remainingAmount
  return { ...purchaseTotals({ ...input, carriedOut }), carriedOut }
}
