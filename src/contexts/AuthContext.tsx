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
import {
  applyAuthPersistence,
  auth,
  createAuthUserSecondary,
  getRememberLogin,
  sendUserPasswordReset,
  updateCurrentUserPassword,
} from '@/lib/firebase'
import { deleteUserDoc, getUser, listUsers, upsertUser } from '@/lib/store'
import type { AppUser, UserRole } from '@/types'

interface CreateManagedUserInput {
  email: string
  password: string
  displayName: string
  role: UserRole
}

interface AuthState {
  firebaseUser: User | null
  profile: AppUser | null
  loading: boolean
  authError: string | null
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  register: (email: string, password: string, name: string, remember?: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  createManagedUser: (input: CreateManagedUserInput) => Promise<AppUser>
  updateManagedUser: (
    user: AppUser,
    patch: Partial<Pick<AppUser, 'displayName' | 'role' | 'active'>>,
  ) => Promise<void>
  resetManagedUserPassword: (email: string) => Promise<void>
  changeOwnPassword: (newPassword: string) => Promise<void>
  removeManagedUser: (user: AppUser) => Promise<void>
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
    // Áp dụng persistence đã lưu (mặc định ghi nhớ đăng nhập)
    void applyAuthPersistence(getRememberLogin()).catch(() => undefined)

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

  const login = async (email: string, password: string, remember = true) => {
    await applyAuthPersistence(remember)
    await signInWithEmailAndPassword(auth, email, password)
  }

  const register = async (email: string, password: string, name: string, remember = true) => {
    await applyAuthPersistence(remember)
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

  const createManagedUser = async (input: CreateManagedUserInput): Promise<AppUser> => {
    if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
      throw new Error('Không có quyền tạo tài khoản.')
    }
    if (profile.role === 'admin' && input.role !== 'admin') {
      throw new Error('Admin chỉ được tạo tài khoản Admin dưới mình.')
    }
    const existing = await listUsers()
    if (existing.length >= 10) {
      throw new Error('Đã đạt giới hạn 10 tài khoản.')
    }
    const { uid, email } = await createAuthUserSecondary(input.email.trim(), input.password)
    const user: AppUser = {
      id: uid,
      email,
      displayName: input.displayName.trim() || email.split('@')[0],
      role: input.role,
      active: true,
      createdAt: Date.now(),
      createdBy: profile.id,
    }
    await upsertUser(user)
    return user
  }

  const updateManagedUser = async (
    user: AppUser,
    patch: Partial<Pick<AppUser, 'displayName' | 'role' | 'active'>>,
  ) => {
    if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
      throw new Error('Không có quyền sửa tài khoản.')
    }
    if (profile.role === 'admin') {
      if (user.role === 'viewer' || user.role === 'superadmin') {
        throw new Error('Admin không được sửa Viewer / Superadmin.')
      }
      if (patch.role && patch.role !== 'admin') {
        throw new Error('Admin chỉ quản lý tài khoản Admin.')
      }
    }
    await upsertUser({ ...user, ...patch })
    if (user.id === profile.id) await refreshProfile()
  }

  const resetManagedUserPassword = async (email: string) => {
    await sendUserPasswordReset(email)
  }

  const changeOwnPassword = async (newPassword: string) => {
    await updateCurrentUserPassword(newPassword)
  }

  const removeManagedUser = async (user: AppUser) => {
    if (!profile) throw new Error('Chưa đăng nhập')
    if (user.id === profile.id) throw new Error('Không thể xoá chính mình.')
    if (profile.role === 'superadmin') {
      await deleteUserDoc(user.id)
      return
    }
    if (profile.role === 'admin') {
      if (user.role !== 'admin') throw new Error('Admin chỉ xoá được tài khoản Admin dưới mình.')
      await deleteUserDoc(user.id)
      return
    }
    throw new Error('Không có quyền xoá tài khoản.')
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
        createManagedUser,
        updateManagedUser,
        resetManagedUserPassword,
        changeOwnPassword,
        removeManagedUser,
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
