import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Trash2, Upload } from 'lucide-react'
import {
  Badge,
  Bento,
  Button,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import {
  bulkCreateCustomers,
  createConversion,
  createCustomer,
  createFormula,
  createMaterial,
  createPayment,
  DEFAULT_SETTINGS,
  deleteConversion,
  deleteCustomer,
  deleteFormula,
  deleteMaterial,
  saveSettings,
  updateConversion,
  updateCustomer,
  updateFormula,
  updateMaterial,
  upsertUser,
  watchConversions,
  watchCustomers,
  watchFormulas,
  watchMaterials,
  watchSettings,
  watchUsers,
} from '@/lib/store'
import type {
  AppUser,
  CompanySettings,
  Conversion,
  Customer,
  Formula,
  FormulaItem,
  Material,
  UserRole,
  WeightUnit,
} from '@/types'
import {
  WEIGHT_UNITS,
  canDeleteMaterial,
  canWrite,
} from '@/types'
import { formatMoney, formatNumber, uid } from '@/lib/utils'

type SettingsTab =
  | 'vat-lieu'
  | 'quy-doi'
  | 'cong-thuc'
  | 'khach'
  | 'khac'
  | 'users'

export function SettingsPage() {
  const { profile, refreshProfile } = useAuth()
  const writable = canWrite(profile?.role)
  const isSuper = profile?.role === 'superadmin'
  const [tab, setTab] = useState<SettingsTab>('vat-lieu')

  const [materials, setMaterials] = useState<Material[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [formulas, setFormulas] = useState<Formula[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS)
  const [users, setUsers] = useState<AppUser[]>([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const subs = [
      watchMaterials(setMaterials),
      watchConversions(setConversions),
      watchFormulas(setFormulas),
      watchCustomers(setCustomers),
      watchSettings(setSettings),
      watchUsers(setUsers),
    ]
    return () => subs.forEach((u) => u())
  }, [])

  return (
    <div>
      <PageHeader title="Cài đặt" subtitle="Vật liệu · Quy đổi · Công thức · Khách · Hệ thống" />
      {!writable && (
        <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-warn">
          Bạn đang ở chế độ Viewer — chỉ xem, không chỉnh sửa.
        </div>
      )}
      <Tabs
        tabs={[
          { id: 'vat-lieu', label: 'Vật liệu' },
          { id: 'quy-doi', label: 'Quy đổi' },
          { id: 'cong-thuc', label: 'Công thức' },
          { id: 'khach', label: 'Khách hàng' },
          { id: 'khac', label: 'Khác' },
          ...(isSuper ? [{ id: 'users', label: 'Tài khoản' }] : []),
        ]}
        value={tab}
        onChange={(id) => setTab(id as SettingsTab)}
      />
      {msg && <p className="mb-3 text-sm font-medium text-info">{msg}</p>}

      {tab === 'vat-lieu' && (
        <MaterialsTab
          materials={materials}
          writable={writable}
          canDelete={canDeleteMaterial(profile?.role)}
          onMsg={setMsg}
        />
      )}
      {tab === 'quy-doi' && (
        <ConversionsTab
          materials={materials}
          conversions={conversions}
          writable={writable}
          onMsg={setMsg}
        />
      )}
      {tab === 'cong-thuc' && (
        <FormulasTab materials={materials} formulas={formulas} writable={writable} onMsg={setMsg} />
      )}
      {tab === 'khach' && (
        <CustomersTab customers={customers} writable={writable} profileId={profile?.id || ''} onMsg={setMsg} />
      )}
      {tab === 'khac' && (
        <OtherTab settings={settings} writable={writable} onMsg={setMsg} />
      )}
      {tab === 'users' && isSuper && (
        <UsersTab users={users} currentId={profile?.id || ''} onMsg={setMsg} refreshProfile={refreshProfile} />
      )}
    </div>
  )
}

function MaterialsTab({
  materials,
  writable,
  canDelete,
  onMsg,
}: {
  materials: Material[]
  writable: boolean
  canDelete: boolean
  onMsg: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Material | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState<WeightUnit>('TẤN')
  const [lowStockAlert, setLowStockAlert] = useState('0')

  const openNew = () => {
    setEdit(null)
    setName('')
    setDescription('')
    setUnit('TẤN')
    setLowStockAlert('0')
    setOpen(true)
  }

  const openEdit = (m: Material) => {
    setEdit(m)
    setName(m.name)
    setDescription(m.description)
    setUnit(m.unit)
    setLowStockAlert(String(m.lowStockAlert))
    setOpen(true)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable) return
    const payload = {
      name: name.trim(),
      description: description.trim(),
      unit,
      lowStockAlert: Number(lowStockAlert) || 0,
      updatedAt: Date.now(),
    }
    if (edit) {
      await updateMaterial(edit.id, payload)
      onMsg('Đã cập nhật vật liệu.')
    } else {
      await createMaterial({
        ...payload,
        stock: 0,
        avgCost: 0,
        active: true,
        createdAt: Date.now(),
      })
      onMsg('Đã thêm vật liệu.')
    }
    setOpen(false)
  }

  const remove = async (m: Material) => {
    if (!canDelete) {
      onMsg('Chỉ Superadmin được xoá vật liệu (ảnh hưởng đơn/công thức).')
      return
    }
    if (!confirm(`Xoá vật liệu "${m.name}"? Hành động này có thể ảnh hưởng dữ liệu liên quan.`)) return
    await deleteMaterial(m.id)
    onMsg('Đã xoá vật liệu.')
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        {writable && (
          <Button onClick={openNew}>
            <Plus size={16} /> Thêm vật liệu
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {materials.map((m) => (
          <Bento key={m.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-bold">{m.name}</p>
                <p className="text-xs text-muted">{m.description || '—'}</p>
              </div>
              <Badge tone="accent">{m.unit}</Badge>
            </div>
            <p className="mt-3 text-sm">
              Tồn: <strong className="num">{formatNumber(m.stock)}</strong> · Cảnh báo ≤{' '}
              <strong className="num">{formatNumber(m.lowStockAlert)}</strong>
            </p>
            {writable && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(m)}>
                  Sửa
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(m)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </Bento>
        ))}
      </div>
      {materials.length === 0 && <Empty text="Chưa có vật liệu nhập." />}

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Sửa vật liệu' : 'Thêm vật liệu'}>
        <form className="space-y-3" onSubmit={save}>
          <Input label="Tên vật liệu" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Select label="Đơn vị trọng lượng" value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)}>
            {WEIGHT_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
          <Input
            label="Cảnh báo tồn thấp"
            type="number"
            step="any"
            value={lowStockAlert}
            onChange={(e) => setLowStockAlert(e.target.value)}
          />
          <Button type="submit" className="w-full">Lưu</Button>
        </form>
      </Modal>
    </>
  )
}

function ConversionsTab({
  materials,
  conversions,
  writable,
  onMsg,
}: {
  materials: Material[]
  conversions: Conversion[]
  writable: boolean
  onMsg: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Conversion | null>(null)
  const [materialId, setMaterialId] = useState('')
  const [fromUnit, setFromUnit] = useState<WeightUnit>('m3')
  const [toUnit, setToUnit] = useState<WeightUnit>('KG')
  const [factor, setFactor] = useState('1600')
  const [note, setNote] = useState('')

  const openNew = () => {
    setEdit(null)
    setMaterialId(materials[0]?.id || '')
    setFromUnit('m3')
    setToUnit('KG')
    setFactor('1600')
    setNote('')
    setOpen(true)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable) return
    const mat = materials.find((m) => m.id === materialId)
    if (!mat) return
    const data = {
      materialId,
      materialName: mat.name,
      fromUnit,
      toUnit,
      factor: Number(factor) || 0,
      note,
      createdAt: Date.now(),
    }
    if (edit) {
      await updateConversion(edit.id, data)
      onMsg('Đã cập nhật quy đổi.')
    } else {
      await createConversion(data)
      onMsg('Đã thêm quy đổi.')
    }
    setOpen(false)
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        {writable && (
          <Button onClick={openNew}>
            <Plus size={16} /> Thêm quy đổi
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {conversions.map((c) => (
          <Bento key={c.id}>
            <p className="font-semibold">{c.materialName}</p>
            <p className="num mt-1 text-lg font-bold">
              1 {c.fromUnit} = {formatNumber(c.factor)} {c.toUnit}
            </p>
            {c.note && <p className="text-xs text-muted">{c.note}</p>}
            {writable && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEdit(c)
                    setMaterialId(c.materialId)
                    setFromUnit(c.fromUnit)
                    setToUnit(c.toUnit)
                    setFactor(String(c.factor))
                    setNote(c.note)
                    setOpen(true)
                  }}
                >
                  Sửa
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm('Xoá quy đổi này?')) return
                    await deleteConversion(c.id)
                    onMsg('Đã xoá quy đổi.')
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </Bento>
        ))}
        {conversions.length === 0 && <Empty text="Chưa có quy đổi. Ví dụ: 1 m³ đá mạt = 1600 KG." />}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Sửa quy đổi' : 'Thêm quy đổi'}>
        <form className="space-y-3" onSubmit={save}>
          <Select label="Vật liệu" value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
            <option value="">— Chọn —</option>
            {materials.filter((m) => m.active).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select label="Từ đơn vị" value={fromUnit} onChange={(e) => setFromUnit(e.target.value as WeightUnit)}>
              {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
            <Select label="Sang đơn vị" value={toUnit} onChange={(e) => setToUnit(e.target.value as WeightUnit)}>
              {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
          <Input label="Hệ số (1 từ = ? sang)" type="number" step="any" value={factor} onChange={(e) => setFactor(e.target.value)} required />
          <Textarea label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" className="w-full">Lưu</Button>
        </form>
      </Modal>
    </>
  )
}

function FormulasTab({
  materials,
  formulas,
  writable,
  onMsg,
}: {
  materials: Material[]
  formulas: Formula[]
  writable: boolean
  onMsg: (s: string) => void
}) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Formula | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState<WeightUnit>('TẤN')
  const [unitPrice, setUnitPrice] = useState('0')
  const [items, setItems] = useState<FormulaItem[]>([])

  const openNew = () => {
    setEdit(null)
    setName('')
    setDescription('')
    setUnit('TẤN')
    setUnitPrice('0')
    setItems([])
    setOpen(true)
  }

  const addItem = () => {
    const mat = materials.find((m) => m.active)
    if (!mat) return
    setItems((p) => [
      ...p,
      { materialId: mat.id, materialName: mat.name, quantityPerUnit: 0, unit: mat.unit },
    ])
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable) return
    const data = {
      name: name.trim(),
      description: description.trim(),
      unit,
      unitPrice: Number(unitPrice) || 0,
      items,
      updatedAt: Date.now(),
    }
    if (edit) {
      const changed =
        JSON.stringify(edit.items) !== JSON.stringify(items)
      const history = [...(edit.history || [])]
      if (changed) {
        history.push({
          id: uid(),
          label: `Trước khi sửa ${new Date().toLocaleString('vi-VN')}`,
          items: edit.items,
          createdAt: Date.now(),
          createdBy: profile?.id || '',
        })
      }
      await updateFormula(edit.id, { ...data, history })
      onMsg('Đã cập nhật công thức.')
    } else {
      await createFormula({
        ...data,
        history: [],
        active: true,
        createdAt: Date.now(),
      })
      onMsg('Đã tạo công thức thành phẩm.')
    }
    setOpen(false)
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        {writable && (
          <Button onClick={openNew}>
            <Plus size={16} /> Thêm công thức
          </Button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {formulas.map((f) => (
          <Bento key={f.id} title={f.name} subtitle={f.description || `${formatMoney(f.unitPrice)} / ${f.unit}`}>
            <div className="space-y-1">
              {f.items.map((i) => (
                <div key={i.materialId + i.materialName} className="flex justify-between text-sm">
                  <span>{i.materialName}</span>
                  <span className="num font-semibold">
                    {formatNumber(i.quantityPerUnit)} {i.unit}
                  </span>
                </div>
              ))}
              {f.items.length === 0 && <p className="text-sm text-muted">Chưa gắn vật liệu (trừ kho thủ công).</p>}
            </div>
            {f.history?.length > 0 && (
              <p className="mt-2 text-xs text-muted">{f.history.length} bản tỷ lệ trong lý lịch</p>
            )}
            {writable && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEdit(f)
                    setName(f.name)
                    setDescription(f.description)
                    setUnit(f.unit)
                    setUnitPrice(String(f.unitPrice))
                    setItems(f.items.map((i) => ({ ...i })))
                    setOpen(true)
                  }}
                >
                  Sửa
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Xoá công thức ${f.name}?`)) return
                    await deleteFormula(f.id)
                    onMsg('Đã xoá công thức.')
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </Bento>
        ))}
      </div>
      {formulas.length === 0 && <Empty text="Tạo công thức thành phẩm (vd: bê tông nhựa C13)." />}

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Sửa công thức' : 'Thêm công thức'} wide>
        <form className="space-y-3" onSubmit={save}>
          <Input label="Tên thành phẩm" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea label="Mô tả / ghi chú công thức" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Select label="Đơn vị thành phẩm" value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)}>
              {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
            <Input label="Đơn giá mặc định" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Nguyên liệu (số lượng / 1 đơn vị thành phẩm)</p>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus size={14} /> Thêm
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_80px_36px] gap-2">
                  <Select
                    value={item.materialId}
                    onChange={(e) => {
                      const mat = materials.find((m) => m.id === e.target.value)
                      if (!mat) return
                      const next = [...items]
                      next[idx] = {
                        materialId: mat.id,
                        materialName: mat.name,
                        quantityPerUnit: item.quantityPerUnit,
                        unit: mat.unit,
                      }
                      setItems(next)
                    }}
                  >
                    {materials.filter((m) => m.active).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    step="any"
                    value={item.quantityPerUnit}
                    onChange={(e) => {
                      const next = [...items]
                      next[idx] = { ...item, quantityPerUnit: Number(e.target.value) || 0 }
                      setItems(next)
                    }}
                  />
                  <Select
                    value={item.unit}
                    onChange={(e) => {
                      const next = [...items]
                      next[idx] = { ...item, unit: e.target.value as WeightUnit }
                      setItems(next)
                    }}
                  >
                    {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Select>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full">Lưu công thức</Button>
        </form>
      </Modal>
    </>
  )
}

function CustomersTab({
  customers,
  writable,
  profileId,
  onMsg,
}: {
  customers: Customer[]
  writable: boolean
  profileId: string
  onMsg: (s: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [payOpen, setPayOpen] = useState<Customer | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [edit, setEdit] = useState<Customer | null>(null)
  const [form, setForm] = useState({
    name: '',
    taxCode: '',
    address: '',
    representative: '',
    phone: '',
    email: '',
    note: '',
  })

  const openNew = () => {
    setEdit(null)
    setForm({ name: '', taxCode: '', address: '', representative: '', phone: '', email: '', note: '' })
    setOpen(true)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable) return
    if (edit) {
      await updateCustomer(edit.id, { ...form, updatedAt: Date.now() })
      onMsg('Đã cập nhật khách hàng.')
    } else {
      await createCustomer({
        ...form,
        totalDebt: 0,
        totalPurchased: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      onMsg('Đã thêm khách hàng.')
    }
    setOpen(false)
  }

  const importExcel = async (file: File) => {
    if (!writable) return
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)
    const mapped = rows
      .map((r) => ({
        name: String(r['Tên'] || r['ten'] || r['name'] || '').trim(),
        taxCode: String(r['MST'] || r['mst'] || r['taxCode'] || '').trim(),
        address: String(r['Địa chỉ'] || r['dia chi'] || r['address'] || '').trim(),
        representative: String(r['Người đại diện'] || r['dai dien'] || r['representative'] || '').trim(),
        phone: String(r['SĐT'] || r['sdt'] || r['phone'] || '').trim(),
        email: String(r['Email'] || r['email'] || '').trim(),
        note: String(r['Ghi chú'] || r['note'] || '').trim(),
        totalDebt: 0,
        totalPurchased: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))
      .filter((r) => r.name)
    if (mapped.length === 0) {
      onMsg('Không đọc được dòng khách nào. Cần cột: Tên, MST, Địa chỉ, Người đại diện, SĐT, Email, Ghi chú.')
      return
    }
    await bulkCreateCustomers(mapped)
    onMsg(`Đã nhập ${mapped.length} khách hàng từ Excel.`)
  }

  const savePay = async (e: FormEvent) => {
    e.preventDefault()
    if (!payOpen || !writable) return
    const amount = Number(payAmount) || 0
    if (amount <= 0) return
    await createPayment({
      customerId: payOpen.id,
      customerName: payOpen.name,
      amount,
      note: payNote,
      createdAt: Date.now(),
      createdBy: profileId,
    })
    onMsg('Đã ghi nhận thanh toán / giảm công nợ.')
    setPayOpen(null)
    setPayAmount('')
    setPayNote('')
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        {writable && (
          <>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Import Excel
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importExcel(f)
                e.target.value = ''
              }}
            />
            <Button onClick={openNew}>
              <Plus size={16} /> Thêm khách
            </Button>
          </>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">
        File Excel cột: <strong>Tên, MST, Địa chỉ, Người đại diện, SĐT, Email, Ghi chú</strong>
      </p>
      <div className="space-y-2">
        {customers.map((c) => (
          <Bento key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display font-bold">{c.name}</p>
                <p className="text-xs text-muted">MST: {c.taxCode || '—'} · {c.representative || '—'}</p>
                <p className="text-xs text-muted">{c.address}</p>
                <p className="text-xs text-muted">{c.phone} {c.email}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">Công nợ</p>
                <p className="num font-bold text-warn">{formatMoney(c.totalDebt || 0)}</p>
              </div>
            </div>
            {writable && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEdit(c)
                    setForm({
                      name: c.name,
                      taxCode: c.taxCode,
                      address: c.address,
                      representative: c.representative,
                      phone: c.phone,
                      email: c.email,
                      note: c.note,
                    })
                    setOpen(true)
                  }}
                >
                  Sửa
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPayOpen(c)}>
                  Ghi thanh toán
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Xoá khách ${c.name}?`)) return
                    await deleteCustomer(c.id)
                    onMsg('Đã xoá khách hàng.')
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </Bento>
        ))}
        {customers.length === 0 && <Empty text="Chưa có khách hàng." />}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Sửa khách hàng' : 'Thêm khách hàng'} wide>
        <form className="space-y-3" onSubmit={save}>
          <Input label="Tên công ty / khách" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Mã số thuế" value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} />
            <Input label="Người đứng đầu / đại diện" value={form.representative} onChange={(e) => setForm({ ...form, representative: e.target.value })} />
            <Input label="Số điện thoại" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <Textarea label="Địa chỉ" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea label="Ghi chú" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Button type="submit" className="w-full">Lưu</Button>
        </form>
      </Modal>

      <Modal open={!!payOpen} onClose={() => setPayOpen(null)} title={`Ghi thanh toán — ${payOpen?.name || ''}`}>
        <form className="space-y-3" onSubmit={savePay}>
          <Input label="Số tiền" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
          <Textarea label="Ghi chú" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          <Button type="submit" className="w-full">Lưu thanh toán</Button>
        </form>
      </Modal>
    </>
  )
}

function OtherTab({
  settings,
  writable,
  onMsg,
}: {
  settings: CompanySettings
  writable: boolean
  onMsg: (s: string) => void
}) {
  const [form, setForm] = useState(settings)
  useEffect(() => setForm(settings), [settings])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable) return
    await saveSettings(form)
    onMsg('Đã lưu thông tin công ty & kết nối n8n.')
  }

  return (
    <Bento title="Thông tin công ty & tích hợp" subtitle="Dùng khi xuất hợp đồng qua n8n">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
        <Input label="Tên công ty" value={form.name} disabled={!writable} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Mã số thuế" value={form.taxCode} disabled={!writable} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} />
        <Input label="Người đại diện" value={form.representative} disabled={!writable} onChange={(e) => setForm({ ...form, representative: e.target.value })} />
        <Input label="Điện thoại" value={form.phone} disabled={!writable} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input label="Email" value={form.email} disabled={!writable} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Số tài khoản" value={form.bankAccount} disabled={!writable} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
        <Input label="Ngân hàng" value={form.bankName} disabled={!writable} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
        <div className="sm:col-span-2">
          <Textarea label="Địa chỉ" value={form.address} disabled={!writable} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="sm:col-span-2 rounded-2xl border border-dashed border-line bg-surface/50 p-4">
          <p className="font-semibold">Kết nối n8n (xuất hợp đồng)</p>
          <p className="mb-3 text-xs text-muted">Điền webhook URL. Khi bấm Xuất hợp đồng, app gửi JSON đơn + thông tin công ty.</p>
          <Input
            label="Webhook URL"
            value={form.n8nWebhookUrl}
            disabled={!writable}
            placeholder="https://.../webhook/..."
            onChange={(e) => setForm({ ...form, n8nWebhookUrl: e.target.value })}
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.n8nEnabled}
              disabled={!writable}
              onChange={(e) => setForm({ ...form, n8nEnabled: e.target.checked })}
            />
            Bật gửi hợp đồng qua n8n
          </label>
        </div>
        {writable && (
          <div className="sm:col-span-2">
            <Button type="submit" className="w-full sm:w-auto">Lưu cài đặt</Button>
          </div>
        )}
      </form>
    </Bento>
  )
}

function UsersTab({
  users,
  currentId,
  onMsg,
  refreshProfile,
}: {
  users: AppUser[]
  currentId: string
  onMsg: (s: string) => void
  refreshProfile: () => Promise<void>
}) {
  const changeRole = async (u: AppUser, role: UserRole) => {
    await upsertUser({ ...u, role })
    if (u.id === currentId) await refreshProfile()
    onMsg(`Đã đổi quyền ${u.displayName} → ${role}`)
  }

  return (
    <Bento title="Tài khoản" subtitle={`Tối đa 10 người · hiện ${users.length}/10`}>
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface/70 px-3 py-3">
            <div>
              <p className="font-semibold">{u.displayName}</p>
              <p className="text-xs text-muted">{u.email}</p>
            </div>
            <Select
              value={u.role}
              disabled={u.id === currentId}
              onChange={(e) => changeRole(u, e.target.value as UserRole)}
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </Select>
          </div>
        ))}
      </div>
    </Bento>
  )
}
