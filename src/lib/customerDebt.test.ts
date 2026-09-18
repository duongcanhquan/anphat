import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyVatRate,
  customerDebtDelta,
  customerPurchasedDelta,
  isPostedSalesStatus,
  orderCustomerDebt,
  orderDeliveredValue,
  reconcileCustomerMoney,
} from './customerDebt.ts'

test('nháp và huỷ không phải đơn đã vào sổ', () => {
  assert.equal(isPostedSalesStatus('draft'), false)
  assert.equal(isPostedSalesStatus('huy'), false)
  assert.equal(isPostedSalesStatus('dang_lam'), true)
})

test('công nợ = KL giao × ĐG − tiền ứng, được âm', () => {
  assert.equal(orderCustomerDebt({ deliveredAmount: 80_000_000, paidAmount: 100_000_000 }), -20_000_000)
  assert.equal(orderCustomerDebt({ deliveredAmount: 0, paidAmount: 0 }), 0)
  assert.equal(orderCustomerDebt({ deliveredAmount: 50_000_000, paidAmount: 0 }), 50_000_000)
})

test('giá trị giao nhân ĐG đơn gốc, không lấy ĐG phiếu nếu lệch', () => {
  const v = orderDeliveredValue(
    [{ id: 'l1', unitPrice: 200_000 }],
    [{ orderLineId: 'l1', quantity: 80, unitPrice: 999_999, lineTotal: 99 }],
  )
  assert.equal(v, 16_000_000)
})

test('nháp không ghi nợ', () => {
  assert.equal(customerDebtDelta({ wasPosted: false, nextStatus: 'draft', oldDebt: 9, nextDebt: -5 }), null)
})

test('chốt chưa giao chưa ứng: không cộng cam kết', () => {
  assert.equal(customerDebtDelta({ wasPosted: false, nextStatus: 'dang_lam', oldDebt: 0, nextDebt: 0 }), 0)
})

test('chốt có ứng chưa giao: nợ âm (đã ứng)', () => {
  assert.equal(customerDebtDelta({ wasPosted: false, nextStatus: 'dang_lam', oldDebt: 0, nextDebt: -50_000_000 }), -50_000_000)
})

test('huỷ đơn bán không đảo nợ', () => {
  assert.equal(customerDebtDelta({ wasPosted: true, nextStatus: 'huy', oldDebt: -20, nextDebt: 0 }), null)
  assert.equal(customerPurchasedDelta({ wasPosted: true, nextStatus: 'huy', oldTotal: 10, nextTotal: 10 }), null)
})

test('sửa đơn đã chốt: điều chỉnh đúng phần chênh nợ giao−ứng', () => {
  assert.equal(customerDebtDelta({ wasPosted: true, nextStatus: 'dang_lam', oldDebt: -50, nextDebt: -20 }), 30)
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
