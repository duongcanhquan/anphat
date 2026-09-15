import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineFulfillment, orderFulfillment, wouldExceedSalesPlan } from './salesDelivery.ts'

test('trừ lũy kế dòng đơn bán theo phiếu xuất', () => {
  const line = { id: 'l1', quantity: 100, lineTotal: 10_000_000 }
  const f = lineFulfillment(line, [
    { orderLineId: 'l1', quantity: 40, lineTotal: 4_000_000 },
    { orderLineId: 'l1', quantity: 10, lineTotal: 1_000_000 },
    { orderLineId: 'other', quantity: 99, lineTotal: 9_999_999 },
  ])
  assert.equal(f.deliveredQty, 50)
  assert.equal(f.deliveredAmount, 5_000_000)
  assert.equal(f.remainingQty, 50)
  assert.equal(f.remainingAmount, 5_000_000)
})

test('tổng đơn từ nhiều dòng', () => {
  const o = orderFulfillment(
    [
      { id: 'a', quantity: 10, lineTotal: 1_000 },
      { id: 'b', quantity: 20, lineTotal: 2_000 },
    ],
    [{ orderLineId: 'a', quantity: 5, lineTotal: 500 }],
  )
  assert.equal(o.deliveredQty, 5)
  assert.equal(o.remainingQty, 25)
  assert.equal(o.remainingAmount, 2_500)
})

test('cảnh báo vượt kế hoạch bán', () => {
  assert.equal(wouldExceedSalesPlan(10, 8, 2), false)
  assert.equal(wouldExceedSalesPlan(10, 8, 3), true)
})
