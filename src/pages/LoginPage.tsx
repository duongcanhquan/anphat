import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Logo } from '@/components/Logo'
import { FirestoreSetupHelp, isPermissionError } from '@/components/FirestoreSetupHelp'
import { Button, Input } from '@/components/ui'
import { getRememberLogin } from '@/lib/firebase'

export function LoginPage() {
  const { login, register, firebaseUser, profile, loading, authError, logout } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [remember, setRemember] = useState(() => getRememberLogin())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Chỉ vào app khi đã có hồ sơ — tránh vòng lặp redirect nếu Firestore lỗi
  if (!loading && firebaseUser && profile) return <Navigate to="/" replace />

  const showPermissionHelp = isPermissionError(error) || isPermissionError(authError)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') await login(email.trim(), password, remember)
      else await register(email.trim(), password, name.trim() || 'Người dùng', remember)
      navigate('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đăng nhập'
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        setError('Email hoặc mật khẩu không đúng.')
      } else if (msg.includes('auth/email-already-in-use')) {
        setError('Email đã được sử dụng. Hãy Đăng nhập, hoặc Publish Firestore Rules rồi thử lại.')
      } else if (msg.includes('auth/weak-password')) {
        setError('Mật khẩu cần ít nhất 6 ký tự.')
      } else if (msg.includes('auth/operation-not-allowed')) {
        setError(
          'Chưa bật đăng nhập Email/Password trên Firebase. Vào Console → Authentication → Sign-in method → Email/Password.',
        )
      } else if (msg.includes('insufficient permissions') || msg.includes('permission-denied')) {
        setError('Missing or insufficient permissions.')
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-x-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-ink/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#1a1510 1px, transparent 1px), linear-gradient(90deg, #1a1510 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <form onSubmit={onSubmit} className="bento space-y-4 p-6 sm:p-8">
          <div>
            <h1 className="font-display text-2xl font-extrabold">
              {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Quản lý nhà máy Asphalt An Phát — rõ ràng, nhanh trên điện thoại.
            </p>
          </div>

          {mode === 'register' && (
            <Input label="Họ tên" value={name} onChange={(e) => setName(e.target.value)} required />
          )}
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Mật khẩu"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Ghi nhớ đăng nhập
          </label>

          {showPermissionHelp ? (
            <div className="space-y-2">
              <FirestoreSetupHelp />
              {firebaseUser && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    await logout()
                    setError('')
                  }}
                >
                  Đăng xuất và thử lại
                </Button>
              )}
            </div>
          ) : (
            (error || authError) && (
              <div className="space-y-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">
                <p>{error || authError}</p>
                {firebaseUser && !profile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      await logout()
                      setError('')
                    }}
                  >
                    Đăng xuất và thử lại
                  </Button>
                )}
              </div>
            )
          )}

          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Vào hệ thống' : 'Đăng ký'}
          </Button>

          <button
            type="button"
            className="w-full text-center text-sm font-medium text-accent"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError('')
            }}
          >
            {mode === 'login'
              ? 'Chưa có tài khoản? Đăng ký (tài khoản đầu = Superadmin)'
              : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
