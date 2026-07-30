import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Bento, Badge, Button, Empty, Input, Modal, PageHeader, Select, Tabs, Textarea } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import {
  addStockEntry,
  updateMaterial,
  watchConversions,
  watchMaterials,
  watchStockEntries,
  watchUsers,
} from '@/lib/store'
import type { Conversion, Material, StockEntry, WeightUnit } from '@/types'
import { allWeightUnits, canWrite } from '@/types'
import { stockDualUnits } from '@/components/FormulaBuilder'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/utils'

type WarehouseTab = 'kho' | 'tong-ket' | 'lich-su'

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
  const [tab, setTab] = useState<WarehouseTab>('kho')
  const [materials, setMaterials] = useState<Material[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
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
  const [historyFilter, setHistoryFilter] = useState<'all' | 'import' | 'export'>('all')

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
    const u4 = watchConversions(setConversions)
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  const active = materials.filter((m) => m.active)
  const unitOptions = allWeightUnits()

  const importSummary = useMemo(() => {
    const map = new Map<string, { id: string; name: string; unit: string; totalIn: number; totalOut: number; count: number }>()
    for (const e of entries) {
      const cur = map.get(e.materialId) || {
        id: e.materialId,
        name: e.materialName,
        unit: e.unit,
        totalIn: 0,
        totalOut: 0,
        count: 0,
      }
      if (e.type === 'export') cur.totalOut += e.quantity
      else cur.totalIn += e.quantity
      cur.count += 1
      map.set(e.materialId, cur)
    }
    return [...map.values()]
  }, [entries])

  const filteredHistory = useMemo(() => {
    let list = historyMat
      ? entries.filter((e) => e.materialId === historyMat.id)
      : [...entries]
    if (historyFilter === 'import') list = list.filter((e) => e.type !== 'export')
    if (historyFilter === 'export') list = list.filter((e) => e.type === 'export')
    if (dateFrom) {
      const from = new Date(dateFrom).setHours(0, 0, 0, 0)
      list = list.filter((e) => e.createdAt >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo).setHours(23, 59, 59, 999)
      list = list.filter((e) => e.createdAt <= to)
    }
    return list
  }, [entries, historyMat, dateFrom, dateTo, historyFilter])

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
        subtitle="Tồn kho · tổng kết · lịch sử nhập xuất"
        action={writable && tab === 'kho' ? (
          <Button onClick={() => { setRows([newRow()]); setOpen(true) }}>
            <Plus size={18} /> Nhập kho
          </Button>
        ) : undefined}
      />

      <Tabs
        tabs={[
          { id: 'kho', label: 'Kho' },
          { id: 'tong-ket', label: 'Tổng kết kho' },
          { id: 'lich-su', label: 'Lịch sử nhập xuất' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as WarehouseTab)}
      />

      {tab === 'kho' && (
        <>
          {active.length === 0 ? (
            <Empty text="Chưa có vật liệu. Vào Cài đặt → Vật liệu để thêm." />
          ) : (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {active.map((m) => {
                const low = m.stock <= m.lowStockAlert
                const dual = stockDualUnits(m, conversions)
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => { setHistoryMat(m); setTab('lich-su') }}
                    className={`bento block w-full p-4 text-left animate-fade-up sm:p-5 ${low ? 'border-danger/40 bg-red-50/60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-sm font-bold leading-tight sm:text-base">{m.name}</p>
                      {low && <Badge tone="danger">Thấp</Badge>}
                    </div>
                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tồn (đơn vị nhập)</p>
                        <p className="num text-2xl font-extrabold text-ink sm:text-3xl">
                          {formatNumber(dual.inputQty)}{' '}
                          <span className="text-base font-semibold text-accent">{dual.inputUnit}</span>
                        </p>
                      </div>
                      {dual.convertedQty != null && dual.convertedUnit && (
                        <div className="rounded-xl bg-surface/80 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tồn (đơn vị quy đổi)</p>
                          <p className="num text-lg font-extrabold text-ink">
                            {formatNumber(dual.convertedQty)}{' '}
                            <span className="text-sm font-semibold text-accent">{dual.convertedUnit}</span>
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-accent">Chạm → lịch sử vật liệu</p>
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
        </>
      )}

      {tab === 'tong-ket' && (
        <Bento title="Tổng kết kho theo loại" subtitle="Tổng nhập · tổng xuất · tồn hiện tại">
          {importSummary.length === 0 && active.length === 0 ? (
            <Empty text="Chưa có dữ liệu nhập/xuất." />
          ) : (
            <div className="space-y-2">
              {active.map((m) => {
                const s = importSummary.find((x) => x.id === m.id)
                const dual = stockDualUnits(m, conversions)
                return (
                  <div key={m.id} className="rounded-xl bg-surface/70 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{m.name}</span>
                      <span className="num font-bold">
                        Tồn: {formatNumber(dual.inputQty)} {dual.inputUnit}
                        {dual.convertedQty != null && dual.convertedUnit && (
                          <span className="ml-2 text-sm font-semibold text-accent">
                            ≈ {formatNumber(dual.convertedQty)} {dual.convertedUnit}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm">
                      <span className="text-ok">Nhập: +{formatNumber(s?.totalIn || 0)} {m.unit}</span>
                      <span className="text-warn">Xuất: −{formatNumber(s?.totalOut || 0)} {m.unit}</span>
                      <span className="text-muted">{s?.count || 0} phiếu</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Bento>
      )}

      {tab === 'lich-su' && (
        <div className="space-y-3">
          <Bento title="Bộ lọc lịch sử">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                label="Vật liệu"
                value={historyMat?.id || ''}
                onChange={(e) => setHistoryMat(active.find((m) => m.id === e.target.value) || null)}
              >
                <option value="">— Tất cả —</option>
                {active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
              <Select label="Loại" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as 'all' | 'import' | 'export')}>
                <option value="all">Tất cả</option>
                <option value="import">Chỉ nhập</option>
                <option value="export">Chỉ xuất</option>
              </Select>
              <Input label="Từ ngày" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input label="Đến ngày" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </Bento>

          <Bento title="Lịch sử nhập xuất" subtitle={`${filteredHistory.length} phiếu`}>
            {filteredHistory.length === 0 ? (
              <Empty text="Không có phiếu trong bộ lọc này." />
            ) : (
              <div className="space-y-2">
                {filteredHistory.slice(0, 80).map((e) => {
                  const isExport = e.type === 'export'
                  return (
                    <div key={e.id} className={`rounded-xl px-3 py-3 ${isExport ? 'bg-red-50/80' : 'bg-green-50/80'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          {isExport ? <ArrowUpRight size={16} className="text-warn" /> : <ArrowDownLeft size={16} className="text-ok" />}
                          <span className="font-semibold">{isExport ? 'Xuất' : 'Nhập'}</span>
                          <span className="font-medium">{e.materialName}</span>
                          {e.batchLabel && <Badge tone="accent">{e.batchLabel}</Badge>}
                        </div>
                        <span className={`num shrink-0 font-bold ${isExport ? 'text-warn' : 'text-ok'}`}>
                          {isExport ? '−' : '+'}{formatNumber(e.quantity)} {e.unit}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {formatDateTime(e.createdAt)}
                        {` · ${e.createdByName || userNames[e.createdBy] || '—'}`}
                        {e.orderCode && ` · Đơn ${e.orderCode}`}
                        {!isExport && ` · Chi phí ${formatMoney(e.cost)}`}
                        {e.contractor && ` · NCC: ${e.contractor}`}
                        {e.note && ` · ${e.note}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Bento>
        </div>
      )}

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
          <Textarea label="Ghi chú đợt nhập" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu phiếu nhập'}</Button>
        </form>
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
