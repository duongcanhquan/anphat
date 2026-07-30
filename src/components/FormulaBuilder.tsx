import { useState, type DragEvent } from 'react'
import { Divide, GripVertical, Minus, Plus, X, Equal } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import type { FormulaExprToken, FormulaOp, Material } from '@/types'
import { formatNumber, uid } from '@/lib/utils'

const OP_LABEL: Record<FormulaOp, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
}

export function FormulaBuilder({
  materials,
  materialIds,
  expression,
  onChange,
  readOnly,
}: {
  materials: Material[]
  materialIds: string[]
  expression: FormulaExprToken[]
  onChange: (expr: FormulaExprToken[]) => void
  readOnly?: boolean
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragMaterialId, setDragMaterialId] = useState<string | null>(null)

  const pool = materials.filter(
    (m) => m.active && (materialIds.length === 0 || materialIds.includes(m.id)),
  )

  const addOp = (op: FormulaOp) => {
    if (readOnly) return
    onChange([...expression, { id: uid(), kind: 'op', op }])
  }

  const addMaterialFromPool = (mat: Material) => {
    if (readOnly) return
    onChange([
      ...expression,
      {
        id: uid(),
        kind: 'material',
        materialId: mat.id,
        materialName: mat.name,
        quantityPerUnit: 1,
        unit: mat.unit,
      },
    ])
  }

  const onPoolDragStart = (matId: string) => setDragMaterialId(matId)
  const onExprDragOver = (e: DragEvent) => {
    e.preventDefault()
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
      {/* Trái: danh sách vật liệu */}
      <div className="rounded-2xl border border-line bg-surface/40 p-3">
        <p className="mb-2 text-sm font-semibold">Vật liệu</p>
        <p className="mb-2 text-xs text-muted">Kéo thả hoặc chạm để thêm vào công thức →</p>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {pool.length === 0 && (
            <p className="text-sm text-muted">Chọn vật liệu thành phần phía trên trước.</p>
          )}
          {pool.map((m) => (
            <button
              key={m.id}
              type="button"
              draggable={!readOnly}
              onDragStart={() => onPoolDragStart(m.id)}
              onDragEnd={() => setDragMaterialId(null)}
              disabled={readOnly}
              onClick={() => addMaterialFromPool(m)}
              className="flex w-full items-center justify-between rounded-xl bg-card px-3 py-2.5 text-left text-sm font-medium transition hover:bg-accent-soft hover:text-accent disabled:opacity-50"
            >
              <span>{m.name}</span>
              <span className="text-xs text-muted">{m.unit}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Phải: toán tử + biểu thức */}
      <div className="rounded-2xl border border-dashed border-line bg-card p-3">
        {!readOnly && (
          <div className="mb-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => addOp('+')}>
              <Plus size={14} /> Cộng
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => addOp('-')}>
              <Minus size={14} /> Trừ
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => addOp('*')}>
              <span className="text-base font-bold leading-none">×</span> Nhân
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => addOp('/')}>
              <Divide size={14} /> Chia
            </Button>
          </div>
        )}

        <div
          onDragOver={onExprDragOver}
          onDrop={onExprDrop}
          className="min-h-[120px] rounded-xl border border-line/60 bg-surface/50 p-3"
        >
          {expression.length === 0 ? (
            <p className="text-center text-sm text-muted py-6">
              Kéo vật liệu từ bên trái hoặc chọn toán tử ở trên
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {expression.map((t, idx) => (
                <div
                  key={t.id}
                  draggable={!readOnly}
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (dragIndex !== null) reorder(dragIndex, idx)
                    setDragIndex(idx)
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1.5 ${
                    readOnly ? '' : 'cursor-grab active:cursor-grabbing'
                  } ${
                    t.kind === 'op'
                      ? 'border-ink bg-ink text-surface'
                      : t.kind === 'number'
                        ? 'border-line bg-surface-2'
                        : 'border-accent/30 bg-accent-soft'
                  }`}
                >
                  {!readOnly && <GripVertical size={12} className="opacity-40" />}
                  {t.kind === 'op' && <span className="font-bold">{OP_LABEL[t.op]}</span>}
                  {t.kind === 'number' && (
                    <span className="num text-sm font-semibold">{formatNumber(t.value)}</span>
                  )}
                  {t.kind === 'material' && (
                    <div className="flex flex-wrap items-center gap-1">
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
                    </div>
                  )}
                  {!readOnly && (
                    <button type="button" onClick={() => removeToken(t.id)} aria-label="Xoá">
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
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
