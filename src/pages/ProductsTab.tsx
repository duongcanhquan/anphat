import { useState, type FormEvent } from 'react'
import { Plus, Star, Trash2 } from 'lucide-react'
import { FormulaBuilder, toPreferredUnitItem } from '@/components/FormulaBuilder'
import { MoneyInput } from '@/components/MoneyInput'
import { Badge, Bento, Button, Empty, Input, Modal, Select } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { createAuditLog, createFormula, deleteFormula, updateFormula } from '@/lib/store'
import type { Conversion, Formula, FormulaExprToken, Material, ProductRecipe, WeightUnit } from '@/types'
import { getDefaultRecipe, getProductRecipes, itemsFromExpression, normalizeUnit } from '@/types'
import { formatMoney, formatNumber, uid } from '@/lib/utils'

export function ProductsTab({
  materials,
  formulas,
  conversions = [],
  unitOptions,
  writable,
  onMsg,
}: {
  materials: Material[]
  formulas: Formula[]
  conversions?: Conversion[]
  unitOptions: string[]
  writable: boolean
  onMsg: (s: string) => void
}) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Formula | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState<WeightUnit>('Tấn')
  const [unitPrice, setUnitPrice] = useState(0)
  const [recipes, setRecipes] = useState<ProductRecipe[]>([])
  const [activeRecipeId, setActiveRecipeId] = useState('')
  const [newRecipeLabel, setNewRecipeLabel] = useState('')

  const activeRecipe = recipes.find((r) => r.id === activeRecipeId) || recipes[0]

  const resetForm = () => {
    setEdit(null)
    setName('')
    setDescription('')
    setUnit('Tấn')
    setUnitPrice(0)
    setRecipes([])
    setActiveRecipeId('')
    setNewRecipeLabel('')
  }

  const openNew = () => {
    resetForm()
    const rid = uid()
    setRecipes([
      {
        id: rid,
        label: 'Mặc định',
        isDefault: true,
        expression: [],
        items: [],
        createdAt: Date.now(),
        createdBy: profile?.id,
      },
    ])
    setActiveRecipeId(rid)
    setOpen(true)
  }

  const openEditProduct = (f: Formula) => {
    const list = getProductRecipes(f).map((r) => ({
      ...r,
      // Hiển thị theo đơn vị sau quy đổi hiện hành (không có quy đổi → đơn vị nhập kho)
      expression: r.expression
        .filter((t) => t.kind === 'material')
        .map((t) => {
          if (t.kind !== 'material') return { ...t }
          const norm = toPreferredUnitItem(
            {
              materialId: t.materialId,
              materialName: t.materialName,
              quantityPerUnit: t.quantityPerUnit,
              unit: t.unit,
            },
            materials,
            conversions,
          )
          return { ...t, quantityPerUnit: norm.quantityPerUnit, unit: norm.unit }
        }),
    }))
    setEdit(f)
    setName(f.name)
    setDescription(f.description)
    setUnit(normalizeUnit(f.unit))
    setUnitPrice(f.unitPrice)
    setRecipes(list)
    setActiveRecipeId(f.defaultRecipeId || list.find((r) => r.isDefault)?.id || list[0]?.id || '')
    setOpen(true)
  }

  const updateActiveExpression = (expression: FormulaExprToken[]) => {
    if (!activeRecipe) return
    const matsOnly = expression.filter((t) => t.kind === 'material')
    const items = itemsFromExpression(matsOnly)
    setRecipes((prev) =>
      prev.map((r) => (r.id === activeRecipe.id ? { ...r, expression: matsOnly, items } : r)),
    )
  }

  const addRecipe = () => {
    const label = newRecipeLabel.trim() || `Công thức ${recipes.length + 1}`
    const id = uid()
    setRecipes((p) => [
      ...p,
      { id, label, isDefault: false, expression: [], items: [], createdAt: Date.now(), createdBy: profile?.id },
    ])
    setActiveRecipeId(id)
    setNewRecipeLabel('')
  }

  const setDefaultRecipe = (id: string) => {
    setRecipes((p) => p.map((r) => ({ ...r, isDefault: r.id === id })))
  }

  const removeRecipe = (id: string) => {
    if (recipes.length <= 1) return
    const next = recipes.filter((r) => r.id !== id)
    setRecipes(next)
    if (activeRecipeId === id) setActiveRecipeId(next[0].id)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable) return
    const defaultRecipe = recipes.find((r) => r.isDefault) || recipes[0]
    const items = defaultRecipe ? itemsFromExpression(defaultRecipe.expression) : []
    const materialIds = [...new Set(items.map((i) => i.materialId))]
    const data = {
      name: name.trim(),
      description: description.trim(),
      unit,
      unitPrice,
      items,
      expression: defaultRecipe?.expression || [],
      recipes,
      defaultRecipeId: defaultRecipe?.id || '',
      materialIds,
      updatedAt: Date.now(),
    }
    if (edit) {
      await updateFormula(edit.id, { ...data, history: edit.history || [] })
      await createAuditLog({
        entityType: 'formula',
        entityId: edit.id,
        entityLabel: name.trim(),
        action: 'update',
        summary: `Sửa sản phẩm "${name.trim()}"`,
        userId: profile?.id || '',
        userName: profile?.displayName || '',
        createdAt: Date.now(),
      })
      onMsg('Đã cập nhật sản phẩm.')
    } else {
      const id = await createFormula({ ...data, history: [], active: true, createdAt: Date.now() })
      await createAuditLog({
        entityType: 'formula',
        entityId: id,
        entityLabel: name.trim(),
        action: 'create',
        summary: `Tạo sản phẩm "${name.trim()}"`,
        userId: profile?.id || '',
        userName: profile?.displayName || '',
        createdAt: Date.now(),
      })
      onMsg('Đã thêm sản phẩm.')
    }
    setOpen(false)
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        {writable && (
          <Button onClick={openNew}>
            <Plus size={16} /> Thêm sản phẩm
          </Button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {formulas.map((f) => {
          const recipesList = getProductRecipes(f)
          const def = getDefaultRecipe(f)
          return (
            <Bento key={f.id} title={`${f.name}${f.description ? ` — ${f.description}` : ''}`} subtitle={`${formatMoney(f.unitPrice)} / ${normalizeUnit(f.unit)}`}>
              <div className="flex flex-wrap gap-1">
                {recipesList.map((r) => (
                  <Badge key={r.id} tone={r.id === def.id ? 'accent' : 'ok'}>
                    {r.isDefault && <Star size={10} className="mr-1 inline" />}
                    {r.label}
                  </Badge>
                ))}
              </div>
              <div className="mt-2 space-y-1">
                {def.items
                  .map((i) => toPreferredUnitItem(i, materials, conversions))
                  .map((i) => (
                    <div key={i.materialId} className="flex justify-between text-sm">
                      <span>{i.materialName}</span>
                      <span className="num font-semibold">{formatNumber(i.quantityPerUnit)} {i.unit}</span>
                    </div>
                  ))}
              </div>
              {writable && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEditProduct(f)}>Sửa</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Xoá sản phẩm ${f.name}?`)) return
                      await deleteFormula(f.id)
                      await createAuditLog({
                        entityType: 'formula',
                        entityId: f.id,
                        entityLabel: f.name,
                        action: 'delete',
                        summary: `Xoá sản phẩm "${f.name}"`,
                        userId: profile?.id || '',
                        userName: profile?.displayName || '',
                        createdAt: Date.now(),
                      })
                      onMsg('Đã xoá sản phẩm.')
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </Bento>
          )
        })}
      </div>
      {formulas.length === 0 && <Empty text="Thêm sản phẩm (vd: bê tông nhựa C13)." />}

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm'} wide>
        <form className="space-y-4" onSubmit={save}>
          <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr]">
            <Input label="Tên sản phẩm" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ngắn gọn…" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Đơn vị sản phẩm" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {/* Giữ cả đơn vị hiện tại nếu không nằm trong danh sách để không hiển thị sai */}
              {[...new Set([...unitOptions, ...(unit ? [unit] : [])])].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
            <MoneyInput label="Đơn giá mặc định" value={unitPrice} onChange={setUnitPrice} disabled={!writable} />
          </div>

          <div className="rounded-2xl border border-dashed border-line p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Công thức / tỷ lệ</p>
              {recipes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveRecipeId(r.id)}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-semibold ${
                    r.id === activeRecipeId ? 'bg-accent text-white' : 'bg-surface-2 text-ink'
                  }`}
                >
                  {r.isDefault && <Star size={12} />}
                  {r.label}
                </button>
              ))}
            </div>
            {activeRecipe && (
              <>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setDefaultRecipe(activeRecipe.id)}>
                    <Star size={12} /> Đặt làm mặc định
                  </Button>
                  {recipes.length > 1 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeRecipe(activeRecipe.id)}>
                      <Trash2 size={12} /> Xoá công thức này
                    </Button>
                  )}
                </div>
                <FormulaBuilder
                  materials={materials}
                  conversions={conversions}
                  expression={activeRecipe.expression}
                  onChange={updateActiveExpression}
                  readOnly={!writable}
                />
              </>
            )}
            <div className="mt-3 flex gap-2">
              <Input
                label="Tên công thức mới"
                value={newRecipeLabel}
                onChange={(e) => setNewRecipeLabel(e.target.value)}
                placeholder="vd: Công thức mùa hè"
              />
              <div className="flex items-end">
                <Button type="button" variant="secondary" onClick={addRecipe}>
                  <Plus size={14} /> Thêm công thức
                </Button>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full">Lưu sản phẩm</Button>
        </form>
      </Modal>
    </>
  )
}
