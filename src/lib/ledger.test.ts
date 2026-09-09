import { test } from 'node:test'
import assert from 'node:assert/strict'
import { salesOrderTracking, stockPeriodRows, supplierPeriodLedger } from './ledger.ts'

test('sổ NCC: nợ đầu + nhập mua − trả tiền = nợ cuối; không cộng C_in', () => {
  const rows = supplierPeriodLedger({
    from: 100,
    to: 200,
    suppliers: [
      { id: 's1', name: 'NCC A', openingDebt: 10_000_000, openingAt: 50 },
    ],
    orders: [
      {
        id: 'o1',
        supplierId: 's1',
        status: 'closed',
        orderAt: 80,
        lineTotal: 10_000_000,
        payments: [{ amount: 7_000_000, paidAt: 90 }],
      },
      {
        id: 'o2',
        supplierId: 's1',
        status: 'open',
        orderAt: 150,
        lineTotal: 8_000_000,
        payments: [{ amount: 1_000_000, paidAt: 160 }],
      },
    ],
  })
  const a = rows.find((r) => r.supplierId === 's1')
  assert.ok(a)
  // Nợ đầu = 10tr + mua 10tr − trả 7tr = 13tr
  assert.equal(a.opening, 13_000_000)
  assert.equal(a.purchases, 8_000_000)
  assert.equal(a.payments, 1_000_000)
  assert.equal(a.closing, 20_000_000)
})

test('sổ NCC: nợ cũ mở thẻ trong kỳ vẫn vào sổ kỳ đó', () => {
  const rows = supplierPeriodLedger({
    from: 100,
    to: 200,
    suppliers: [{ id: 's1', name: 'A', openingDebt: 5_000_000, openingAt: 150 }],
    orders: [],
  })
  assert.equal(rows[0].opening, 5_000_000)
  assert.equal(rows[0].purchases, 0)
  assert.equal(rows[0].closing, 5_000_000)
})

test('sổ NCC bỏ nháp và huỷ', () => {
  const rows = supplierPeriodLedger({
    from: 0,
    to: 999,
    suppliers: [{ id: 's1', name: 'A', openingDebt: 0, openingAt: 0 }],
    orders: [
      { id: 'd', supplierId: 's1', status: 'draft', orderAt: 10, lineTotal: 99, payments: [] },
      { id: 'h', supplierId: 's1', status: 'huy', orderAt: 10, lineTotal: 99, payments: [] },
      { id: 'o', supplierId: 's1', status: 'open', orderAt: 10, lineTotal: 100, payments: [] },
    ],
  })
  assert.equal(rows[0].purchases, 100)
})

test('kho kỳ: đầu + nhập − xuất = cuối', () => {
  const now = 1000
  const rows = stockPeriodRows({
    from: 100,
    to: 200,
    now,
    materials: [{ id: 'm1', name: 'Đá', unit: 'Tấn', stock: 12, active: true }],
    entries: [
      { materialId: 'm1', type: 'import', quantity: 5, createdAt: 150 },
      { materialId: 'm1', type: 'export', quantity: 3, createdAt: 160 },
      { materialId: 'm1', type: 'import', quantity: 2, createdAt: 300 },
    ],
  })
  const r = rows[0]
  // tồn hiện tại 12; nhập sau kỳ +2 → tồn cuối tại 200 = 12 − 2 = 10
  // tồn đầu = 10 − 5 + 3 = 8
  assert.equal(r.closing, 10)
  assert.equal(r.inQty, 5)
  assert.equal(r.outQty, 3)
  assert.equal(r.opening, 8)
  assert.equal(r.opening + r.inQty - r.outQty, r.closing)
})

test('theo dõi đơn: còn lại được âm khi SX vượt', () => {
  const t = salesOrderTracking({
    orders: [{ id: 'o1', code: 'AP1', totalAmount: 20_000_000, status: 'dang_lam' }],
    productions: [
      { salesOrderId: 'o1', status: 'confirmed', quantity: 10, salesUnitPrice: 1_000_000 },
      { salesOrderId: 'o1', status: 'confirmed', quantity: 15, salesUnitPrice: 1_000_000 },
      { salesOrderId: 'o1', status: 'draft', quantity: 99, salesUnitPrice: 1_000_000 },
    ],
  })
  assert.equal(t[0].orderValue, 20_000_000)
  assert.equal(t[0].fulfilledValue, 25_000_000)
  assert.equal(t[0].remainingValue, -5_000_000)
})

test('theo dõi đơn bỏ đơn huỷ; lệnh không gắn không cộng', () => {
  const t = salesOrderTracking({
    orders: [
      { id: 'h', code: 'H', totalAmount: 1, status: 'huy' },
      { id: 'o', code: 'O', totalAmount: 100, status: 'open' },
    ],
    productions: [{ salesOrderId: '', status: 'confirmed', quantity: 10, salesUnitPrice: 9 }],
  })
  assert.equal(t.length, 1)
  assert.equal(t[0].fulfilledValue, 0)
  assert.equal(t[0].remainingValue, 100)
})
