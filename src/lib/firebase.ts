import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  signOut,
  type Auth,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

const REMEMBER_KEY = 'anphat_remember_login'

export function getRememberLogin(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== '0'
  } catch {
    return true
  }
}

export function setRememberLogin(remember: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Ghi nhớ đăng nhập (local) hoặc chỉ trong phiên (session) */
export async function applyAuthPersistence(remember: boolean) {
  setRememberLogin(remember)
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
}

/** Tạo Auth user mà không đăng xuất phiên hiện tại (app phụ) */
export async function createAuthUserSecondary(
  email: string,
  password: string,
): Promise<{ uid: string; email: string }> {
  let secondaryApp: FirebaseApp | null = null
  let secondaryAuth: Auth | null = null
  try {
    secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`)
    secondaryAuth = getAuth(secondaryApp)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    return { uid: cred.user.uid, email: cred.user.email || email }
  } finally {
    if (secondaryAuth) {
      try {
        await signOut(secondaryAuth)
      } catch {
        /* ignore */
      }
    }
    if (secondaryApp) {
      try {
        await deleteApp(secondaryApp)
      } catch {
        /* ignore */
      }
    }
  }
}

export async function sendUserPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email)
}

export async function updateCurrentUserPassword(newPassword: string) {
  if (!auth.currentUser) throw new Error('Chưa đăng nhập')
  await updatePassword(auth.currentUser, newPassword)
}
