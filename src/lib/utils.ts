import { clsx } from 'clsx'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay } from 'date-fns'
import { vi } from 'date-fns/locale'

export function cn(...inputs: (string | false | null | undefined)[]) {
  return clsx(inputs)
}

/** Số đầy đủ, cách nhau dấu chấm + vnđ (vd: 1.250.000 vnđ) */
export function formatMoney(n: number): string {
  const abs = Math.abs(Math.round(n || 0))
  const sign = n < 0 ? '-' : ''
  return `${sign}${abs.toLocaleString('vi-VN')} vnđ`
}

export function formatMoneyFull(n: number): string {
  return formatMoney(n)
}

export function parseMoneyInput(raw: string): number {
  let s = String(raw || '').replace(/[^\d.,-]/g, '').trim()
  if (!s || s === '-' || s === '.' || s === ',') return 0

  const dotCount = (s.match(/\./g) || []).length
  const commaCount = (s.match(/,/g) || []).length

  if (dotCount && commaCount) {
    // Dấu xuất hiện sau cùng là phần thập phân
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (dotCount > 1) {
    // 1.250.000 → nghìn VN
    s = s.replace(/\./g, '')
  } else if (commaCount > 1) {
    s = s.replace(/,/g, '')
  } else if (commaCount === 1) {
    s = s.replace(',', '.')
  } else if (dotCount === 1) {
    // 1.000 (đúng 3 số sau dấu) → nghìn; còn lại coi thập phân
    const m = s.match(/^(-?\d+)\.(\d+)$/)
    if (m && m[2].length === 3) s = m[1] + m[2]
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

export function formatNumber(n: number, digits = 2): string {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(n)
}

export function formatDateTime(ts: number): string {
  return format(new Date(ts), 'dd/MM/yyyy HH:mm', { locale: vi })
}

export function formatDate(ts: number): string {
  return format(new Date(ts), 'dd/MM/yyyy', { locale: vi })
}

export type PeriodType = 'day' | 'week' | 'month' | 'year'

export function getPeriodRange(type: PeriodType, ref = new Date()): { from: number; to: number; label: string } {
  if (type === 'day') {
    const from = startOfDay(ref)
    const to = endOfDay(ref)
    return {
      from: from.getTime(),
      to: to.getTime(),
      label: format(ref, 'dd/MM/yyyy', { locale: vi }),
    }
  }
  if (type === 'week') {
    const from = startOfWeek(ref, { weekStartsOn: 1 })
    const to = endOfWeek(ref, { weekStartsOn: 1 })
    return {
      from: startOfDay(from).getTime(),
      to: endOfDay(to).getTime(),
      label: `${format(from, 'dd/MM')} – ${format(to, 'dd/MM/yyyy')}`,
    }
  }
  if (type === 'month') {
    const from = startOfMonth(ref)
    const to = endOfMonth(ref)
    return {
      from: startOfDay(from).getTime(),
      to: endOfDay(to).getTime(),
      label: format(ref, 'MM/yyyy', { locale: vi }),
    }
  }
  const from = startOfYear(ref)
  const to = endOfYear(ref)
  return {
    from: startOfDay(from).getTime(),
    to: endOfDay(to).getTime(),
    label: format(ref, 'yyyy'),
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
