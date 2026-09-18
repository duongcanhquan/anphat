const WORKER = (import.meta.env.VITE_PHOTO_WORKER_URL as string | undefined)?.replace(/\/$/, '') || ''

export function photoUploadEnabled(): boolean {
  return Boolean(WORKER)
}

export async function compressPumpPhoto(file: Blob, maxEdge = 1280, quality = 0.72): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Không nén được ảnh')
  ctx.drawImage(bitmap, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Không nén được ảnh')
  return blob
}

export async function uploadPumpPhoto(blob: Blob, idToken: string): Promise<{ key: string; url: string }> {
  if (!WORKER) throw new Error('Chưa cấu hình lưu ảnh R2 (VITE_PHOTO_WORKER_URL). Vẫn ghi số lít được.')
  const res = await fetch(`${WORKER}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'image/jpeg',
    },
    body: blob,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || 'Không tải ảnh lên được')
  }
  return res.json() as Promise<{ key: string; url: string }>
}

export function photoViewUrl(key: string): string {
  if (!WORKER || !key) return ''
  return `${WORKER}/p/${encodeURIComponent(key)}`
}
