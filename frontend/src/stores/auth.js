import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// คีย์ที่ persist ทั้งสอง storage — remember=true → localStorage, remember=false → sessionStorage
const AUTH_STORAGE_KEYS = ['auth_token', 'refresh_token', 'csrf_token', 'user']
// คียยุคเก่าที่เคยใช้ — เคลียร์ตอน logout ด้วย
const LEGACY_AUTH_STORAGE_KEYS = ['authToken', 'refreshToken']

// hydrate จาก localStorage ก่อน แล้ว fallback ไป sessionStorage — session แบบ
// "ไม่จดจำฉัน" (remember=false) ถูกเก็บไว้ใน sessionStorage เท่านั้น
function* authStorages() {
  yield localStorage
  yield sessionStorage
}

function readStoredString(key) {
  for (const storage of authStorages()) {
    const value = storage.getItem(key)
    if (value === null) continue
    if (value === 'undefined' || value === 'null') {
      storage.removeItem(key)
      return ''
    }
    return value
  }

  return ''
}

function readStoredJson(key, fallback = null) {
  for (const storage of authStorages()) {
    const value = storage.getItem(key)
    if (value === null) continue

    if (value === 'undefined' || value === 'null') {
      storage.removeItem(key)
      return fallback
    }

    try {
      return JSON.parse(value)
    } catch {
      storage.removeItem(key)
      return fallback
    }
  }

  return fallback
}

// token segment เป็น base64url ('-' / '_') และไม่มี padding '=' — normalize เป็น base64
// ก่อน atob ไม่งั้น payload ที่มีตัวอักษร url-safe ทำให้ atob พัง → isTokenValid false
// → ระบบ logout เองทั้งที่ token ยังใช้ได้
export function decodeJwtPayload(segment) {
  const base64 = segment
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(segment.length + (4 - (segment.length % 4)) % 4, '=')
  return JSON.parse(atob(base64))
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(readStoredString('auth_token'))
  const refreshToken = ref(readStoredString('refresh_token'))
  const csrfToken = ref(readStoredString('csrf_token'))
  const user = ref(readStoredJson('user'))

  const isAuthenticated = computed(() => !!token.value && isTokenValid())
  const isSuperAdmin = computed(() => user.value?.role === 'superadmin')
  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'superadmin')
  const mustChangePassword = computed(() => Boolean(user.value?.must_change_password))

  function isTokenValid() {
    if (!token.value) return false
    try {
      const payload = decodeJwtPayload(token.value.split('.')[1])
      return payload.exp * 1000 > Date.now()
    } catch {
      return false
    }
  }

  // session ปัจจุบันอยู่ storage ไหน — ใช้ตอน refresh (ไม่ส่ง remember มา) ให้คงที่เดิม
  function preferredStorage() {
    if (!localStorage.getItem('auth_token') && sessionStorage.getItem('auth_token')) {
      return sessionStorage
    }
    return localStorage
  }

  // remember=true → localStorage (อยู่รอดหลังปิดเบราว์เซอร์)
  // remember=false → sessionStorage (ปิดเบราว์เซอร์แล้ว session จบ)
  // ไม่ระบุ (เช่นตอน refresh) → คง storage เดิมของ session
  function persistAuthStorage(remember) {
    const storage = remember === false
      ? sessionStorage
      : remember === true
        ? localStorage
        : preferredStorage()
    const other = storage === localStorage ? sessionStorage : localStorage

    storage.setItem('auth_token', token.value)
    storage.setItem('user', JSON.stringify(user.value))
    if (csrfToken.value) {
      storage.setItem('csrf_token', csrfToken.value)
    } else {
      storage.removeItem('csrf_token')
    }
    if (refreshToken.value) {
      storage.setItem('refresh_token', refreshToken.value)
    } else {
      storage.removeItem('refresh_token')
    }
    // เคลียร์อีกฝั่ง — กันคีย์ค้างสองที่ (hydrate อ่าน localStorage ก่อน)
    for (const key of AUTH_STORAGE_KEYS) other.removeItem(key)
  }

  function persistUserStorage() {
    preferredStorage().setItem('user', JSON.stringify(user.value))
  }

  function setAuth(data, options = {}) {
    token.value = data.token
    csrfToken.value = data.csrf_token || ''
    user.value = data.user
    refreshToken.value = data.refresh_token || ''
    persistAuthStorage(options.remember)
  }

  async function login(credentials, { remember = true } = {}) {
    const { useApi } = await import('@/composables/useApi.js')
    const api = useApi()
    const data = await api.post('/auth/login', credentials)
    setAuth(data, { remember })
    return data
  }

  let refreshPromise = null

  // ต่ออายุ access token ด้วย refresh token — single-flight กัน 401 หลายตัวยิงพร้อมกัน
  // ใช้ raw fetch (ไม่ผ่าน useApi) เพื่อเลี่ยง recursion กับ 401 interceptor
  async function refresh() {
    if (!refreshToken.value) {
      throw new Error('No refresh token')
    }
    if (refreshPromise) {
      return refreshPromise
    }

    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    refreshPromise = (async () => {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken.value }),
      })
      if (!response.ok) {
        throw new Error('Refresh failed')
      }
      const data = await response.json()
      setAuth(data)
      return data
    })()

    try {
      return await refreshPromise
    } finally {
      refreshPromise = null
    }
  }

  function setMustChangePassword(required) {
    if (!user.value) return
    user.value = { ...user.value, must_change_password: Boolean(required) }
    persistUserStorage()
  }

  async function changePassword(currentPassword, newPassword) {
    const { useApi } = await import('@/composables/useApi.js')
    const api = useApi()
    const data = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    setMustChangePassword(false)
    return data
  }

  async function fetchMe() {
    const { useApi } = await import('@/composables/useApi.js')
    const api = useApi()
    const result = await api.get('/auth/me')
    const me = result.data || result
    if (user.value) {
      user.value = {
        ...user.value,
        id: me.id ?? user.value.id,
        username: me.username ?? user.value.username,
        name: me.name ?? me.full_name ?? user.value.name,
        email: me.email ?? user.value.email,
        role: me.role ?? user.value.role,
        must_change_password: Boolean(me.must_change_password),
      }
      persistUserStorage()
    }
    return me
  }

  async function updateMe(payload) {
    const { useApi } = await import('@/composables/useApi.js')
    const api = useApi()
    const result = await api.put('/auth/me', payload)
    const me = result.data || result
    if (user.value) {
      user.value = {
        ...user.value,
        id: me.id ?? user.value.id,
        username: me.username ?? user.value.username,
        name: me.name ?? me.full_name ?? user.value.name,
        email: me.email ?? user.value.email,
        role: me.role ?? user.value.role,
      }
      persistUserStorage()
    }
    return me
  }

  function logout() {
    // เพิกถอน refresh token ฝั่ง server แบบ best-effort (ไม่รอผล / ไม่โยน error)
    if (refreshToken.value) {
      const API_BASE = import.meta.env.VITE_API_URL || '/api'
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken.value }),
        keepalive: true,
      }).catch(() => {})
    }

    token.value = ''
    refreshToken.value = ''
    csrfToken.value = ''
    user.value = null
    // เคลียร์ทั้งสอง storage — session อาจถูก persist แบบ remember หรือไม่ก็ได้
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of [...AUTH_STORAGE_KEYS, ...LEGACY_AUTH_STORAGE_KEYS]) {
        storage.removeItem(key)
      }
    }
  }

  return {
    token,
    refreshToken,
    csrfToken,
    user,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    mustChangePassword,
    isTokenValid,
    setAuth,
    setMustChangePassword,
    login,
    refresh,
    changePassword,
    fetchMe,
    updateMe,
    logout,
  }
})
