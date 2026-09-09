import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actualDeductQty, computeProduction, round2, round4, mergeDeductItems, allocateDeductedQty } from './production.ts'

test('làm tròn 2 và 4 chữ số', () => {
  assert.equal(round2(80.006), 80.01)
  assert.equal(round2(80.004), 80)
  assert.equal(round4(3914.00004), 3914)
  assert.equal(round4(3914.00006), 3914.0001)
})

test('ví dụ file: G=10000, nhựa 5%, đá 40%, than 1%, diesel 0.8%, MC gõ tay, hệ số 1.03', () => {
  const r = computeProduction({
    quantity: 10_000,
    stoneFactor: 1.03,
    items: [
      { id: 'nhua', materialId: 'm-nhua', materialName: 'Nhựa đường', unit: 'Kg', calcType: 'nhua', percent: 5, manualQty: 0 },
      { id: 'da', materialId: 'm-da', materialName: 'Đá 2x2', unit: 'Kg', calcType: 'stone', percent: 40, manualQty: 0 },
      { id: 'than', materialId: 'm-than', materialName: 'Than', unit: 'Kg', calcType: 'rate', percent: 1, manualQty: 0 },
      { id: 'dau', materialId: 'm-dau', materialName: 'Diesel', unit: 'Lít', calcType: 'rate', percent: 0.8, manualQty: 0 },
      { id: 'mc', materialId: 'm-mc', materialName: 'MC', unit: 'Kg', calcType: 'manual', percent: 0, manualQty: 12.345 },
    ],
  })
  const by = Object.fromEntries(r.lines.map((l) => [l.id, l.quantity]))
  assert.equal(by.nhua, 500)
  assert.equal(by.da, 3914)
  assert.equal(by.than, 100)
  assert.equal(by.dau, 80)
  assert.equal(by.mc, 12.345)
  assert.equal(r.bitumenTotal, 500)
})

test('đổi hệ số đá 1.00 → đá = 3800', () => {
  const r = computeProduction({
    quantity: 10_000,
    stoneFactor: 1,
    items: [
      { id: 'nhua', materialId: 'n', materialName: 'Nhựa', unit: 'Kg', calcType: 'nhua', percent: 5, manualQty: 0 },
      { id: 'da', materialId: 'd', materialName: 'Đá', unit: 'Kg', calcType: 'stone', percent: 40, manualQty: 0 },
    ],
  })
  assert.equal(r.lines.find((l) => l.id === 'da')?.quantity, 3800)
})

test('không có nhựa thì đá tính trên G', () => {
  const r = computeProduction({
    quantity: 1000,
    stoneFactor: 1,
    items: [{ id: 'da', materialId: 'd', materialName: 'Đá', unit: 'Kg', calcType: 'stone', percent: 50, manualQty: 0 }],
  })
  assert.equal(r.lines[0].quantity, 500)
  assert.equal(r.bitumenTotal, 0)
})

test('trừ kho thực tế = min(tồn, nhu cầu), không âm', () => {
  assert.equal(actualDeductQty(100, 3914), 100)
  assert.equal(actualDeductQty(5000, 3914), 3914)
  assert.equal(actualDeductQty(0, 10), 0)
})

test('gộp dòng cùng vật liệu trước khi trừ kho', () => {
  const merged = mergeDeductItems([
    { materialId: 'da', quantity: 100, name: 'a' },
    { materialId: 'nhua', quantity: 50, name: 'b' },
    { materialId: 'da', quantity: 40, name: 'c' },
  ])
  assert.equal(merged.find((x) => x.materialId === 'da')?.quantity, 140)
  assert.equal(merged.find((x) => x.materialId === 'nhua')?.quantity, 50)
  assert.equal(merged.length, 2)
})

test('phân bổ deductedQty theo từng dòng', () => {
  const qtys = allocateDeductedQty(
    [
      { materialId: 'da', quantity: 100 },
      { materialId: 'da', quantity: 50 },
    ],
    { da: 120 },
  )
  assert.deepEqual(qtys, [100, 20])
})
