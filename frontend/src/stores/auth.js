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
    refreshToken.value = data.refreshToken || ''
    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    if (data.csrf_token) {
      localStorage.setItem('csrf_token', data.csrf_token)
    }
    if (data.refreshToken) {
      localStorage.setItem('refresh_token', data.refreshToken)
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

  function logout() {
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

  return { token, csrfToken, user, isAuthenticated, isAdmin, isTokenValid, setAuth, login, logout }
})
