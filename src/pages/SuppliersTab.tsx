import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Bento, Button, Empty, Input, Modal, Textarea } from '@/components/ui'
import { MoneyInput } from '@/components/MoneyInput'
import { createAuditLog, createSupplier, deleteSupplier, updateSupplier } from '@/lib/store'
import type { PurchaseOrder, Supplier } from '@/types'
import { formatMoney } from '@/lib/utils'

export function SuppliersTab({
  suppliers,
  purchaseOrders,
  writable,
  profileId,
  profileName,
  onMsg,
}: {
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrder[]
  writable: boolean
  profileId: string
  profileName: string
  onMsg: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Supplier | null>(null)
  const [form, setForm] = useState({
    name: '',
    taxCode: '',
    address: '',
    phone: '',
    email: '',
    note: '',
  })
  const [openingDebt, setOpeningDebt] = useState(0)

  const openNew = () => {
    setEdit(null)
    setForm({ name: '', taxCode: '', address: '', phone: '', email: '', note: '' })
    setOpeningDebt(0)
    setOpen(true)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!writable) return
    const now = Date.now()
    if (edit) {
      const posted = purchaseOrders.some(
        (o) => o.supplierId === edit.id && (o.status === 'open' || o.status === 'closed'),
      )
      const canEditOpening = !posted
      await updateSupplier(edit.id, {
        ...form,
        ...(canEditOpening
          ? { openingDebt, openingAt: edit.openingAt || now, totalDebt: openingDebt }
          : {}),
      })
      await createAuditLog({
        entityType: 'supplier',
        entityId: edit.id,
        entityLabel: form.name,
        action: 'update',
        summary: `Sửa NCC "${form.name}"`,
        userId: profileId,
        userName: profileName,
        createdAt: now,
      })
      onMsg('Đã cập nhật nhà cung cấp.')
    } else {
      const id = await createSupplier({
        ...form,
        openingDebt,
        openingAt: now,
        pendingCarry: 0,
        totalDebt: openingDebt,
        totalPurchased: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      await createAuditLog({
        entityType: 'supplier',
        entityId: id,
        entityLabel: form.name,
        action: 'create',
        summary: `Thêm NCC "${form.name}"`,
        userId: profileId,
        userName: profileName,
        createdAt: now,
      })
      onMsg('Đã thêm nhà cung cấp.')
    }
    setOpen(false)
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        {writable && (
          <Button onClick={openNew}>
            <Plus size={16} /> Thêm nhà cung cấp
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {suppliers.map((s) => (
          <Bento key={s.id}>
            <p className="font-display font-bold">{s.name}</p>
            <p className="text-xs text-muted">{s.taxCode || '—'} · {s.phone || '—'}</p>
            <p className="mt-2 text-sm">Nợ: <strong className="num text-warn">{formatMoney(s.totalDebt || 0)}</strong></p>
            {(s.pendingCarry || 0) !== 0 && (
              <p className="text-xs text-accent">Số dư chờ đơn sau: {formatMoney(s.pendingCarry)}</p>
            )}
            {writable && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEdit(s)
                    setForm({
                      name: s.name,
                      taxCode: s.taxCode,
                      address: s.address,
                      phone: s.phone,
                      email: s.email,
                      note: s.note,
                    })
                    setOpeningDebt(s.openingDebt || 0)
                    setOpen(true)
                  }}
                >
                  Sửa
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (purchaseOrders.some((o) => o.supplierId === s.id)) {
                      onMsg('Còn đơn mua — không xoá NCC được.')
                      return
                    }
                    if (!confirm(`Xoá "${s.name}"?`)) return
                    await deleteSupplier(s.id)
                    onMsg('Đã xoá nhà cung cấp.')
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </Bento>
        ))}
      </div>
      {suppliers.length === 0 && <Empty text="Chưa có nhà cung cấp." />}

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}>
        <form className="space-y-3" onSubmit={save}>
          <Input label="Tên" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="MST" value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} />
          <Input label="Địa chỉ" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label="Điện thoại" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <MoneyInput label="Nợ cũ (trước khi dùng app)" value={openingDebt} onChange={setOpeningDebt} />
          <Textarea label="Ghi chú" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Button type="submit" className="w-full">Lưu</Button>
        </form>
      </Modal>
    </>
  )
}
