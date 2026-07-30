import { useState, type FormEvent } from 'react'
import { Plus, Star, Trash2 } from 'lucide-react'
import { FormulaBuilder } from '@/components/FormulaBuilder'
import { MoneyInput } from '@/components/MoneyInput'
import { Badge, Bento, Button, Empty, Input, Modal, Select, Textarea } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { createFormula, deleteFormula, updateFormula } from '@/lib/store'
import type { Formula, FormulaExprToken, Material, ProductRecipe, WeightUnit } from '@/types'
import { getDefaultRecipe, getProductRecipes, itemsFromExpression } from '@/types'
import { formatMoney, formatNumber, uid } from '@/lib/utils'

export function ProductsTab({
  materials,
  formulas,
  unitOptions,
  writable,
  onMsg,
}: {
  materials: Material[]
  formulas: Formula[]
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
  const [materialIds, setMaterialIds] = useState<string[]>([])
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
    setMaterialIds([])
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
    const list = getProductRecipes(f).map((r) => ({ ...r, expression: r.expression.map((t) => ({ ...t })) }))
    setEdit(f)
    setName(f.name)
    setDescription(f.description)
    setUnit(f.unit)
    setUnitPrice(f.unitPrice)
    setMaterialIds(f.materialIds?.length ? f.materialIds : list.flatMap((r) => r.items.map((i) => i.materialId)))
    setRecipes(list)
    setActiveRecipeId(f.defaultRecipeId || list.find((r) => r.isDefault)?.id || list[0]?.id || '')
    setOpen(true)
  }

  const toggleMaterial = (id: string) => {
    setMaterialIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  const updateActiveExpression = (expression: FormulaExprToken[]) => {
    if (!activeRecipe) return
    const items = itemsFromExpression(expression)
    setRecipes((prev) =>
      prev.map((r) =>
        r.id === activeRecipe.id ? { ...r, expression, items } : r,
      ),
    )
  }

  const addRecipe = () => {
    const label = newRecipeLabel.trim() || `Công thức ${recipes.length + 1}`
    const id = uid()
    setRecipes((p) => [...p, { id, label, isDefault: false, expression: [], items: [], createdAt: Date.now(), createdBy: profile?.id }])
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
    if (materialIds.length === 0) {
      onMsg('Chọn ít nhất một vật liệu thành phần.')
      return
    }
    const defaultRecipe = recipes.find((r) => r.isDefault) || recipes[0]
    const items = defaultRecipe ? itemsFromExpression(defaultRecipe.expression) : []
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
      onMsg('Đã cập nhật thành phẩm.')
    } else {
      await createFormula({ ...data, history: [], active: true, createdAt: Date.now() })
      onMsg('Đã thêm thành phẩm.')
    }
    setOpen(false)
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        {writable && (
          <Button onClick={openNew}>
            <Plus size={16} /> Thêm thành phẩm
          </Button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {formulas.map((f) => {
          const recipesList = getProductRecipes(f)
          const def = getDefaultRecipe(f)
          return (
            <Bento key={f.id} title={f.name} subtitle={`${formatMoney(f.unitPrice)} / ${f.unit}`}>
              <p className="mb-2 text-xs text-muted">{f.description || '—'}</p>
              <div className="flex flex-wrap gap-1">
                {recipesList.map((r) => (
                  <Badge key={r.id} tone={r.id === def.id ? 'accent' : 'ok'}>
                    {r.isDefault && <Star size={10} className="mr-1 inline" />}
                    {r.label}
                  </Badge>
                ))}
              </div>
              <div className="mt-2 space-y-1">
                {def.items.map((i) => (
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
                      if (!confirm(`Xoá thành phẩm ${f.name}?`)) return
                      await deleteFormula(f.id)
                      onMsg('Đã xoá thành phẩm.')
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
      {formulas.length === 0 && <Empty text="Thêm thành phẩm (vd: bê tông nhựa C13)." />}

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Chỉnh sửa thành phẩm' : 'Thêm thành phẩm'} wide>
        <form className="space-y-4" onSubmit={save}>
          <Input label="Tên thành phẩm" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Đơn vị thành phẩm" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
            <MoneyInput label="Đơn giá mặc định" value={unitPrice} onChange={setUnitPrice} disabled={!writable} />
          </div>

          <div className="rounded-2xl border border-line bg-surface/40 p-3">
            <p className="mb-2 text-sm font-semibold">Vật liệu thành phần (đơn vị tương đương)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {materials.filter((m) => m.active).map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={materialIds.includes(m.id)}
                    onChange={() => toggleMaterial(m.id)}
                  />
                  <span className="font-medium">{m.name}</span>
                  <span className="ml-auto text-xs text-muted">{m.unit}</span>
                </label>
              ))}
            </div>
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
                  materialIds={materialIds}
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

          <Button type="submit" className="w-full">Lưu thành phẩm</Button>
        </form>
      </Modal>
    </>
  )
}
