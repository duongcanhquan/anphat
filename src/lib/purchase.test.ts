import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCarryOnClose,
  canReceiveQty,
  purchaseLineTotal,
  purchaseTotals,
  roundMoney,
} from './purchase.ts'

test('thành tiền = sl × đơn giá', () => {
  assert.equal(purchaseLineTotal(5, 2_000_000), 10_000_000)
})

test('tổng đơn gồm số dư chuyển vào; còn lại trừ đã chuyển và chuyển đi', () => {
  const t = purchaseTotals({
    quantity: 5,
    unitPrice: 2_000_000,
    carriedIn: 3_000_000,
    carriedOut: 0,
    payments: [{ amount: 4_000_000 }, { amount: 1_000_000 }],
    receipts: [{ quantity: 3 }, { quantity: 1 }],
  })
  assert.equal(t.lineTotal, 10_000_000)
  assert.equal(t.totalAmount, 13_000_000)
  assert.equal(t.paidTotal, 5_000_000)
  assert.equal(t.remainingAmount, 8_000_000)
  assert.equal(t.receivedQty, 4)
  assert.equal(t.remainingQty, 1)
})

test('còn lại âm khi trả thừa', () => {
  const t = purchaseTotals({
    quantity: 1,
    unitPrice: 100,
    carriedIn: 0,
    carriedOut: 0,
    payments: [{ amount: 150 }],
    receipts: [],
  })
  assert.equal(t.remainingAmount, -50)
})

test('không nhận vượt sl đặt', () => {
  assert.equal(canReceiveQty(5, 3, 2), true)
  assert.equal(canReceiveQty(5, 3, 2.1), false)
  assert.equal(canReceiveQty(5, 5, 0.1), false)
  assert.equal(canReceiveQty(5, 0, 0), false)
})

test('đóng + chuyển: C_out = tổng − đã chuyển, còn lại về 0', () => {
  const closed = applyCarryOnClose({
    quantity: 5,
    unitPrice: 2_000_000,
    carriedIn: 0,
    carriedOut: 0,
    payments: [{ amount: 7_000_000 }],
    receipts: [],
  })
  assert.equal(closed.carriedOut, 3_000_000)
  assert.equal(closed.remainingAmount, 0)
})

test('đóng không chuyển: C_out = 0, còn lại giữ nguyên', () => {
  const t = purchaseTotals({
    quantity: 5,
    unitPrice: 2_000_000,
    carriedIn: 0,
    carriedOut: 0,
    payments: [{ amount: 7_000_000 }],
    receipts: [],
  })
  assert.equal(t.remainingAmount, 3_000_000)
})

test('roundMoney làm tròn đồng', () => {
  assert.equal(roundMoney(10_000_000.4), 10_000_000)
  assert.equal(roundMoney(10_000_000.6), 10_000_001)
})
