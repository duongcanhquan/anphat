function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function parseLooseNumber(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return n
}

/** Gom số từ OCR (có thể dính dấu chấm nghìn hoặc thập phân). */
export function extractNumbers(text: string): number[] {
  const matches = text.match(/\d[\d.,]*/g) || []
  const out: number[] = []
  for (const m of matches) {
    const n = parseLooseNumber(m)
    if (n != null && n > 0) out.push(n)
  }
  return out
}

function litersFromDisplay(n: number): number {
  // Cây xăng VN thường 3 số lẻ: 47.170. OCR hay nuốt dấu → 47170
  if (n >= 1000 && n < 1_000_000 && Number.isInteger(n)) {
    return round3(n / 1000)
  }
  return round3(n)
}

export interface PumpReadingParse {
  liters: number | null
  totalVnd: number | null
  unitPrice: number | null
  checkOk: boolean
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Đọc đồng hồ cây xăng: quan tâm dòng Số (lít).
 * Nếu có Tổng + Đơn giá thì đối chiếu: Tổng / ĐG ≈ Số.
 */
export function parsePumpReading(text: string): PumpReadingParse {
  const raw = (text || '').replace(/\u00a0/g, ' ')
  const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  let liters: number | null = null
  const so = lower.match(/\bso\b[^0-9]{0,12}([\d.,]+)/i)
  if (so) liters = litersFromDisplay(parseLooseNumber(so[1]) || 0)

  const nums = extractNumbers(raw)
  let totalVnd: number | null = null
  let unitPrice: number | null = null

  const moneyish = nums.filter((n) => n >= 5_000)
  if (moneyish.length >= 2) {
    totalVnd = Math.max(...moneyish)
    unitPrice = moneyish.filter((n) => n !== totalVnd).sort((a, b) => a - b)[0] || null
  } else if (moneyish.length === 1) {
    totalVnd = moneyish[0]
  }

  if (liters == null) {
    const small = nums.filter((n) => n > 0 && n < 5_000)
    if (small.length === 1) liters = litersFromDisplay(small[0])
    else if (totalVnd && unitPrice && unitPrice > 0) {
      liters = round3(totalVnd / unitPrice)
    } else if (small.length > 1) {
      liters = litersFromDisplay(small[0])
    }
  }

  if (liters != null && liters <= 0) liters = null

  let checkOk = false
  if (liters && totalVnd && unitPrice && unitPrice > 0) {
    const implied = totalVnd / unitPrice
    checkOk = Math.abs(implied - liters) / Math.max(liters, 0.001) < 0.03
    if (!checkOk && Math.abs(implied - liters) < 0.05) checkOk = true
  }

  let confidence: PumpReadingParse['confidence'] = 'low'
  if (liters && checkOk) confidence = 'high'
  else if (liters && so) confidence = 'medium'
  else if (liters) confidence = 'low'

  return { liters, totalVnd, unitPrice, checkOk, confidence }
}

export function isDieselLikeName(name: string): boolean {
  const n = (name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return /diesel|diezel|dau do|\bdo\b|dau nien lieu|nien lieu/.test(n) || (n.includes('dau') && !n.includes('nhua'))
}
