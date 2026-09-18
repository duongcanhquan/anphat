export interface Env {
  PHOTOS: R2Bucket
  FIREBASE_PROJECT_ID: string
  FIREBASE_WEB_API_KEY?: string
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function verifyFirebase(token: string, env: Env): Promise<boolean> {
  if (!token) return false
  if (env.FIREBASE_WEB_API_KEY) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      },
    )
    return res.ok
  }
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''))
    const exp = Number(payload.exp) || 0
    const aud = String(payload.aud || '')
    return exp * 1000 > Date.now() && aud === env.FIREBASE_PROJECT_ID
  } catch {
    return false
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    const url = new URL(req.url)

    if (req.method === 'POST' && url.pathname === '/upload') {
      const auth = req.headers.get('Authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!(await verifyFirebase(token, env))) return json({ error: 'Unauthorized' }, 401)
      const body = await req.arrayBuffer()
      if (body.byteLength < 100 || body.byteLength > 2_000_000) {
        return json({ error: 'Ảnh không hợp lệ (nén JPEG < 2MB)' }, 400)
      }
      const day = new Date().toISOString().slice(0, 10)
      const id = crypto.randomUUID()
      const key = `fuel/${day}/${id}.jpg`
      await env.PHOTOS.put(key, body, { httpMetadata: { contentType: 'image/jpeg' } })
      return json({ key, url: `${url.origin}/p/${encodeURIComponent(key)}` })
    }

    if (req.method === 'GET' && url.pathname.startsWith('/p/')) {
      const key = decodeURIComponent(url.pathname.slice(3))
      const obj = await env.PHOTOS.get(key)
      if (!obj) return new Response('Not found', { status: 404, headers: CORS })
      const headers = new Headers(CORS)
      headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg')
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      return new Response(obj.body, { headers })
    }

    return json({ ok: true, service: 'anphat-photos' })
  },
}
