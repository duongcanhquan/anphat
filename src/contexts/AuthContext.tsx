import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { getUser, listUsers, upsertUser } from '@/lib/store'
import type { AppUser, UserRole } from '@/types'

interface AuthState {
  firebaseUser: User | null
  profile: AppUser | null
  loading: boolean
  authError: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function friendlyAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
    return 'Firestore từ chối quyền. Hãy deploy file firestore.rules trên Firebase Console.'
  }
  if (msg.includes('auth/')) return msg
  return msg || 'Lỗi xác thực / kết nối Firebase.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const loadProfile = async (user: User) => {
    let p = await getUser(user.uid)
    if (!p) {
      const existing = await listUsers()
      const role: UserRole = existing.length === 0 ? 'superadmin' : 'viewer'
      p = {
        id: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'Người dùng',
        role,
        active: true,
        createdAt: Date.now(),
      }
      await upsertUser(p)
    }
    setProfile(p)
    setAuthError(null)
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        try {
          await loadProfile(user)
        } catch (e) {
          console.error(e)
          setProfile(null)
          setAuthError(friendlyAuthError(e))
        }
      } else {
        setProfile(null)
        setAuthError(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const register = async (email: string, password: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    const existing = await listUsers()
    if (existing.length >= 10) {
      await cred.user.delete()
      throw new Error('Đã đạt giới hạn 10 tài khoản. Liên hệ Superadmin.')
    }
    const role: UserRole = existing.length === 0 ? 'superadmin' : 'viewer'
    await upsertUser({
      id: cred.user.uid,
      email,
      displayName: name,
      role,
      active: true,
      createdAt: Date.now(),
    })
  }

  const logout = async () => {
    await signOut(auth)
  }

  const refreshProfile = async () => {
    if (firebaseUser) await loadProfile(firebaseUser)
  }

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        authError,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải dùng trong AuthProvider')
  return ctx
}
