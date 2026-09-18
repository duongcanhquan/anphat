import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  displayDateTimeToIso,
  displayDateToIso,
  isCompleteDateInput,
  isoDateTimeToDisplay,
  isoToDisplayDate,
  localDayEnd,
  localDayStart,
} from './dateInput.ts'

test('ISO → DD/MM/YYYY', () => {
  assert.equal(isoToDisplayDate('2026-09-18'), '18/09/2026')
  assert.equal(isoToDisplayDate(''), '')
})

test('gõ DD/MM/YYYY, dấu chấm, 8 số → ISO', () => {
  assert.equal(displayDateToIso('18/09/2026'), '2026-09-18')
  assert.equal(displayDateToIso('18.09.2026'), '2026-09-18')
  assert.equal(displayDateToIso('18-09-2026'), '2026-09-18')
  assert.equal(displayDateToIso('18092026'), '2026-09-18')
  assert.equal(displayDateToIso('18/9/26'), '2026-09-18')
})

test('ngày không hợp lệ → null', () => {
  assert.equal(displayDateToIso('32/01/2026'), null)
  assert.equal(displayDateToIso('abc'), null)
})

test('ô trống cho phép rỗng', () => {
  assert.equal(displayDateToIso(''), '')
  assert.equal(displayDateToIso('   '), '')
})

test('ngày giờ DD/MM/YYYY HH:mm', () => {
  assert.equal(isoDateTimeToDisplay('2026-09-18T09:05'), '18/09/2026 09:05')
  assert.equal(displayDateTimeToIso('18/09/2026 9:5'), '2026-09-18T09:05')
  assert.equal(displayDateTimeToIso('18092026 0930'), '2026-09-18T09:30')
})

test('chỉ coi là đủ ngày khi có năm 4 số hoặc 8 chữ số', () => {
  assert.equal(isCompleteDateInput('18/09/202'), false)
  assert.equal(isCompleteDateInput('18/09/2026'), true)
  assert.equal(isCompleteDateInput('18092026'), true)
  assert.equal(isCompleteDateInput('180920'), false)
  assert.equal(isCompleteDateInput('18/9/2026'), true)
})

test('lọc ngày theo local, không lệch UTC', () => {
  const start = localDayStart('2026-09-18')
  const end = localDayEnd('2026-09-18')
  const d = new Date(start)
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth(), 8)
  assert.equal(d.getDate(), 18)
  assert.equal(d.getHours(), 0)
  assert.ok(end > start)
  assert.equal(new Date(end).getDate(), 18)
})
