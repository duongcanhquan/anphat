import { clsx } from 'clsx'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay } from 'date-fns'
import { vi } from 'date-fns/locale'

export function cn(...inputs: (string | false | null | undefined)[]) {
  return clsx(inputs)
}

/** Định dạng tiền: nghìn / triệu / tỷ + vnđ */
export function formatMoney(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) {
    const v = abs / 1_000_000_000
    return `${sign}${v % 1 === 0 ? v.toLocaleString('vi-VN') : v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ vnđ`
  }
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000
    return `${sign}${v % 1 === 0 ? v.toLocaleString('vi-VN') : v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} triệu vnđ`
  }
  if (abs >= 10_000) {
    const v = abs / 1_000
    return `${sign}${v % 1 === 0 ? v.toLocaleString('vi-VN') : v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} nghìn vnđ`
  }
  return `${sign}${Math.round(abs).toLocaleString('vi-VN')} vnđ`
}

/** Hiển thị đầy đủ số + vnđ (ô nhập liệu) */
export function formatMoneyFull(n: number): string {
  return `${Math.round(n).toLocaleString('vi-VN')} vnđ`
}

export function parseMoneyInput(raw: string): number {
  const cleaned = raw.replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
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
