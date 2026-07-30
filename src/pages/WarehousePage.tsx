import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Bento, Badge, Button, Empty, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import {
  addStockEntry,
  updateMaterial,
  watchMaterials,
  watchStockEntries,
  watchUsers,
} from '@/lib/store'
import type { Material, StockEntry, WeightUnit } from '@/types'
import { allWeightUnits, canWrite } from '@/types'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/utils'

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
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<StockRow[]>([newRow()])
  const [batchLabel, setBatchLabel] = useState('')
  const [contractor, setContractor] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [historyMat, setHistoryMat] = useState<Material | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [editMat, setEditMat] = useState<Material | null>(null)
  const [editName, setEditName] = useState('')
  const [editStock, setEditStock] = useState('')
  const [editUnit, setEditUnit] = useState<WeightUnit>('Tấn')
  const [editBusy, setEditBusy] = useState(false)

  useEffect(() => {
    const u1 = watchMaterials(setMaterials)
    const u2 = watchStockEntries(setEntries)
    const u3 = watchUsers((users) => {
      const map: Record<string, string> = {}
      users.forEach((u) => { map[u.id] = u.displayName })
      setUserNames(map)
    })
    return () => { u1(); u2(); u3() }
  }, [])

  const active = materials.filter((m) => m.active)
  const unitOptions = allWeightUnits()

  const importSummary = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; totalIn: number; totalOut: number; count: number }>()
    for (const e of entries) {
      const cur = map.get(e.materialId) || { name: e.materialName, unit: e.unit, totalIn: 0, totalOut: 0, count: 0 }
      if (e.type === 'export') cur.totalOut += e.quantity
      else cur.totalIn += e.quantity
      cur.count += 1
      map.set(e.materialId, cur)
    }
    return [...map.values()]
  }, [entries])

  const filteredHistory = useMemo(() => {
    if (!historyMat) return []
    let list = entries.filter((e) => e.materialId === historyMat.id)
    if (dateFrom) {
      const from = new Date(dateFrom).setHours(0, 0, 0, 0)
      list = list.filter((e) => e.createdAt >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo).setHours(23, 59, 59, 999)
      list = list.filter((e) => e.createdAt <= to)
    }
    return list
  }, [entries, historyMat, dateFrom, dateTo])

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
      const stockMap = new Map(materials.map((m) => [m.id, m.stock]))
      const batch = batchLabel.trim() || `Đợt ${formatDate(Date.now())}`
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
            createdByName: profile?.displayName || '',
            type: 'import',
            batchLabel: batch,
          },
          currentStock,
        )
        stockMap.set(mat.id, currentStock + qty)
      }
      setOpen(false)
      setRows([newRow()])
      setBatchLabel('')
      setContractor('')
      setNote('')
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
        subtitle="Tất cả vật liệu"
        action={writable ? (
          <Button onClick={() => { setRows([newRow()]); setOpen(true) }}>
            <Plus size={18} /> Nhập kho
          </Button>
        ) : undefined}
      />

      {active.length === 0 ? (
        <Empty text="Chưa có vật liệu. Vào Cài đặt → Vật liệu để thêm." />
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {active.map((m) => {
            const low = m.stock <= m.lowStockAlert
            const summary = importSummary.find((s) => s.name === m.name)
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => setHistoryMat(m)}
                className={`bento block w-full p-4 text-left animate-fade-up sm:p-5 ${low ? 'border-danger/40 bg-red-50/60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-sm font-bold leading-tight sm:text-base">{m.name}</p>
                  {low && <Badge tone="danger">Thấp</Badge>}
                </div>
                <p className="num mt-3 text-3xl font-extrabold text-ink sm:text-4xl">{formatNumber(m.stock)}</p>
                <p className="mt-1 text-sm font-semibold text-accent">{m.unit}</p>
                {summary && (
                  <p className="mt-2 text-xs text-muted">
                    Nhập: {formatNumber(summary.totalIn)} · Xuất: {formatNumber(summary.totalOut)}
                  </p>
                )}
                <p className="mt-2 text-xs text-accent">Chạm để xem lộ trình nhập/xuất</p>
                {writable && (
                  <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => { setEditMat(m); setEditName(m.name); setEditStock(String(m.stock)); setEditUnit(m.unit) }}>
                      Sửa
                    </Button>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      <Bento title="Tổng kết nhập kho theo loại" className="mt-4" subtitle="Tổng nhập · tổng xuất · số phiếu">
        {importSummary.length === 0 ? (
          <Empty text="Chưa có dữ liệu nhập/xuất." />
        ) : (
          <div className="space-y-2">
            {importSummary.map((s) => (
              <div key={s.name + s.unit} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface/70 px-3 py-2">
                <span className="font-semibold">{s.name} <span className="text-muted">({s.unit})</span></span>
                <div className="flex gap-3 text-sm">
                  <span className="text-ok">+{formatNumber(s.totalIn)}</span>
                  <span className="text-warn">−{formatNumber(s.totalOut)}</span>
                  <span className="text-muted">{s.count} phiếu</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Bento>

      <Bento title="Phiếu nhập gần đây" className="mt-4" subtitle="Theo đợt · người nhập · thời gian · ghi chú">
        {entries.filter((e) => e.type !== 'export').length === 0 ? (
          <Empty text="Chưa có phiếu nhập kho." />
        ) : (
          <div className="space-y-2">
            {entries.filter((e) => e.type !== 'export').slice(0, 30).map((e) => (
              <div key={e.id} className="rounded-2xl bg-surface/70 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{e.materialName}</p>
                    {e.batchLabel && <p className="text-xs text-accent">{e.batchLabel}</p>}
                  </div>
                  <p className="num font-bold text-ok">+{formatNumber(e.quantity)} {e.unit}</p>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{formatDateTime(e.createdAt)}</span>
                  <span>Người nhập: {e.createdByName || userNames[e.createdBy] || '—'}</span>
                  <span>Chi phí: {formatMoney(e.cost)}</span>
                  {e.contractor && <span>NCC: {e.contractor}</span>}
                  {e.note && <span>Ghi chú: {e.note}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Bento>

      <Modal open={open} onClose={() => setOpen(false)} title="Nhập kho vật liệu" wide>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input label="Tên đợt nhập" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder={`Đợt ${formatDate(Date.now())}`} />
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.key} className="rounded-2xl border border-line/70 bg-surface/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Vật liệu {idx + 1}</p>
                  {rows.length > 1 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRows((p) => p.filter((r) => r.key !== row.key))}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select label="Vật liệu" value={row.materialId} onChange={(e) => setRows((p) => p.map((r) => r.key === row.key ? { ...r, materialId: e.target.value } : r))} required>
                    <option value="">— Chọn —</option>
                    {active.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                  </Select>
                  <Input label="Số lượng" type="number" step="any" min="0" value={row.quantity} onChange={(e) => setRows((p) => p.map((r) => r.key === row.key ? { ...r, quantity: e.target.value } : r))} required />
                  <Input label="Chi phí (vnđ)" type="number" step="any" min="0" value={row.cost} onChange={(e) => setRows((p) => p.map((r) => r.key === row.key ? { ...r, cost: e.target.value } : r))} />
                </div>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={() => setRows((p) => [...p, newRow()])}>
            <Plus size={16} /> Thêm vật liệu tiếp theo
          </Button>
          <Input label="Nhà cung cấp / Nhà thầu" value={contractor} onChange={(e) => setContractor(e.target.value)} />
          <Textarea label="Ghi chú đợt nhập" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi rõ nội dung, biên bản, vị trí kho…" />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu phiếu nhập'}</Button>
        </form>
      </Modal>

      <Modal open={!!historyMat} onClose={() => setHistoryMat(null)} title={historyMat ? `Lộ trình: ${historyMat.name}` : ''} wide>
        {historyMat && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input label="Từ ngày" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input label="Đến ngày" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <p className="text-sm text-muted">
              Tồn hiện tại: <strong className="num">{formatNumber(historyMat.stock)} {historyMat.unit}</strong>
            </p>
            {filteredHistory.length === 0 ? (
              <Empty text="Không có phiếu trong khoảng thời gian này." />
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {filteredHistory.map((e) => {
                  const isExport = e.type === 'export'
                  return (
                    <div key={e.id} className={`rounded-xl px-3 py-3 ${isExport ? 'bg-red-50/80' : 'bg-green-50/80'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isExport ? <ArrowUpRight size={16} className="text-warn" /> : <ArrowDownLeft size={16} className="text-ok" />}
                          <span className="font-semibold">{isExport ? 'Xuất kho' : 'Nhập kho'}</span>
                          {e.batchLabel && <Badge tone="accent">{e.batchLabel}</Badge>}
                        </div>
                        <span className={`num font-bold ${isExport ? 'text-warn' : 'text-ok'}`}>
                          {isExport ? '−' : '+'}{formatNumber(e.quantity)} {e.unit}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {formatDateTime(e.createdAt)}
                        {e.createdByName && ` · ${e.createdByName}`}
                        {e.orderCode && ` · Đơn ${e.orderCode}`}
                        {e.note && ` · ${e.note}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!editMat} onClose={() => setEditMat(null)} title="Sửa vật liệu trong kho">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          if (!editMat || !writable) return
          setEditBusy(true)
          try {
            await updateMaterial(editMat.id, { name: editName.trim(), stock: Number(editStock) || 0, unit: editUnit, updatedAt: Date.now() })
            setEditMat(null)
          } finally { setEditBusy(false) }
        }}>
          <Input label="Tên vật liệu" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          <Input label="Số lượng tồn" type="number" step="any" value={editStock} onChange={(e) => setEditStock(e.target.value)} required />
          <Select label="Đơn vị" value={editUnit} onChange={(e) => setEditUnit(e.target.value)}>
            {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          <Button type="submit" className="w-full" disabled={editBusy}>{editBusy ? 'Đang lưu…' : 'Lưu'}</Button>
        </form>
      </Modal>
    </div>
  )
}
