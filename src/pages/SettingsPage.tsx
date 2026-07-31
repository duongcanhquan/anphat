import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Trash2, Upload } from 'lucide-react'
import { ProductsTab } from '@/pages/ProductsTab'
import {
  Badge,
  Bento,
  Button,
  Empty,
  Input,
  Modal,
  PageHeader,
  SearchableSelect,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import {
  bulkCreateCustomers,
  createConversion,
  createCustomer,
  createMaterial,
  createPayment,
  deleteConversion,
  deleteCustomer,
  deleteMaterial,
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  updateConversion,
  updateCustomer,
  updateMaterial,
  watchConversions,
  watchCustomers,
  watchFormulas,
  watchMaterials,
  watchSettings,
  watchUsers,
  watchOrders,
  watchAuditLogs,
  createAuditLog,
} from '@/lib/store'
import type {
  AppUser,
  AuditLog,
  CompanySettings,
  Conversion,
  Customer,
  Formula,
  Material,
  Order,
  UserRole,
  WeightUnit,
} from '@/types'
import {
  DEFAULT_WEIGHT_UNITS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  allWeightUnits,
  canDeleteMaterial,
  canManageUsers,
  canWrite,
  normalizeOrderStatus,
  visibleUsersFor,
  resolveOrderStatus,
} from '@/types'
import { cn, formatDateTime, formatMoney, formatNumber } from '@/lib/utils'

type SettingsTab = 'users' | 'khach' | 'vat-lieu' | 'quy-doi' | 'san-pham' | 'lich-su'

export function SettingsPage() {
  const { profile, refreshProfile } = useAuth()
  const writable = canWrite(profile?.role)
  const manageUsers = canManageUsers(profile?.role)
  const isSuper = profile?.role === 'superadmin'
  const [tab, setTab] = useState<SettingsTab>(manageUsers ? 'users' : 'khach')

  const [materials, setMaterials] = useState<Material[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [formulas, setFormulas] = useState<Formula[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [msg, setMsg] = useState('')

  const unitOptions = allWeightUnits(settings?.customUnits || [])

  useEffect(() => {
    const subs = [
      watchMaterials(setMaterials),
      watchConversions(setConversions),
      watchFormulas(setFormulas),
      watchCustomers(setCustomers),
      watchOrders(setOrders),
      watchUsers(setUsers),
      watchSettings(setSettings),
    ]
    if (isSuper) subs.push(watchAuditLogs(setAuditLogs))
    return () => subs.forEach((u) => u())
  }, [isSuper])

  const tabs = [
    ...(manageUsers ? [{ id: 'users', label: 'Tài khoản' }] : []),
    { id: 'khach', label: 'Khách hàng' },
    { id: 'vat-lieu', label: 'Vật liệu' },
    { id: 'quy-doi', label: 'Quy đổi' },
    { id: 'san-pham', label: 'Sản phẩm' },
    ...(isSuper ? [{ id: 'lich-su', label: 'Lịch sử' }] : []),
  ]

  return (
    <div>
      <PageHeader title="Cài đặt" />
      {!writable && (
        <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-warn">
          Bạn đang ở chế độ Viewer — chỉ xem, không chỉnh sửa.
        </div>
      )}
      <Tabs
        tabs={tabs}
        value={tab}
        onChange={(id) => setTab(id as SettingsTab)}
      />
      {msg && <p className="mb-3 text-sm font-medium text-info">{msg}</p>}

      {tab === 'users' && manageUsers && (
        <UsersTab
          users={users}
          currentId={profile?.id || ''}
          currentRole={profile?.role || 'viewer'}
          onMsg={setMsg}
          refreshProfile={refreshProfile}
        />
      )}
      {tab === 'khach' && (
        <CustomersTab
          customers={customers}
          orders={orders}
          writable={writable}
          profileId={profile?.id || ''}
          profileName={profile?.displayName || ''}
          onMsg={setMsg}
        />
      )}
      {tab === 'vat-lieu' && (
        <MaterialsTab
          materials={materials}
          unitOptions={unitOptions}
          customUnits={settings?.customUnits || []}
          writable={writable}
          canDelete={canDeleteMaterial(profile?.role)}
          profileId={profile?.id || ''}
          profileName={profile?.displayName || ''}
          onMsg={setMsg}
        />
      )}
      {tab === 'quy-doi' && (
        <ConversionsTab
          materials={materials}
          conversions={conversions}
          unitOptions={unitOptions}
          writable={writable}
          onMsg={setMsg}
        />
      )}
      {tab === 'san-pham' && (
        <ProductsTab
          materials={materials}
          formulas={formulas}
          conversions={conversions}
          unitOptions={unitOptions}
          writable={writable}
          onMsg={setMsg}
        />
      )}
      {tab === 'lich-su' && isSuper && <AuditHistoryTab logs={auditLogs} />}
    </div>
  )
}

function MaterialsTab({
  materials,
  unitOptions,
  customUnits,
  writable,
  canDelete,
  profileId,
  profileName,
  onMsg,
}: {
  materials: Material[]
  unitOptions: string[]
  customUnits: string[]
  writable: boolean
  canDelete: boolean
  profileId: string
  profileName: string
  onMsg: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Material | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState<WeightUnit>('Tấn')
  const [lowStockAlert, setLowStockAlert] = useState('0')
  const [newUnit, setNewUnit] = useState('')
  const [editUnitName, setEditUnitName] = useState('')
  const [editUnitValue, setEditUnitValue] = useState('')

  const openNew = () => {
    setEdit(null)
    setName('')
    setDescription('')
    setUnit('Tấn')
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

  const saveUnits = async (list: string[]) => {
    const s = await getSettings()
    await saveSettings({ ...DEFAULT_SETTINGS, ...s, customUnits: list })
  }

  const addCustomUnit = async () => {
    const u = newUnit.trim()
    if (!u) return
    if (unitOptions.includes(u)) {
      onMsg('Đơn vị đã tồn tại.')
      return
    }
    const list = [...new Set([...customUnits, u])]
    await saveUnits(list)
    await createAuditLog({
      entityType: 'unit',
      entityId: u,
      entityLabel: u,
      action: 'create',
      summary: `Thêm đơn vị "${u}"`,
      userId: profileId,
      userName: profileName,
      createdAt: Date.now(),
    })
    setNewUnit('')
    onMsg(`Đã thêm đơn vị "${u}"`)
  }

  const renameUnit = async () => {
    const from = editUnitName
    const to = editUnitValue.trim()
    if (!from || !to || from === to) return
    const isDefault = (DEFAULT_WEIGHT_UNITS as readonly string[]).includes(from)
    let list = [...customUnits]
    if (isDefault) {
      // Thêm tên mới vào custom, giữ default gốc trong danh sách hệ thống
      if (!list.includes(to)) list.push(to)
    } else {
      list = list.map((u) => (u === from ? to : u)).filter((u, i, a) => a.indexOf(u) === i)
    }
    await saveUnits(list)
    // Cập nhật vật liệu đang dùng đơn vị cũ
    for (const m of materials.filter((x) => x.unit === from)) {
      await updateMaterial(m.id, { unit: to })
    }
    await createAuditLog({
      entityType: 'unit',
      entityId: to,
      entityLabel: to,
      action: 'update',
      summary: `Đổi đơn vị "${from}" → "${to}"`,
      userId: profileId,
      userName: profileName,
      createdAt: Date.now(),
    })
    setEditUnitName('')
    setEditUnitValue('')
    onMsg(`Đã đổi đơn vị "${from}" → "${to}"`)
  }

  const removeUnit = async (u: string) => {
    if ((DEFAULT_WEIGHT_UNITS as readonly string[]).includes(u)) {
      onMsg('Không xoá được đơn vị mặc định. Có thể đổi tên bằng cách thêm đơn vị mới.')
      return
    }
    if (!confirm(`Bỏ đơn vị "${u}"?`)) return
    const list = customUnits.filter((x) => x !== u)
    await saveUnits(list)
    await createAuditLog({
      entityType: 'unit',
      entityId: u,
      entityLabel: u,
      action: 'delete',
      summary: `Bỏ đơn vị "${u}"`,
      userId: profileId,
      userName: profileName,
      createdAt: Date.now(),
    })
    onMsg(`Đã bỏ đơn vị "${u}"`)
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
      await createAuditLog({
        entityType: 'material',
        entityId: edit.id,
        entityLabel: name.trim(),
        action: 'update',
        summary: `Sửa vật liệu "${name.trim()}"`,
        userId: profileId,
        userName: profileName,
        createdAt: Date.now(),
      })
      onMsg('Đã cập nhật vật liệu.')
    } else {
      const id = await createMaterial({
        ...payload,
        stock: 0,
        avgCost: 0,
        active: true,
        createdAt: Date.now(),
      })
      await createAuditLog({
        entityType: 'material',
        entityId: id,
        entityLabel: name.trim(),
        action: 'create',
        summary: `Thêm vật liệu "${name.trim()}"`,
        userId: profileId,
        userName: profileName,
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
    await createAuditLog({
      entityType: 'material',
      entityId: m.id,
      entityLabel: m.name,
      action: 'delete',
      summary: `Xoá vật liệu "${m.name}"`,
      userId: profileId,
      userName: profileName,
      createdAt: Date.now(),
    })
    onMsg('Đã xoá vật liệu.')
  }

  return (
    <>
      {writable && (
        <Bento title="Đơn vị tính" subtitle="Thêm · sửa · bỏ đơn vị" className="mb-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {unitOptions.map((u) => {
              const isDefault = (DEFAULT_WEIGHT_UNITS as readonly string[]).includes(u)
              return (
                <div key={u} className="inline-flex items-center gap-1 rounded-xl bg-accent-soft px-2 py-1">
                  <Badge tone="accent">{u}</Badge>
                  <button type="button" className="text-xs font-semibold text-accent" onClick={() => { setEditUnitName(u); setEditUnitValue(u) }}>
                    Sửa
                  </button>
                  {!isDefault && (
                    <button type="button" className="text-xs text-danger" onClick={() => removeUnit(u)}>
                      Bỏ
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input label="Thêm đơn vị" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="vd: Pallet" />
            </div>
            <Button type="button" variant="outline" onClick={addCustomUnit}>Thêm đơn vị</Button>
          </div>
          {editUnitName && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl bg-surface/60 p-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input label={`Đổi tên "${editUnitName}"`} value={editUnitValue} onChange={(e) => setEditUnitValue(e.target.value)} />
              </div>
              <Button type="button" onClick={renameUnit}>Lưu tên</Button>
              <Button type="button" variant="ghost" onClick={() => setEditUnitName('')}>Huỷ</Button>
            </div>
          )}
        </Bento>
      )}
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
          <Select label="Đơn vị trọng lượng" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {unitOptions.map((u) => (
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
  unitOptions,
  writable,
  onMsg,
}: {
  materials: Material[]
  conversions: Conversion[]
  unitOptions: string[]
  writable: boolean
  onMsg: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Conversion | null>(null)
  const [materialId, setMaterialId] = useState('')
  const [fromUnit, setFromUnit] = useState<WeightUnit>('Khối')
  const [toUnit, setToUnit] = useState<WeightUnit>('Kg')
  const [factor, setFactor] = useState('1600')
  const [note, setNote] = useState('')

  const openNew = () => {
    setEdit(null)
    setMaterialId(materials[0]?.id || '')
    setFromUnit('Khối')
    setToUnit('Kg')
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
          <SearchableSelect
            label="Vật liệu"
            value={materialId}
            onChange={setMaterialId}
            options={materials
              .filter((m) => m.active)
              .map((m) => ({
                value: m.id,
                label: m.name,
                searchText: `${m.description || ''} ${m.unit}`,
                hint: m.unit,
              }))}
            placeholder="— Chọn vật liệu —"
            searchPlaceholder="Gõ tên vật liệu…"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Select label="Từ đơn vị" value={fromUnit} onChange={(e) => setFromUnit(e.target.value)}>
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
            <Select label="Sang đơn vị" value={toUnit} onChange={(e) => setToUnit(e.target.value)}>
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
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

function CustomersTab({
  customers,
  orders,
  writable,
  profileId,
  profileName,
  onMsg,
}: {
  customers: Customer[]
  orders: Order[]
  writable: boolean
  profileId: string
  profileName: string
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

  const customerStats = (c: Customer) => {
    const custOrders = orders.filter((o) => o.customerId === c.id && normalizeOrderStatus(o.status) !== 'huy')
    const latest = custOrders[0]
    return {
      debt: c.totalDebt || 0,
      sales: c.totalPurchased || 0,
      orderCount: custOrders.length,
      latestStatus: latest ? resolveOrderStatus(latest) : undefined,
    }
  }

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
      await createAuditLog({
        entityType: 'customer',
        entityId: edit.id,
        entityLabel: form.name,
        action: 'update',
        summary: `Sửa khách hàng "${form.name}"`,
        userId: profileId,
        userName: profileName,
        createdAt: Date.now(),
      })
      onMsg('Đã cập nhật khách hàng.')
    } else {
      const id = await createCustomer({
        ...form,
        totalDebt: 0,
        totalPurchased: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await createAuditLog({
        entityType: 'customer',
        entityId: id,
        entityLabel: form.name,
        action: 'create',
        summary: `Thêm khách hàng "${form.name}"`,
        userId: profileId,
        userName: profileName,
        createdAt: Date.now(),
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
        {customers.map((c) => {
          const stats = customerStats(c)
          return (
          <Bento key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display font-bold">{c.name}</p>
                <p className="text-xs text-muted">MST: {c.taxCode || '—'} · {c.representative || '—'}</p>
                <p className="text-xs text-muted">{c.address}</p>
                <p className="text-xs text-muted">{c.phone} {c.email}</p>
                {c.note && <p className="mt-1 text-xs text-muted">Ghi chú: {c.note}</p>}
              </div>
              <div className="text-right space-y-1">
                <div>
                  <p className="text-xs text-muted">Công nợ</p>
                  <p className="num font-bold text-warn">{formatMoney(stats.debt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Doanh số</p>
                  <p className="num font-semibold text-accent">{formatMoney(stats.sales)}</p>
                </div>
                <p className="text-xs text-muted">{stats.orderCount} đơn</p>
                {stats.latestStatus && (
                  <span className={cn('inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold', ORDER_STATUS_COLORS[stats.latestStatus].bg, ORDER_STATUS_COLORS[stats.latestStatus].text)}>
                    {ORDER_STATUS_LABELS[stats.latestStatus]}
                  </span>
                )}
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
                    await createAuditLog({
                      entityType: 'customer',
                      entityId: c.id,
                      entityLabel: c.name,
                      action: 'delete',
                      summary: `Xoá khách hàng "${c.name}"`,
                      userId: profileId,
                      userName: profileName,
                      createdAt: Date.now(),
                    })
                    onMsg('Đã xoá khách hàng.')
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </Bento>
          )
        })}
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

function UsersTab({
  users,
  currentId,
  currentRole,
  onMsg,
  refreshProfile,
}: {
  users: AppUser[]
  currentId: string
  currentRole: UserRole
  onMsg: (s: string) => void
  refreshProfile: () => Promise<void>
}) {
  const {
    createManagedUser,
    updateManagedUser,
    resetManagedUserPassword,
    changeOwnPassword,
    removeManagedUser,
  } = useAuth()
  const isSuper = currentRole === 'superadmin'
  const visible = visibleUsersFor(currentRole, users, currentId)
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<AppUser | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('admin')
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  const filtered = visible.filter((u) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return u.displayName.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
  })

  const openNew = () => {
    setEdit(null)
    setDisplayName('')
    setEmail('')
    setPassword('')
    setRole('admin')
    setActive(true)
    setOpen(true)
  }

  const openEdit = (u: AppUser) => {
    setEdit(u)
    setDisplayName(u.displayName)
    setEmail(u.email)
    setPassword('')
    setRole(u.role)
    setActive(u.active)
    setOpen(true)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (edit) {
        await updateManagedUser(edit, {
          displayName: displayName.trim(),
          role: isSuper ? role : 'admin',
          active,
        })
        if (password.trim()) {
          if (edit.id === currentId) {
            await changeOwnPassword(password.trim())
            onMsg('Đã cập nhật tài khoản và mật khẩu của bạn.')
          } else {
            await resetManagedUserPassword(edit.email)
            onMsg('Đã cập nhật tài khoản. Đã gửi email đặt lại mật khẩu (Firebase không cho đổi mật khẩu user khác từ client).')
          }
        } else {
          onMsg(`Đã cập nhật tài khoản ${displayName}.`)
        }
        await refreshProfile()
      } else {
        if (!password.trim() || password.trim().length < 6) {
          onMsg('Mật khẩu cần ít nhất 6 ký tự.')
          setBusy(false)
          return
        }
        await createManagedUser({
          email: email.trim(),
          password: password.trim(),
          displayName: displayName.trim(),
          role: isSuper ? role : 'admin',
        })
        onMsg(`Đã tạo tài khoản ${email.trim()}.`)
      }
      setOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi lưu tài khoản'
      if (msg.includes('auth/email-already-in-use')) onMsg('Email đã tồn tại.')
      else if (msg.includes('auth/weak-password')) onMsg('Mật khẩu quá yếu (tối thiểu 6 ký tự).')
      else onMsg(msg)
    } finally {
      setBusy(false)
    }
  }

  const roleOptions: UserRole[] = isSuper
    ? ['superadmin', 'admin', 'viewer']
    : ['admin']

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={openNew}>
          <Plus size={16} /> Thêm Admin
        </Button>
      </div>

      <div className="mb-3">
        <Input
          label="Tìm tài khoản"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tên hoặc email…"
        />
      </div>

      <Bento title="Tài khoản" subtitle={`Tối đa 10 người · hiện ${users.length}/10 · đang hiện ${filtered.length}`}>
        <div className="space-y-2">
          {filtered.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface/70 px-3 py-3">
              <div>
                <p className="font-semibold">
                  {u.displayName}{' '}
                  {u.id === currentId && <span className="text-xs text-muted">(bạn)</span>}
                </p>
                <p className="text-xs text-muted">{u.email}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone={u.role === 'superadmin' ? 'accent' : u.role === 'admin' ? 'ok' : 'warn'}>
                    {u.role}
                  </Badge>
                  {!u.active && <Badge tone="danger">Ngưng</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                  Sửa
                </Button>
                {u.id !== currentId && (isSuper || u.role === 'admin') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Xoá hồ sơ "${u.displayName}"? (Auth Firebase cần Console nếu muốn xoá hẳn đăng nhập)`)) return
                      try {
                        await removeManagedUser(u)
                        onMsg('Đã xoá tài khoản khỏi hệ thống.')
                      } catch (err) {
                        onMsg(err instanceof Error ? err.message : 'Không xoá được')
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <Empty text="Không có tài khoản phù hợp." />}
        </div>
      </Bento>

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Sửa tài khoản' : 'Tạo Admin / tài khoản'}>
        <form className="space-y-3" onSubmit={save}>
          <Input
            label="Họ tên"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={!!edit}
          />
          <Input
            label={edit ? (edit.id === currentId ? 'Mật khẩu mới' : 'Mật khẩu mới (gửi email đặt lại nếu điền)') : 'Mật khẩu'}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!edit}
            minLength={edit ? undefined : 6}
            placeholder={edit ? 'Để trống nếu giữ nguyên' : 'Tối thiểu 6 ký tự'}
          />
          {isSuper && (
            <Select label="Vai trò" value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={edit?.id === currentId}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          )}
          {edit && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={edit.id === currentId} />
              Tài khoản đang hoạt động
            </label>
          )}
          {edit && edit.id !== currentId && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await resetManagedUserPassword(edit.email)
                  onMsg(`Đã gửi email đặt lại mật khẩu tới ${edit.email}`)
                } catch (err) {
                  onMsg(err instanceof Error ? err.message : 'Không gửi được email')
                }
              }}
            >
              Gửi email đặt lại mật khẩu
            </Button>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu tài khoản'}
          </Button>
        </form>
      </Modal>
    </>
  )
}

function AuditHistoryTab({ logs }: { logs: AuditLog[] }) {
  return (
    <Bento title="Lịch sử chỉnh sửa" subtitle="Chỉ Superadmin xem được mọi thay đổi của Admin">
      {logs.length === 0 ? (
        <Empty text="Chưa có lịch sử chỉnh sửa." />
      ) : (
        <div className="space-y-2">
          {logs.slice(0, 100).map((log) => (
            <div key={log.id} className="rounded-xl bg-surface/70 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{log.summary}</p>
                <Badge tone={log.action === 'delete' ? 'danger' : log.action === 'create' ? 'ok' : 'info'}>
                  {log.action}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                {formatDateTime(log.createdAt)} · {log.userName} · {log.entityType}
              </p>
            </div>
          ))}
        </div>
      )}
    </Bento>
  )
}
