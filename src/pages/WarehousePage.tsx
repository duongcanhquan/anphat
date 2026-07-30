import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Bento, Badge, Button, Empty, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { addStockEntry, watchMaterials, watchStockEntries } from '@/lib/store'
import type { Material, StockEntry } from '@/types'
import { canWrite } from '@/types'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils'

export function WarehousePage() {
  const { profile } = useAuth()
  const writable = canWrite(profile?.role)
  const [materials, setMaterials] = useState<Material[]>([])
  const [entries, setEntries] = useState<StockEntry[]>([])
  const [open, setOpen] = useState(false)
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [cost, setCost] = useState('')
  const [contractor, setContractor] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
    const mat = materials.find((m) => m.id === materialId)
    if (!mat) {
      setError('Chọn vật liệu')
      return
    }
    const qty = Number(quantity)
    const costNum = Number(cost)
    if (!(qty > 0)) {
      setError('Số lượng phải > 0')
      return
    }
    setBusy(true)
    try {
      await addStockEntry(
        {
          materialId: mat.id,
          materialName: mat.name,
          quantity: qty,
          unit: mat.unit,
          cost: costNum || 0,
          contractor: contractor.trim(),
          note: note.trim(),
          createdAt: Date.now(),
          createdBy: profile?.id || '',
        },
        mat.stock,
      )
      setOpen(false)
      setQuantity('')
      setCost('')
      setContractor('')
      setNote('')
      setMaterialId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi nhập kho')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Kho vật liệu"
        subtitle="Tất cả vật liệu trên một màn — nhìn là hiểu"
        action={
          writable ? (
            <Button onClick={() => setOpen(true)}>
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

      <Modal open={open} onClose={() => setOpen(false)} title="Nhập kho vật liệu">
        <form className="space-y-3" onSubmit={onSubmit}>
          <Select label="Vật liệu" value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
            <option value="">— Chọn —</option>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </Select>
          <Input
            label="Số lượng"
            type="number"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          <Input
            label="Chi phí nhập (₫)"
            type="number"
            step="any"
            min="0"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
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
    </div>
  )
}
