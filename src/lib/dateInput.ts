function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function validYmd(y: number, m: number, d: number): boolean {
  if (!y || !m || !d) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

function yearFrom(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (raw.length <= 2) return n >= 70 ? 1900 + n : 2000 + n
  return n
}

/** yyyy-mm-dd → DD/MM/YYYY */
export function isoToDisplayDate(iso: string): string {
  const s = (iso || '').trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

/**
 * Chuỗi người dùng → yyyy-mm-dd.
 * '' nếu trống; null nếu không phải ngày hợp lệ.
 */
export function displayDateToIso(raw: string): string | null {
  const s = (raw || '').trim()
  if (!s) return ''
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    return validYmd(y, m, d) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
  }
  const parts = s.split(/[./\s-]+/).filter(Boolean)
  if (parts.length === 3 && parts[0].length <= 2) {
    const d = Number(parts[0])
    const m = Number(parts[1])
    const y = yearFrom(parts[2])
    if (!validYmd(y, m, d)) return null
    return `${y}-${pad(m)}-${pad(d)}`
  }
  const digits = s.replace(/\D/g, '')
  if (digits.length === 8) {
    const d = Number(digits.slice(0, 2))
    const m = Number(digits.slice(2, 4))
    const y = Number(digits.slice(4))
    if (!validYmd(y, m, d)) return null
    return `${y}-${pad(m)}-${pad(d)}`
  }
  if (digits.length === 6) {
    const d = Number(digits.slice(0, 2))
    const m = Number(digits.slice(2, 4))
    const y = yearFrom(digits.slice(4))
    if (!validYmd(y, m, d)) return null
    return `${y}-${pad(m)}-${pad(d)}`
  }
  return null
}

/** Đủ ngày để ghi ngay khi đang gõ (tránh nhận năm 202 lúc gõ 2026). */
export function isCompleteDateInput(raw: string): boolean {
  const s = (raw || '').trim()
  if (!s) return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true
  const parts = s.split(/[./\s-]+/).filter(Boolean)
  if (parts.length === 3 && parts[2].length === 4) return true
  return s.replace(/\D/g, '').length === 8
}

export function localDayStart(iso: string): number {
  const parsed = displayDateToIso(iso)
  if (!parsed) return 0
  const [y, m, d] = parsed.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}

export function localDayEnd(iso: string): number {
  const parsed = displayDateToIso(iso)
  if (!parsed) return Number.MAX_SAFE_INTEGER
  const [y, m, d] = parsed.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

/** yyyy-mm-ddTHH:mm → DD/MM/YYYY HH:mm */
export function isoDateTimeToDisplay(iso: string): string {
  const s = (iso || '').trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`
}

/** DD/MM/YYYY HH:mm → yyyy-mm-ddTHH:mm */
export function displayDateTimeToIso(raw: string): string | null {
  const s = (raw || '').trim()
  if (!s) return ''
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (iso) return `${iso[1]}T${iso[2]}:${iso[3]}`

  const m = s.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T]+(\d{1,2})[:hH](\d{1,2}))?$/,
  )
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = yearFrom(m[3])
    if (!validYmd(y, mo, d)) return null
    const hh = pad(Number(m[4] ?? 12))
    const mm = pad(Number(m[5] ?? 0))
    if (Number(hh) > 23 || Number(mm) > 59) return null
    return `${y}-${pad(mo)}-${pad(d)}T${hh}:${mm}`
  }

  const digits = s.replace(/\D/g, '')
  if (digits.length === 12 || digits.length === 8) {
    const dateIso = displayDateToIso(digits.slice(0, 8))
    if (!dateIso) return null
    if (digits.length === 8) return `${dateIso}T12:00`
    const hh = digits.slice(8, 10)
    const mm = digits.slice(10, 12)
    if (Number(hh) > 23 || Number(mm) > 59) return null
    return `${dateIso}T${hh}:${mm}`
  }
  return null
}
