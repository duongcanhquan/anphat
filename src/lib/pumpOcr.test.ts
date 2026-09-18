import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDieselLikeName, parsePumpReading } from './pumpOcr.ts'

test('đọc Số 47.170 từ OCR có nhãn SO / TONG / DON GIA', () => {
  const r = parsePumpReading(`
    TONG 1100000 DONG
    SO 47.170 LIT
    DON GIA 23320 DONG/LIT
  `)
  assert.ok(r.liters != null)
  assert.ok(Math.abs(r.liters - 47.17) < 0.02)
  assert.equal(r.checkOk, true)
  assert.equal(r.confidence, 'high')
})

test('OCR nuốt dấu chấm: 47170 → 47.170 lít', () => {
  const r = parsePumpReading('SO 47170 LIT TONG 1100000 DON GIA 23320')
  assert.ok(r.liters != null)
  assert.ok(Math.abs(r.liters - 47.17) < 0.02)
  assert.equal(r.checkOk, true)
})

test('không có nhãn: suy từ Tổng / Đơn giá', () => {
  const r = parsePumpReading('1100000 23320')
  assert.ok(r.liters != null)
  assert.ok(Math.abs(r.liters - 47.17) < 0.05)
})

test('tên vật liệu diesel', () => {
  assert.equal(isDieselLikeName('Diesel'), true)
  assert.equal(isDieselLikeName('Dầu DO'), true)
  assert.equal(isDieselLikeName('Nhựa đường'), false)
})
