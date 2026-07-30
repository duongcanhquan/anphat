import { useState } from 'react'
import { Button } from './ui'

const TEMP_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`

export function FirestoreSetupHelp({ detail }: { detail?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TEMP_RULES)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-danger/30 bg-red-50 px-4 py-3 text-left text-sm text-ink">
      <p className="font-semibold text-danger">Firestore chưa mở quyền ghi dữ liệu</p>
      <p className="text-muted">
        Đăng nhập Auth thành công, nhưng chưa Publish Rules nên app không tạo được hồ sơ / không vào được trang chủ.
        {detail ? ` (${detail})` : ''}
      </p>
      <ol className="list-decimal space-y-1 pl-4 text-ink-soft">
        <li>
          Mở{' '}
          <a
            className="font-semibold text-accent underline"
            href="https://console.firebase.google.com/project/asphalt-b1181/firestore/rules"
            target="_blank"
            rel="noreferrer"
          >
            Firebase → Firestore → Rules
          </a>
        </li>
        <li>Dán rules tạm thời bên dưới → bấm <strong>Publish</strong></li>
        <li>Quay lại đây → Đăng xuất → Đăng nhập / Đăng ký lại</li>
      </ol>
      <pre className="max-h-40 overflow-auto rounded-xl bg-ink p-3 text-[11px] leading-relaxed text-surface">
        {TEMP_RULES}
      </pre>
      <Button type="button" size="sm" variant="secondary" onClick={copy}>
        {copied ? 'Đã copy!' : 'Copy rules tạm thời'}
      </Button>
      <p className="text-xs text-muted">
        Sau khi chạy ổn, thay bằng file <code>firestore.rules</code> trong repo (phân quyền Superadmin/Admin/Viewer).
      </p>
    </div>
  )
}

export function isPermissionError(msg: string | null | undefined): boolean {
  if (!msg) return false
  return (
    msg.includes('insufficient permissions') ||
    msg.includes('permission-denied') ||
    msg.includes('Firestore từ chối')
  )
}
