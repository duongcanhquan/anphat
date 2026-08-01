import { useMemo, useState, type DragEvent } from 'react'
import { GripVertical, Search, X, Equal } from 'lucide-react'
import { Input } from '@/components/ui'
import type { Conversion, FormulaExprToken, FormulaItem, Material } from '@/types'
import { uid } from '@/lib/utils'

function normalizeSearch(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Đơn vị sau quy đổi (toUnit) nếu có, không thì đơn vị vật liệu */
export function unitAfterConversion(mat: Material, conversions: Conversion[]): string {
  const c = getMaterialConversion(mat, conversions)
  return c?.toUnit || mat.unit
}

/** Lấy quy đổi gắn với vật liệu (ưu tiên fromUnit = đơn vị nhập) */
export function getMaterialConversion(
  mat: Material,
  conversions: Conversion[],
): Conversion | undefined {
  return (
    conversions.find((x) => x.materialId === mat.id && x.fromUnit === mat.unit) ||
    conversions.find((x) => x.materialId === mat.id)
  )
}

/**
 * Tồn kho theo 2 đơn vị:
 * - input: đơn vị nhập (material.unit / stock)
 * - converted: đơn vị quy đổi (toUnit)
 * Quy tắc: 1 fromUnit = factor toUnit
 */
export function stockDualUnits(
  mat: Material,
  conversions: Conversion[],
): {
  inputQty: number
  inputUnit: string
  convertedQty: number | null
  convertedUnit: string | null
  factor: number | null
} {
  const inputQty = mat.stock
  const inputUnit = mat.unit
  const c = getMaterialConversion(mat, conversions)
  if (!c || !(c.factor > 0)) {
    return { inputQty, inputUnit, convertedQty: null, convertedUnit: null, factor: null }
  }
  // stock đang theo đơn vị nhập (= fromUnit)
  if (c.fromUnit === mat.unit || !conversions.find((x) => x.materialId === mat.id && x.fromUnit === mat.unit)) {
    return {
      inputQty,
      inputUnit,
      convertedQty: inputQty * c.factor,
      convertedUnit: c.toUnit,
      factor: c.factor,
    }
  }
  // trường hợp stock đã theo toUnit
  if (c.toUnit === mat.unit) {
    return {
      inputQty,
      inputUnit,
      convertedQty: inputQty / c.factor,
      convertedUnit: c.fromUnit,
      factor: c.factor,
    }
  }
  return { inputQty, inputUnit, convertedQty: null, convertedUnit: null, factor: null }
}

/**
 * Chuẩn hoá một dòng vật liệu về đơn vị ưu tiên:
 * - Có quy đổi → dùng đơn vị sau quy đổi (toUnit), số lượng được đổi theo factor
 * - Không có quy đổi → giữ đơn vị nhập kho của vật liệu
 */
export function toPreferredUnitItem(
  item: FormulaItem,
  materials: Material[],
  conversions: Conversion[],
): FormulaItem {
  const mat = materials.find((m) => m.id === item.materialId)
  if (!mat) return item
  const preferred = unitAfterConversion(mat, conversions)
  if (!item.unit) return { ...item, unit: preferred }
  if (item.unit === preferred) return item
  const c = getMaterialConversion(mat, conversions)
  if (!c || !(c.factor > 0)) {
    // Không có quy đổi và không đổi được số lượng — giữ nguyên để không làm sai
    return item
  }
  // 1 fromUnit = factor toUnit
  if (item.unit === c.fromUnit && preferred === c.toUnit) {
    return { ...item, unit: preferred, quantityPerUnit: item.quantityPerUnit * c.factor }
  }
  if (item.unit === c.toUnit && preferred === c.fromUnit) {
    return { ...item, unit: preferred, quantityPerUnit: item.quantityPerUnit / c.factor }
  }
  // Đơn vị lạ không quy đổi được — giữ nguyên để không làm sai số lượng
  return item
}

/** Đổi số lượng từ đơn vị quy đổi (hoặc bất kỳ) về đơn vị tồn kho để trừ kho */
export function toStockUnitQuantity(
  quantity: number,
  quantityUnit: string,
  mat: Material,
  conversions: Conversion[],
): number {
  if (!quantityUnit || quantityUnit === mat.unit) return quantity
  const c = getMaterialConversion(mat, conversions)
  if (!c || !(c.factor > 0)) return quantity
  // quantity đang ở toUnit → chia factor về fromUnit (= stock)
  if (quantityUnit === c.toUnit && (c.fromUnit === mat.unit || mat.unit !== c.toUnit)) {
    return quantity / c.factor
  }
  // quantity đang ở fromUnit nhưng stock là toUnit
  if (quantityUnit === c.fromUnit && mat.unit === c.toUnit) {
    return quantity * c.factor
  }
  return quantity
}

export function FormulaBuilder({
  materials,
  conversions = [],
  materialIds,
  expression,
  onChange,
  readOnly,
}: {
  materials: Material[]
  conversions?: Conversion[]
  materialIds?: string[]
  expression: FormulaExprToken[]
  onChange: (expr: FormulaExprToken[]) => void
  readOnly?: boolean
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragMaterialId, setDragMaterialId] = useState<string | null>(null)

  const [matQuery, setMatQuery] = useState('')
  const pool = materials.filter(
    (m) => m.active && (!materialIds?.length || materialIds.includes(m.id)),
  )
  const filteredPool = useMemo(() => {
    const q = normalizeSearch(matQuery)
    if (!q) return pool
    return pool.filter((m) => normalizeSearch(`${m.name} ${m.description || ''} ${m.unit}`).includes(q))
  }, [pool, matQuery])

  const addMaterialFromPool = (mat: Material) => {
    if (readOnly) return
    const unit = unitAfterConversion(mat, conversions)
    onChange([
      ...expression,
      {
        id: uid(),
        kind: 'material',
        materialId: mat.id,
        materialName: mat.name,
        quantityPerUnit: 1,
        unit,
      },
    ])
  }

  const onExprDrop = (e: DragEvent) => {
    e.preventDefault()
    if (readOnly || !dragMaterialId) return
    const mat = materials.find((m) => m.id === dragMaterialId)
    if (mat) addMaterialFromPool(mat)
    setDragMaterialId(null)
  }

  const reorder = (from: number, to: number) => {
    if (readOnly || from === to) return
    const next = [...expression]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  const updateMaterialQty = (tokenId: string, qty: number) => {
    onChange(
      expression.map((t) =>
        t.id === tokenId && t.kind === 'material' ? { ...t, quantityPerUnit: qty } : t,
      ),
    )
  }

  const removeToken = (tokenId: string) => {
    if (readOnly) return
    onChange(expression.filter((t) => t.id !== tokenId))
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="rounded-2xl border border-line bg-surface/40 p-3">
        <p className="mb-2 text-sm font-semibold">Vật liệu</p>
        <p className="mb-2 text-xs text-muted">Gõ tìm → chạm hoặc kéo vào công thức</p>
        <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            type="search"
            value={matQuery}
            onChange={(e) => setMatQuery(e.target.value)}
            placeholder="Gõ tên vật liệu…"
            disabled={readOnly}
            className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted/70 disabled:opacity-50"
            autoComplete="off"
          />
        </div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {pool.length === 0 && <p className="text-sm text-muted">Chưa có vật liệu.</p>}
          {pool.length > 0 && filteredPool.length === 0 && (
            <p className="text-sm text-muted">Không tìm thấy “{matQuery}”.</p>
          )}
          {filteredPool.map((m) => {
            const unit = unitAfterConversion(m, conversions)
            return (
              <button
                key={m.id}
                type="button"
                draggable={!readOnly}
                onDragStart={() => setDragMaterialId(m.id)}
                onDragEnd={() => setDragMaterialId(null)}
                disabled={readOnly}
                onClick={() => addMaterialFromPool(m)}
                className="flex w-full items-center justify-between rounded-xl bg-card px-3 py-2.5 text-left text-sm font-medium transition hover:bg-accent-soft hover:text-accent disabled:opacity-50"
              >
                <span>{m.name}</span>
                <span className="text-xs text-muted">{unit}</span>
              </button>
            )
          })}
        </div>
        {pool.length > 8 && (
          <p className="mt-2 text-[11px] text-muted">{filteredPool.length}/{pool.length} vật liệu</p>
        )}
      </div>

      <div className="rounded-2xl border border-dashed border-line bg-card p-3">
        <p className="mb-2 text-sm font-semibold">Công thức tỷ lệ</p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onExprDrop}
          className="min-h-[120px] rounded-xl border border-line/60 bg-surface/50 p-3"
        >
          {expression.filter((t) => t.kind === 'material').length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Thêm vật liệu từ danh sách</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {expression
                .filter((t) => t.kind === 'material')
                .map((t, idx) => {
                  if (t.kind !== 'material') return null
                  return (
                    <div
                      key={t.id}
                      draggable={!readOnly}
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (dragIndex !== null) {
                          const mats = expression.filter((x) => x.kind === 'material')
                          const fromId = mats[dragIndex]?.id
                          const toId = mats[idx]?.id
                          if (!fromId || !toId) return
                          const from = expression.findIndex((x) => x.id === fromId)
                          const to = expression.findIndex((x) => x.id === toId)
                          if (from >= 0 && to >= 0) reorder(from, to)
                          setDragIndex(idx)
                        }
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      className={`inline-flex items-center gap-1 rounded-xl border border-accent/30 bg-accent-soft px-2 py-1.5 ${
                        readOnly ? '' : 'cursor-grab active:cursor-grabbing'
                      }`}
                    >
                      {!readOnly && <GripVertical size={12} className="opacity-40" />}
                      <Input
                        type="number"
                        step="any"
                        className="!w-16 !py-1 !text-sm"
                        value={t.quantityPerUnit}
                        disabled={readOnly}
                        onChange={(e) => updateMaterialQty(t.id, Number(e.target.value) || 0)}
                      />
                      <span className="text-xs font-semibold text-accent-hot">
                        {t.unit} {t.materialName}
                      </span>
                      {!readOnly && (
                        <button type="button" onClick={() => removeToken(t.id)} aria-label="Xoá">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )
                })}
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Equal size={14} /> = 1 sản phẩm
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
