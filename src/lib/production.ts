export type ProductionCalcType = 'stone' | 'nhua' | 'rate' | 'manual'

export interface ProductionItemInput {
  id: string
  materialId: string
  materialName: string
  unit: string
  calcType: ProductionCalcType
  percent: number
  manualQty: number
}

export interface ProductionLineResult extends ProductionItemInput {
  quantity: number
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}

export function computeProduction(input: {
  quantity: number
  stoneFactor: number
  items: ProductionItemInput[]
}): { lines: ProductionLineResult[]; bitumenTotal: number } {
  const G = Number(input.quantity) || 0
  const factor = Number(input.stoneFactor) || 0
  const items = input.items || []

  const nhuaQtys = items
    .filter((i) => i.calcType === 'nhua')
    .map((i) => round2(G * ((Number(i.percent) || 0) / 100)))
  const bitumenTotal = round2(nhuaQtys.reduce((s, q) => s + q, 0))

  const lines: ProductionLineResult[] = items.map((i) => {
    let quantity = 0
    if (i.calcType === 'nhua') {
      quantity = round2(G * ((Number(i.percent) || 0) / 100))
    } else if (i.calcType === 'rate') {
      quantity = round2(G * ((Number(i.percent) || 0) / 100))
    } else if (i.calcType === 'stone') {
      quantity = round4((G - bitumenTotal) * ((Number(i.percent) || 0) / 100) * factor)
    } else {
      quantity = Number(i.manualQty) || 0
    }
    return { ...i, quantity }
  })

  return { lines, bitumenTotal }
}

export function actualDeductQty(stock: number, need: number): number {
  const s = Math.max(0, Number(stock) || 0)
  const n = Math.max(0, Number(need) || 0)
  return Math.min(s, n)
}

export function mergeDeductItems<T extends { materialId: string; quantity: number }>(items: T[]): T[] {
  const map = new Map<string, T>()
  for (const it of items) {
    const cur = map.get(it.materialId)
    if (!cur) {
      map.set(it.materialId, { ...it })
    } else {
      map.set(it.materialId, { ...cur, quantity: (Number(cur.quantity) || 0) + (Number(it.quantity) || 0) })
    }
  }
  return [...map.values()]
}

/** Phân bổ số đã trừ (theo materialId) lại từng dòng, không vượt nhu cầu dòng. */
export function allocateDeductedQty(
  lines: { materialId: string; quantity: number }[],
  deducted: Record<string, number>,
): number[] {
  const left = { ...deducted }
  return lines.map((l) => {
    const avail = Math.max(0, Number(left[l.materialId]) || 0)
    const take = Math.min(Math.max(0, Number(l.quantity) || 0), avail)
    left[l.materialId] = avail - take
    return take
  })
}
