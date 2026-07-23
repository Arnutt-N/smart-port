import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

function readStoredString(key) {
  const value = localStorage.getItem(key)
  if (!value || value === 'undefined' || value === 'null') {
    localStorage.removeItem(key)
    return ''
  }

  return value
}

function readStoredJson(key, fallback = null) {
  const value = localStorage.getItem(key)

  if (!value || value === 'undefined' || value === 'null') {
    localStorage.removeItem(key)
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    localStorage.removeItem(key)
    return fallback
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(readStoredString('auth_token'))
  const refreshToken = ref(readStoredString('refresh_token'))
  const csrfToken = ref(readStoredString('csrf_token'))
  const user = ref(readStoredJson('user'))

  const isAuthenticated = computed(() => !!token.value && isTokenValid())
  const isAdmin = computed(() => user.value?.role === 'admin')
  const mustChangePassword = computed(() => Boolean(user.value?.must_change_password))

  function isTokenValid() {
    if (!token.value) return false
    try {
      const payload = JSON.parse(atob(token.value.split('.')[1]))
      return payload.exp * 1000 > Date.now()
    } catch {
      return false
    }
  }

  function setAuth(data) {
    token.value = data.token
    csrfToken.value = data.csrf_token || ''
    user.value = data.user
    refreshToken.value = data.refresh_token || ''
    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    if (data.csrf_token) {
      localStorage.setItem('csrf_token', data.csrf_token)
    } else {
      localStorage.removeItem('csrf_token')
    }
    if (data.refresh_token) {
      localStorage.setItem('refresh_token', data.refresh_token)
    } else {
      localStorage.removeItem('refresh_token')
    }
  }

  async function login(credentials) {
    const { useApi } = await import('@/composables/useApi.js')
    const api = useApi()
    const data = await api.post('/auth/login', credentials)
    setAuth(data)
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
    localStorage.setItem('user', JSON.stringify(user.value))
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
    localStorage.removeItem('auth_token')
    localStorage.removeItem('authToken')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('csrf_token')
    localStorage.removeItem('user')
  }

  return {
    token,
    refreshToken,
    csrfToken,
    user,
    isAuthenticated,
    isAdmin,
    mustChangePassword,
    isTokenValid,
    setAuth,
    setMustChangePassword,
    login,
    refresh,
    changePassword,
    logout,
  }
})
