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
} from '@/lib/store'
import type {
  AppUser,
  CompanySettings,
  Conversion,
  Customer,
  Formula,
  Material,
  UserRole,
  WeightUnit,
} from '@/types'
import {
  allWeightUnits,
  canDeleteMaterial,
  canManageUsers,
  canWrite,
  visibleUsersFor,
} from '@/types'
import { formatMoney, formatNumber } from '@/lib/utils'

type SettingsTab = 'users' | 'khach' | 'vat-lieu' | 'quy-doi' | 'thanh-pham'

export function SettingsPage() {
  const { profile, refreshProfile } = useAuth()
  const writable = canWrite(profile?.role)
  const manageUsers = canManageUsers(profile?.role)
  const [tab, setTab] = useState<SettingsTab>(manageUsers ? 'users' : 'khach')

  const [materials, setMaterials] = useState<Material[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [formulas, setFormulas] = useState<Formula[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [msg, setMsg] = useState('')

  const unitOptions = allWeightUnits(settings?.customUnits || [])

  useEffect(() => {
    const subs = [
      watchMaterials(setMaterials),
      watchConversions(setConversions),
      watchFormulas(setFormulas),
      watchCustomers(setCustomers),
      watchUsers(setUsers),
      watchSettings(setSettings),
    ]
    return () => subs.forEach((u) => u())
  }, [])

  const tabs = [
    ...(manageUsers ? [{ id: 'users', label: 'Tài khoản' }] : []),
    { id: 'khach', label: 'Khách hàng' },
    { id: 'vat-lieu', label: 'Vật liệu' },
    { id: 'quy-doi', label: 'Quy đổi' },
    { id: 'thanh-pham', label: 'Thành phẩm' },
  ]

  return (
    <div>
      <PageHeader title="Cài đặt" subtitle="Xây dựng hệ thống" />
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
        <CustomersTab customers={customers} writable={writable} profileId={profile?.id || ''} onMsg={setMsg} />
      )}
      {tab === 'vat-lieu' && (
        <MaterialsTab
          materials={materials}
          unitOptions={unitOptions}
          customUnits={settings?.customUnits || []}
          writable={writable}
          canDelete={canDeleteMaterial(profile?.role)}
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
      {tab === 'thanh-pham' && (
        <ProductsTab materials={materials} formulas={formulas} unitOptions={unitOptions} writable={writable} onMsg={setMsg} />
      )}
    </div>
  )
}

function MaterialsTab({
  materials,
  unitOptions,
  customUnits: _customUnits,
  writable,
  canDelete,
  onMsg,
}: {
  materials: Material[]
  unitOptions: string[]
  customUnits: string[]
  writable: boolean
  canDelete: boolean
  onMsg: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Material | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState<WeightUnit>('Tấn')
  const [lowStockAlert, setLowStockAlert] = useState('0')
  const [newUnit, setNewUnit] = useState('')

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
      {writable && (
        <Bento title="Đơn vị tính" subtitle="Tấn · Kg · Khối · Lít · Thùng · Bao (+ thêm tùy chỉnh)" className="mb-3">
          <div className="flex flex-wrap gap-2">
            {unitOptions.map((u) => (
              <Badge key={u} tone="accent">{u}</Badge>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input label="Thêm đơn vị" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="vd: Pallet" />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const u = newUnit.trim()
                if (!u) return
                const s = await getSettings()
                const list = [...new Set([...(s.customUnits || []), u])]
                await saveSettings({ ...DEFAULT_SETTINGS, ...s, customUnits: list })
                setNewUnit('')
                onMsg(`Đã thêm đơn vị "${u}"`)
              }}
            >
              Thêm đơn vị
            </Button>
          </div>
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
          <Select label="Vật liệu" value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
            <option value="">— Chọn —</option>
            {materials.filter((m) => m.active).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
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
