import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyVatRate,
  customerDebtDelta,
  customerPurchasedDelta,
  deliveryVarianceDebtDelta,
  isPostedSalesStatus,
  reconcileCustomerMoney,
} from './customerDebt.ts'

test('nháp và huỷ không phải đơn đã vào sổ', () => {
  assert.equal(isPostedSalesStatus('draft'), false)
  assert.equal(isPostedSalesStatus('huy'), false)
  assert.equal(isPostedSalesStatus('dang_lam'), true)
})

test('nháp không ghi nợ; chốt mới cộng nợ', () => {
  assert.equal(customerDebtDelta({ wasPosted: false, nextStatus: 'draft', oldDebt: 9, nextDebt: 5 }), null)
  assert.equal(customerDebtDelta({ wasPosted: false, nextStatus: 'dang_lam', oldDebt: 9, nextDebt: 5 }), 5)
})

test('huỷ đơn bán không đảo nợ', () => {
  assert.equal(customerDebtDelta({ wasPosted: true, nextStatus: 'huy', oldDebt: 8, nextDebt: 0 }), null)
  assert.equal(customerPurchasedDelta({ wasPosted: true, nextStatus: 'huy', oldTotal: 10, nextTotal: 10 }), null)
})

test('sửa đơn đã chốt: điều chỉnh đúng phần chênh nợ', () => {
  assert.equal(customerDebtDelta({ wasPosted: true, nextStatus: 'dang_lam', oldDebt: 8, nextDebt: 3 }), -5)
})

test('VAT 0 / 8 / 10', () => {
  assert.equal(applyVatRate(1_000_000, 0), 1_000_000)
  assert.equal(applyVatRate(1_000_000, 8), 1_080_000)
  assert.equal(applyVatRate(1_000_000, 10), 1_100_000)
})

test('đối chiếu công nợ cộng 2 nguồn thu', () => {
  const r = reconcileCustomerMoney({
    orderPayments: [{ amount: 3 }, { amount: 2 }],
    offOrderPayments: [{ amount: 4 }],
  })
  assert.equal(r.onOrderPaid, 5)
  assert.equal(r.offOrderPaid, 4)
  assert.equal(r.combinedPaid, 9)
})

test('dư giao 20tr (giao thiếu) trừ 20tr nợ khách', () => {
  assert.equal(deliveryVarianceDebtDelta(20_000_000), -20_000_000)
  assert.equal(deliveryVarianceDebtDelta(-5_000_000), 5_000_000)
})
