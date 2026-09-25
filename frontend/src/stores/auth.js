import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// D3: tokens อยู่ใน httpOnly cookies แล้ว — storage เก็บแค่ csrf_token + user
const AUTH_STORAGE_KEYS = ['csrf_token', 'user']
// คีย์ยุค localStorage/session token — ลบทิ้งตอน load (migration ครั้งเดียว ไม่ย้ายค่า) + ตอน logout
const LEGACY_AUTH_STORAGE_KEYS = ['authToken', 'refreshToken', 'auth_token', 'refresh_token']

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

// D3: ลบ token keys ค้างจากยุค localStorage (migration ครั้งเดียว — ไม่ย้ายค่า)
function clearLegacyTokenKeys() {
  for (const storage of authStorages()) {
    for (const key of LEGACY_AUTH_STORAGE_KEYS) {
      storage.removeItem(key)
    }
  }
}

export const useAuthStore = defineStore('auth', () => {
  clearLegacyTokenKeys()
  const csrfToken = ref(readStoredString('csrf_token'))
  const user = ref(readStoredJson('user'))
  // D3: server-checked — true หลัง login/checkSession สำเร็จเท่านั้น (ไม่ decode JWT อีก)
  const isAuthenticated = ref(false)
  // sessionCheckPending: true ระหว่าง checkSession ครั้งแรก (main.js mount ทันทีไม่ block)
  // — ป้องกัน router guard redirect ไป /login ก่อน session ตอบ
  const sessionCheckPending = ref(true)

  // N4: effective permission grants ของ role ตัวเอง (จาก GET /settings/permissions/self)
  // — FE คำนวณปุ่มจาก matrix จริงรวม role_permission_overrides แทน hardcode role เทียบ
  // null = ยังไม่โหลด → fallback เทียบ role ขา intents เดิม (กันล็อก UI ตอน endpoint มีปัญหา)
  const permissionGrants = ref(null)

  const isSuperAdmin = computed(() => user.value?.role === 'superadmin')
  // N4: "admin" = สิทธิ์ delete อะไรได้ก็ได้ตาม matrix จริง (รวม override) —
  // grants ยังไม่โหลด → fallback เทียบ role ตาม intents เดิม (admin/superadmin)
  const isAdmin = computed(() => {
    if (isSuperAdmin.value) return true
    if (permissionGrants.value) {
      return (permissionGrants.value.delete || []).length > 0
    }
    return user.value?.role === 'admin' || user.value?.role === 'superadmin'
  })
  const mustChangePassword = computed(() => Boolean(user.value?.must_change_password))

  /**
   * ตรวจสิทธิ์จาก matrix จริง (รวม override) — fallback ไป intents เดิมเมื่อ grants ยังไม่โหลด
   * @param {string} action 'read'|'create'|'update'|'delete'
   * @param {string} resource resource key ตาม authzResources()
   */
  const can = computed(() => (action, resource) => {
    if (isSuperAdmin.value) return true
    if (permissionGrants.value) {
      return (permissionGrants.value[action] || []).includes(resource)
    }
    // fallback: intents เดิม — admin ได้ทุก action, operator อ่าน/สร้าง/แก้ไข
    if (isAdmin.value) return true
    if (action === 'read') return true
    if (action === 'delete') return false
    return user.value?.role === 'operator'
  })

  // session ปัจจุบันอยู่ storage ไหน — ใช้ตอน refresh (ไม่ส่ง remember มา) ให้คงที่เดิม
  function preferredStorage() {
    if (!localStorage.getItem('user') && sessionStorage.getItem('user')) {
      return sessionStorage
    }
    return localStorage
  }

  // remember=true → localStorage (อยู่รอดหลังปิดเบราว์เซอร์)
  // remember=false → sessionStorage (csrf/user หายเมื่อปิดแท็บ — อายุ cookies เป็น server TTL)
  // ไม่ระบุ (เช่นตอน refresh) → คง storage เดิมของ session
  function persistAuthStorage(remember) {
    const storage = remember === false
      ? sessionStorage
      : remember === true
        ? localStorage
        : preferredStorage()
    const other = storage === localStorage ? sessionStorage : localStorage

    storage.setItem('user', JSON.stringify(user.value))
    if (csrfToken.value) {
      storage.setItem('csrf_token', csrfToken.value)
    } else {
      storage.removeItem('csrf_token')
    }
    // เคลียร์อีกฝั่ง — กันคีย์ค้างสองที่ (hydrate อ่าน localStorage ก่อน)
    for (const key of AUTH_STORAGE_KEYS) other.removeItem(key)
  }

  function persistUserStorage() {
    preferredStorage().setItem('user', JSON.stringify(user.value))
  }

  // กัน response ข้าม session (refresh ชน login/logout) — bump ทุก setAuth/logout
  // (แยกจาก grantsGeneration: grants fetch ต้องรอด same-session setAuth — ดูเทส)
  let sessionGeneration = 0

  function setAuth(data, options = {}) {
    // D3: data.token/data.refresh_token (compat-keep จาก backend) ถูกเพิกเฉยโดยตั้งใจ —
    // session จริงอยู่ใน httpOnly cookies
    csrfToken.value = data.csrf_token || ''
    user.value = data.user
    isAuthenticated.value = true
    // N4: grants ผูกกับ token — ล้างค่าเก่ากัน role ค้าง (โหลดใหม่โดย router guard)
    // ไม่ยิง fetch ตรงนี้: setAuth ถูกเรียกใน contexts มากกว่า login (เช่น hydrate test)
    permissionGrants.value = null
    sessionGeneration++
    persistAuthStorage(options.remember)
  }

  // N4 — ดึง effective matrix ของตัวเอง (GET /settings/permissions/self)
  // ล้มเงียบได้: can() ยัง fallback เทียบ role ตาม intents เดิม
  // single-flight กัน guard ยิงซ้ำตอน grants==null (แบบเดียวกับ refreshPromise) —
  // assign ก่อน await ใด ๆ (dynamic import อยู่ข้างใน IIFE) ไม่งั้น concurrent calls หลุด guard พร้อมกัน
  let grantsPromise = null
  // กัน response ข้าม session — login/logout เพิ่มรุ่นแล้ว IIFE ทิ้งผลที่ไม่ตรงรุ่น
  let grantsGeneration = 0
  async function fetchPermissionGrants() {
    if (!isAuthenticated.value || isSuperAdmin.value) return
    if (grantsPromise) return grantsPromise
    const inflight = (async () => {
      try {
        const gen = grantsGeneration
        const { useApi } = await import('@/composables/useApi.js')
        const result = await useApi().get('/settings/permissions/self')
        if (gen !== grantsGeneration) return
        if (result?.data?.grants) {
          permissionGrants.value = result.data.grants
        }
      } catch {
        // ปล่อย null — fallback ทำงานแทน ไม่ล็อกผู้ใช้ออกจากหน้า
      } finally {
        if (grantsPromise === inflight) grantsPromise = null
      }
    })()
    grantsPromise = inflight
    return grantsPromise
  }

  // N44: default remember=false — csrf/user เก็บ sessionStorage ไม่ localStorage
  // ยกเว้นผู้ใช้ติ๊ก "จดจำฉัน" ที่ LoginPage ส่ง explicit
  async function login(credentials, { remember = false } = {}) {
    const { useApi } = await import('@/composables/useApi.js')
    const api = useApi()
    const data = await api.post('/auth/login', credentials)
    setAuth(data, { remember })
    grantsPromise = null
    grantsGeneration++
    return data
  }

  // D3: startup server check — GET /auth/me ตรง (raw fetch ไม่ผ่าน useApi เพื่อเลี่ยง
  // 401 interceptor: ไม่มี session ตอนเปิดเว็บครั้งแรกคือเรื่องปกติ ไม่ใช่ error —
  // ห้าม toast/redirect ตรงนี้; runtime หลัง login พึ่ง 401-hook เดิม)
  let sessionCheckPromise = null
  async function checkSession() {
    if (sessionCheckPromise) return sessionCheckPromise
    sessionCheckPromise = (async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || '/api'
        // timeout กันตาย: backend ดับต้องได้หน้า login ใน 10 วิ ไม่ใช่ค้างขาว (mount ถูกบล็อกอยู่)
        const response = await fetch(`${API_BASE}/auth/me`, {
          credentials: 'include',
          signal: AbortSignal.timeout(10000),
        })
        if (!response.ok) {
          isAuthenticated.value = false
          return false
        }
        const result = await response.json().catch(() => null)
        const me = result?.data || result
        if (!me || !me.id) {
          isAuthenticated.value = false
          return false
        }
        user.value = {
          id: me.id,
          username: me.username,
          name: me.name ?? me.full_name,
          full_name: me.full_name,
          email: me.email,
          role: me.role,
          must_change_password: Boolean(me.must_change_password),
        }
        isAuthenticated.value = true
        persistUserStorage()
        return true
      } catch {
        isAuthenticated.value = false
        return false
      } finally {
        sessionCheckPending.value = false
        sessionCheckPromise = null
      }
    })()
    return sessionCheckPromise
  }

  let refreshPromise = null

  // ต่ออายุ session ด้วย refresh cookie — single-flight กัน 401 หลายตัวยิงพร้อมกัน
  // ใช้ raw fetch (ไม่ผ่าน useApi) เพื่อเลี่ยง recursion กับ 401 interceptor
  async function refresh() {
    if (!isAuthenticated.value) {
      throw new Error('No active session')
    }
    if (refreshPromise) {
      return refreshPromise
    }

    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    const startedGeneration = sessionGeneration
    const staleRefreshError = () => Object.assign(new Error('เซสชันเปลี่ยนระหว่างต่ออายุโทเค็น'), { code: 'SESSION_CHANGED' })
    const flight = (async () => {
      // D3: ไม่ส่ง body — backend อ่าน refresh จาก httpOnly cookie
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error('Refresh failed')
      }
      const data = await response.json()
      if (sessionGeneration !== startedGeneration) throw staleRefreshError()
      setAuth(data)
      return data
    })()
    refreshPromise = flight.catch((e) => {
      if (e?.code !== 'SESSION_CHANGED' && sessionGeneration !== startedGeneration) throw staleRefreshError()
      throw e
    })

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
    // เพิกถอน refresh cookie ฝั่ง server แบบ best-effort (ไม่รอผล / ไม่โยน error)
    // — backend ล้าง cookies คู่ให้ด้วย; ข้ามเมื่อ logout อยู่แล้ว (กันยิงซ้ำจาก 401-hook)
    if (isAuthenticated.value) {
      const API_BASE = import.meta.env.VITE_API_URL || '/api'
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
      }).catch(() => {})
    }

    csrfToken.value = ''
    user.value = null
    isAuthenticated.value = false
    permissionGrants.value = null
    grantsPromise = null
    grantsGeneration++
    sessionGeneration++
    // เคลียร์ทั้งสอง storage — รวม legacy token keys (migration รอบสุดท้าย)
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of [...AUTH_STORAGE_KEYS, ...LEGACY_AUTH_STORAGE_KEYS]) {
        storage.removeItem(key)
      }
    }
  }

  return {
    csrfToken,
    user,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    mustChangePassword,
    can,
    permissionGrants,
    fetchPermissionGrants,
    setAuth,
    setMustChangePassword,
    login,
    checkSession,
    sessionCheckPending,
    refresh,
    changePassword,
    fetchMe,
    updateMe,
    logout,
  }
})
