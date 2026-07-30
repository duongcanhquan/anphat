import { useState, type DragEvent } from 'react'
import { GripVertical, X, Equal } from 'lucide-react'
import { Input } from '@/components/ui'
import type { Conversion, FormulaExprToken, Material } from '@/types'
import { uid } from '@/lib/utils'

/** Đơn vị sau quy đổi (toUnit) nếu có, không thì đơn vị vật liệu */
export function unitAfterConversion(mat: Material, conversions: Conversion[]): string {
  const c = conversions.find((x) => x.materialId === mat.id)
  return c?.toUnit || mat.unit
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

  const pool = materials.filter(
    (m) => m.active && (!materialIds?.length || materialIds.includes(m.id)),
  )

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
        <p className="mb-2 text-xs text-muted">Chạm hoặc kéo vào công thức →</p>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {pool.length === 0 && <p className="text-sm text-muted">Chưa có vật liệu.</p>}
          {pool.map((m) => {
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
      </div>

      <div className="rounded-2xl border border-dashed border-line bg-card p-3">
        <p className="mb-2 text-sm font-semibold">Công thức tỷ lệ</p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onExprDrop}
          className="min-h-[120px] rounded-xl border border-line/60 bg-surface/50 p-3"
        >
          {expression.filter((t) => t.kind === 'material').length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Thêm vật liệu từ bên trái</p>
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
                      <span className="text-xs font-semibold text-accent">
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
                <Equal size={14} /> = 1 thành phẩm
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
