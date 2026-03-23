import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('auth_token') || '')
  const refreshToken = ref(localStorage.getItem('refresh_token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAuthenticated = computed(() => !!token.value && isTokenValid())

  function isTokenValid() {
    if (!token.value) return false
    if (token.value.startsWith('demo-token-')) return true
    try {
      const payload = JSON.parse(atob(token.value.split('.')[1]))
      return payload.exp * 1000 > Date.now()
    } catch {
      return false
    }
  }

  function setAuth(data) {
    token.value = data.token
    user.value = data.user
    if (data.refreshToken) refreshToken.value = data.refreshToken
    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken)
  }

  async function login(credentials) {
    const { useApi } = await import('@/composables/useApi.js')
    const api = useApi()
    const data = await api.post('/auth/login', credentials)
    setAuth(data)
    return data
  }

  async function demoLogin() {
    await login({ email: 'admin', password: 'admin123' })
  }

  function logout() {
    token.value = ''
    refreshToken.value = ''
    user.value = null
    localStorage.removeItem('auth_token')
    localStorage.removeItem('authToken')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
  }

  return { token, user, isAuthenticated, isTokenValid, setAuth, login, demoLogin, logout }
})
