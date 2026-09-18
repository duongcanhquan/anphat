import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Camera, Keyboard } from 'lucide-react'
import { Button, DateField, Empty, Input, SearchableSelect, Select, StatBig, Textarea } from '@/components/ui'
import { MoneyInput } from '@/components/MoneyInput'
import { useAuth } from '@/contexts/AuthContext'
import { createFuelReading, generateFuelCode, watchFuelReadings, watchMaterials, watchStockEntries } from '@/lib/store'
import { compressPumpPhoto, photoUploadEnabled, photoViewUrl, uploadPumpPhoto } from '@/lib/photo'
import { isDieselLikeName, parsePumpReading } from '@/lib/pumpOcr'
import type { FuelReading, Material, StockEntry } from '@/types'
import { canWrite } from '@/types'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  fromDateInputValue,
  getPeriodRange,
  toDateInputValue,
  type PeriodType,
} from '@/lib/utils'
import { localDayEnd, localDayStart } from '@/lib/dateInput'

async function ocrImage(blob: Blob): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { logger: () => undefined })
  try {
    const { data } = await worker.recognize(blob)
    return data.text || ''
  } finally {
    await worker.terminate()
  }
}

export function FuelPanel() {
  const { profile, firebaseUser } = useAuth()
  const writable = canWrite(profile?.role)
  const [materials, setMaterials] = useState<Material[]>([])
  const [rows, setRows] = useState<FuelReading[]>([])
  const [mode, setMode] = useState<'photo' | 'manual'>('photo')
  const [materialId, setMaterialId] = useState('')
  const [qty, setQty] = useState('')
  const [unitPrice, setUnitPrice] = useState(0)
  const [pumpedAt, setPumpedAt] = useState(toDateInputValue(Date.now()))
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<string>('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [ocrHint, setOcrHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [lineId, setLineId] = useState('')
  const [dateField, setDateField] = useState<'createdAt' | 'pumpedAt'>('createdAt')
  const [entries, setEntries] = useState<StockEntry[]>([])
  const inflight = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const previewUrl = useRef<string>('')

  useEffect(() => {
    const u1 = watchMaterials(setMaterials)
    const u2 = watchFuelReadings(setRows)
    const u3 = watchStockEntries(setEntries)
    return () => { u1(); u2(); u3() }
  }, [])

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
  }, [])

  const diesels = useMemo(() => {
    const active = materials.filter((m) => m.active)
    const liked = active.filter((m) => isDieselLikeName(m.name))
    return liked.length ? liked : active
  }, [materials])

  useEffect(() => {
    if (!materialId && diesels[0]) setMaterialId(diesels[0].id)
  }, [diesels, materialId])

  const mat = materials.find((m) => m.id === materialId)
  const range = useMemo(() => {
    const start = from ? localDayStart(from) : 0
    const end = to ? localDayEnd(to) : Number.MAX_SAFE_INTEGER
    return { start, end }
  }, [from, to])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (lineId && r.materialId !== lineId) return false
      const at = dateField === 'pumpedAt' ? r.pumpedAt : r.createdAt
      return at >= range.start && at <= range.end
    })
  }, [rows, lineId, dateField, range])

  const periodQty = filtered.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
  const periodDeducted = filtered.reduce((s, r) => s + (Number(r.deductedQuantity ?? r.quantity) || 0), 0)
  const stock = Number(mat?.stock) || 0
  const compareMat = materials.find((m) => m.id === (lineId || materialId)) || mat
  const compareStock = Number(compareMat?.stock) || 0

  const applyPeriod = (type: PeriodType) => {
    const { from: a, to: b } = getPeriodRange(type)
    setFrom(toDateInputValue(a))
    setTo(toDateInputValue(b))
  }

  const lineCompare = useMemo(() => {
    return diesels
      .filter((m) => !lineId || m.id === lineId)
      .map((m) => {
        const readings = filtered.filter((r) => r.materialId === m.id)
        const pumped = readings.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
        const deducted = readings.reduce((s, r) => s + (Number(r.deductedQuantity ?? r.quantity) || 0), 0)
        const warehouseOut = entries
          .filter((e) => {
            if (e.materialId !== m.id || e.type !== 'export') return false
            return e.createdAt >= range.start && e.createdAt <= range.end
          })
          .reduce((s, e) => s + (Number(e.quantity) || 0), 0)
        return { m, pumped, deducted, warehouseOut, stock: Number(m.stock) || 0 }
      })
  }, [diesels, filtered, entries, range, lineId])

  const onPickFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setMsg('')
    try {
      const blob = await compressPumpPhoto(file)
      setPhotoBlob(blob)
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = URL.createObjectURL(blob)
      setPreview(previewUrl.current)
      const text = await ocrImage(blob)
      const parsed = parsePumpReading(text)
      if (parsed.liters) setQty(String(parsed.liters))
      if (parsed.unitPrice) setUnitPrice(parsed.unitPrice)
      setOcrHint(
        parsed.liters
          ? `Đọc Số ≈ ${parsed.liters} lít${parsed.checkOk ? ' (khớp Tổng÷ĐG)' : ''} · ${parsed.confidence}`
          : 'Không đọc được Số — nhập tay.',
      )
    } catch (err) {
      setOcrHint(err instanceof Error ? err.message : 'Không đọc được ảnh.')
    } finally {
      setBusy(false)
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable || !profile || inflight.current) return
    const n = Number(qty)
    if (!(n > 0) || !mat) {
      setMsg('Chọn dầu và nhập số lít > 0.')
      return
    }
    inflight.current = true
    setBusy(true)
    setMsg('')
    try {
      let photoKey = ''
      let photoUrl = ''
      if (photoBlob && photoUploadEnabled() && firebaseUser) {
        const token = await firebaseUser.getIdToken()
        const up = await uploadPumpPhoto(photoBlob, token)
        photoKey = up.key
        photoUrl = up.url
      } else if (photoBlob && !photoUploadEnabled()) {
        setOcrHint((h) => (h ? h + ' ' : '') + 'Ảnh chưa đưa lên R2 — vẫn trừ kho theo số đã xác nhận.')
      }
      const short = n > stock
      await createFuelReading({
        code: generateFuelCode(),
        materialId: mat.id,
        materialName: mat.name,
        quantity: n,
        unit: mat.unit || 'Lít',
        unitPrice: unitPrice || undefined,
        totalAmount: unitPrice ? Math.round(n * unitPrice) : undefined,
        photoKey: photoKey || undefined,
        photoUrl: photoUrl || undefined,
        ocrRaw: ocrHint || undefined,
        source: mode,
        checkOk: ocrHint.includes('khớp'),
        note: note.trim(),
        pumpedAt: fromDateInputValue(pumpedAt),
        createdAt: Date.now(),
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      setQty('')
      setNote('')
      setPhotoBlob(null)
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = ''
      setPreview('')
      setOcrHint('')
      setMsg(
        short
          ? `Đã ghi ${formatNumber(n)} ${mat.unit}. Tồn chỉ ${formatNumber(stock)} — trừ hết tồn, không âm.`
          : `Đã trừ kho ${formatNumber(n)} ${mat.unit}.`,
      )
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Không ghi được lần đổ dầu.')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm font-medium text-info">{msg}</p>}

      {writable && (
        <form className="bento space-y-3 p-4" onSubmit={(e) => void save(e)}>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === 'photo' ? 'primary' : 'outline'} onClick={() => setMode('photo')}>
              <Camera size={16} /> Chụp đồng hồ
            </Button>
            <Button type="button" size="sm" variant={mode === 'manual' ? 'primary' : 'outline'} onClick={() => setMode('manual')}>
              <Keyboard size={16} /> Nhập tay
            </Button>
          </div>

          {mode === 'photo' && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
              <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? 'Đang đọc số…' : 'Chụp / chọn ảnh cây xăng'}
              </Button>
              <p className="mt-1 text-xs text-muted">
                Chụp thẳng mặt đồng hồ. Hệ thống lấy dòng <strong>Số</strong> (lít), bạn xác nhận rồi mới trừ kho.
                {!photoUploadEnabled() && ' Ảnh lưu R2 khi đã deploy Worker (VITE_PHOTO_WORKER_URL).'}
              </p>
              {preview && (
                <img src={preview} alt="Đồng hồ" className="mt-2 max-h-56 rounded-xl border border-line object-contain" />
              )}
              {ocrHint && <p className="mt-1 text-sm text-warn">{ocrHint}</p>}
            </div>
          )}

          <SearchableSelect
            label="Vật liệu (diesel)"
            value={materialId}
            onChange={setMaterialId}
            options={diesels.map((m) => ({
              value: m.id,
              label: m.name,
              hint: `Tồn ${formatNumber(m.stock)} ${m.unit}`,
            }))}
            placeholder="— Chọn dầu —"
          />
          {mat && (
            <p className="text-sm">
              Tồn hiện tại: <strong className="num">{formatNumber(stock)} {mat.unit}</strong>
              {Number(qty) > stock && stock >= 0 ? (
                <span className="text-warn"> · Số lớn hơn tồn — sẽ trừ hết tồn, không âm.</span>
              ) : null}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input label="Số (lít) — xác nhận" type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
            <MoneyInput label="Đơn giá (nếu đọc được)" value={unitPrice} onChange={setUnitPrice} />
          </div>
          <DateField label="Thời điểm đổ" value={pumpedAt} onChange={setPumpedAt} required />
          <Textarea label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Xe, ca, cây xăng nội bộ…" />
          <Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận trừ kho'}</Button>
        </form>
      )}

      <div className="bento space-y-3 p-4">
        <p className="font-semibold">Lịch sử · số lượng · so sánh kho</p>
        <div className="flex flex-wrap gap-2">
          {([
            ['day', 'Ngày'],
            ['week', 'Tuần'],
            ['month', 'Tháng'],
            ['year', 'Năm'],
          ] as const).map(([id, label]) => (
            <Button key={id} type="button" size="sm" variant="outline" onClick={() => applyPeriod(id)}>
              {label}
            </Button>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => { setFrom(''); setTo('') }}>
            Mọi lúc
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SearchableSelect
            label="Dòng dầu"
            value={lineId}
            onChange={setLineId}
            options={diesels.map((m) => ({
              value: m.id,
              label: m.name,
              hint: `Tồn ${formatNumber(m.stock)} ${m.unit}`,
            }))}
            placeholder="— Tất cả dòng —"
          />
          <Select label="Lọc theo" value={dateField} onChange={(e) => setDateField(e.target.value as 'createdAt' | 'pumpedAt')}>
            <option value="createdAt">Ngày hệ thống ghi</option>
            <option value="pumpedAt">Thời điểm đổ</option>
          </Select>
          <DateField label="Từ ngày" value={from} onChange={setFrom} allowEmpty />
          <DateField label="Đến ngày" value={to} onChange={setTo} allowEmpty />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatBig label="Đã đổ trong kỳ" value={`${formatNumber(periodQty)} L`} hint={`${filtered.length} lần`} tone="accent" />
          <StatBig label="Đã trừ kho" value={`${formatNumber(periodDeducted)} L`} hint="Không âm tồn" tone="ok" />
          <StatBig
            label={compareMat ? `Tồn ${compareMat.name}` : 'Tồn kho'}
            value={`${formatNumber(compareStock)} ${compareMat?.unit || 'L'}`}
            hint={periodQty > periodDeducted ? 'Có lần đổ lớn hơn tồn' : 'Đối chiếu số trừ'}
            tone={periodQty > periodDeducted ? 'warn' : 'default'}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">So sánh từng dòng với kho</p>
          {lineCompare.length === 0 ? (
            <Empty text="Chưa có vật liệu diesel." />
          ) : (
            lineCompare.map(({ m, pumped, deducted, warehouseOut, stock: st }) => (
              <div key={m.id} className="rounded-xl bg-surface/70 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{m.name}</span>
                  <span className="num font-bold">Tồn: {formatNumber(st)} {m.unit}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  <span>Kỳ đổ: {formatNumber(pumped)} {m.unit}</span>
                  <span className="text-ok">Trừ kho dầu: {formatNumber(deducted)}</span>
                  <span className="text-warn">Xuất kho mọi nguồn: {formatNumber(warehouseOut)}</span>
                  {Math.abs(warehouseOut - deducted) > 0.001 && (
                    <span className="text-muted">Chênh xuất khác (SX/bán): {formatNumber(warehouseOut - deducted)}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {filtered.length === 0 ? (
          <Empty text="Chưa có lần đổ dầu trong khoảng lọc." />
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => {
              const taken = Number(r.deductedQuantity ?? r.quantity) || 0
              const short = taken + 0.0001 < (Number(r.quantity) || 0)
              return (
                <div key={r.id} className="rounded-xl bg-surface/70 px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{r.materialName} · {formatNumber(r.quantity)} {r.unit}</p>
                      <p className="text-xs text-muted">
                        {r.code} · ghi {formatDateTime(r.createdAt)} · đổ {formatDate(r.pumpedAt)}
                        {' · '}{r.source === 'photo' ? 'Ảnh' : 'Nhập tay'}
                        {r.createdByName ? ` · ${r.createdByName}` : ''}
                        {short ? ` · trừ ${formatNumber(taken)} (thiếu tồn)` : ''}
                      </p>
                    </div>
                    {r.totalAmount ? <p className="num font-bold">{formatMoney(r.totalAmount)}</p> : null}
                  </div>
                  {r.photoKey && photoViewUrl(r.photoKey) && (
                    <a className="mt-1 inline-block text-xs text-accent" href={photoViewUrl(r.photoKey)} target="_blank" rel="noreferrer">
                      Xem ảnh
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
