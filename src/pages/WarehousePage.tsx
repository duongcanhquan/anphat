import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Bento, Badge, Button, Empty, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { addStockEntry, updateMaterial, watchMaterials, watchStockEntries } from '@/lib/store'
import type { Material, StockEntry, WeightUnit } from '@/types'
import { WEIGHT_UNITS, canWrite } from '@/types'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils'

type StockRow = {
  key: string
  materialId: string
  quantity: string
  cost: string
}

function newRow(): StockRow {
  return { key: `${Date.now()}-${Math.random()}`, materialId: '', quantity: '', cost: '' }
}

export function WarehousePage() {
  const { profile } = useAuth()
  const writable = canWrite(profile?.role)
  const [materials, setMaterials] = useState<Material[]>([])
  const [entries, setEntries] = useState<StockEntry[]>([])
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<StockRow[]>([newRow()])
  const [contractor, setContractor] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [editMat, setEditMat] = useState<Material | null>(null)
  const [editName, setEditName] = useState('')
  const [editStock, setEditStock] = useState('')
  const [editUnit, setEditUnit] = useState<WeightUnit>('TẤN')
  const [editBusy, setEditBusy] = useState(false)

  useEffect(() => {
    const u1 = watchMaterials(setMaterials)
    const u2 = watchStockEntries(setEntries)
    return () => {
      u1()
      u2()
    }
  }, [])

  const active = materials.filter((m) => m.active)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const prepared = rows
      .map((r) => {
        const mat = materials.find((m) => m.id === r.materialId)
        const qty = Number(r.quantity)
        const costNum = Number(r.cost) || 0
        return mat && qty > 0 ? { mat, qty, costNum } : null
      })
      .filter((x): x is { mat: Material; qty: number; costNum: number } => !!x)

    if (prepared.length === 0) {
      setError('Thêm ít nhất một vật liệu với số lượng > 0')
      return
    }

    setBusy(true)
    try {
      // Cập nhật tuần tự để avgCost/stock đúng khi cùng vật liệu nhiều dòng
      const stockMap = new Map(materials.map((m) => [m.id, m.stock]))
      for (const { mat, qty, costNum } of prepared) {
        const currentStock = stockMap.get(mat.id) ?? mat.stock
        await addStockEntry(
          {
            materialId: mat.id,
            materialName: mat.name,
            quantity: qty,
            unit: mat.unit,
            cost: costNum,
            contractor: contractor.trim(),
            note: note.trim(),
            createdAt: Date.now(),
            createdBy: profile?.id || '',
          },
          currentStock,
        )
        stockMap.set(mat.id, currentStock + qty)
      }
      setOpen(false)
      setRows([newRow()])
      setContractor('')
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi nhập kho')
    } finally {
      setBusy(false)
    }
  }

  const openEdit = (m: Material) => {
    setEditMat(m)
    setEditName(m.name)
    setEditStock(String(m.stock))
    setEditUnit(m.unit)
  }

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editMat || !writable) return
    setEditBusy(true)
    try {
      await updateMaterial(editMat.id, {
        name: editName.trim(),
        stock: Number(editStock) || 0,
        unit: editUnit,
        updatedAt: Date.now(),
      })
      setEditMat(null)
    } finally {
      setEditBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Kho vật liệu"
        subtitle="Tất cả vật liệu"
        action={
          writable ? (
            <Button onClick={() => { setRows([newRow()]); setOpen(true) }}>
              <Plus size={18} /> Nhập kho
            </Button>
          ) : undefined
        }
      />

      {active.length === 0 ? (
        <Empty text="Chưa có vật liệu. Vào Cài đặt → Vật liệu nhập để thêm." />
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {active.map((m) => {
            const low = m.stock <= m.lowStockAlert
            return (
              <Bento
                key={m.id}
                className={low ? 'border-danger/40 bg-red-50/60' : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-sm font-bold leading-tight sm:text-base">{m.name}</p>
                  {low && <Badge tone="danger">Thấp</Badge>}
                </div>
                <p className="num mt-3 text-3xl font-extrabold text-ink sm:text-4xl">
                  {formatNumber(m.stock)}
                </p>
                <p className="mt-1 text-sm font-semibold text-accent">{m.unit}</p>
                {m.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted">{m.description}</p>
                )}
                <p className="mt-3 text-xs text-muted">
                  Giá TB: {formatMoney(m.avgCost)}/{m.unit}
                </p>
                {writable && (
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={() => openEdit(m)}>
                      Sửa tên / số lượng
                    </Button>
                  </div>
                )}
              </Bento>
            )
          })}
        </div>
      )}

      <Bento title="Phiếu nhập gần đây" className="mt-4" subtitle="Số lượng · chi phí · nhà thầu · thời gian">
        {entries.length === 0 ? (
          <Empty text="Chưa có phiếu nhập kho." />
        ) : (
          <div className="space-y-2">
            {entries.slice(0, 30).map((e) => (
              <div key={e.id} className="rounded-2xl bg-surface/70 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{e.materialName}</p>
                  <p className="num font-bold text-accent">
                    +{formatNumber(e.quantity)} {e.unit}
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{formatDateTime(e.createdAt)}</span>
                  <span>Chi phí: {formatMoney(e.cost)}</span>
                  {e.contractor && <span>Nhà thầu: {e.contractor}</span>}
                  {e.note && <span>{e.note}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Bento>

      <Modal open={open} onClose={() => setOpen(false)} title="Nhập kho vật liệu" wide>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.key} className="rounded-2xl border border-line/70 bg-surface/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Vật liệu {idx + 1}</p>
                  {rows.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRows((p) => p.filter((r) => r.key !== row.key))}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select
                    label="Vật liệu"
                    value={row.materialId}
                    onChange={(e) =>
                      setRows((p) =>
                        p.map((r) => (r.key === row.key ? { ...r, materialId: e.target.value } : r)),
                      )
                    }
                    required
                  >
                    <option value="">— Chọn —</option>
                    {active.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.unit})
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Số lượng / khối lượng"
                    type="number"
                    step="any"
                    min="0"
                    value={row.quantity}
                    onChange={(e) =>
                      setRows((p) =>
                        p.map((r) => (r.key === row.key ? { ...r, quantity: e.target.value } : r)),
                      )
                    }
                    required
                  />
                  <Input
                    label="Chi phí nhập (₫)"
                    type="number"
                    step="any"
                    min="0"
                    value={row.cost}
                    onChange={(e) =>
                      setRows((p) =>
                        p.map((r) => (r.key === row.key ? { ...r, cost: e.target.value } : r)),
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={() => setRows((p) => [...p, newRow()])}>
            <Plus size={16} /> Thêm vật liệu tiếp theo
          </Button>

          <Input
            label="Nhà thầu / Nhà cung cấp"
            value={contractor}
            onChange={(e) => setContractor(e.target.value)}
          />
          <Textarea label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu phiếu nhập'}
          </Button>
        </form>
      </Modal>

      <Modal open={!!editMat} onClose={() => setEditMat(null)} title="Sửa vật liệu trong kho">
        <form className="space-y-3" onSubmit={saveEdit}>
          <Input label="Tên vật liệu" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          <Input
            label="Số lượng / khối lượng tồn"
            type="number"
            step="any"
            value={editStock}
            onChange={(e) => setEditStock(e.target.value)}
            required
          />
          <Select label="Đơn vị" value={editUnit} onChange={(e) => setEditUnit(e.target.value as WeightUnit)}>
            {WEIGHT_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
          <Button type="submit" className="w-full" disabled={editBusy}>
            {editBusy ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
