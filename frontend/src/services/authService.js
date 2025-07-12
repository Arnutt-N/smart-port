// Authentication Service with JWT support
export class AuthService {
  constructor() {
    this.token = null
    this.refreshToken = null
    this.user = null
    this.apiService = null
  }

  init(apiService) {
    this.apiService = apiService
    this.loadTokensFromStorage()
  }

  async login(credentials) {
    try {
      const response = await this.apiService.post('/login', credentials)
      
      if (response.data.token) {
        this.setTokens(response.data.token, response.data.refreshToken)
        this.user = response.data.user
        this.saveTokensToStorage()
        return this.user
      }
      
      throw new Error('Invalid response format')
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    }
  }

  logout() {
    this.token = null
    this.refreshToken = null
    this.user = null
    this.clearTokensFromStorage()
  }

  getToken() {
    return this.token
  }

  setTokens(token, refreshToken = null) {
    this.token = token
    this.refreshToken = refreshToken
  }

  isTokenValid() {
    if (!this.token) return false
    
    try {
      // Handle demo tokens
      if (this.token.startsWith('demo-token-')) {
        return true
      }
      
      // Handle real JWT tokens
      const payload = this.parseJWT(this.token)
      const currentTime = Date.now() / 1000
      return payload.exp > currentTime
    } catch {
      return false
    }
  }

  parseJWT(token) {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    }).join(''))
    
    return JSON.parse(jsonPayload)
  }

  saveTokensToStorage() {
    if (this.token) {
      localStorage.setItem('auth_token', this.token)
    }
    if (this.refreshToken) {
      localStorage.setItem('refresh_token', this.refreshToken)
    }
  }

  loadTokensFromStorage() {
    this.token = localStorage.getItem('authToken') || localStorage.getItem('auth_token')
    this.refreshToken = localStorage.getItem('refreshToken') || localStorage.getItem('refresh_token')
    
    // Also load user data
    const userData = localStorage.getItem('user')
    if (userData) {
      try {
        this.user = JSON.parse(userData)
      } catch (error) {
        console.error('Error parsing user data:', error)
      }
    }
  }

  clearTokensFromStorage() {
    localStorage.removeItem('authToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
  }

  async getCurrentUser() {
    if (!this.isTokenValid()) {
      throw new Error('Invalid token')
    }

    try {
      const response = await this.apiService.get('/user/profile')
      this.user = response.data
      return this.user
    } catch (error) {
      console.error('Failed to get current user:', error)
      throw error
    }
  }

  async refreshTokens() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const response = await this.apiService.post('/auth/refresh', {
        refreshToken: this.refreshToken
      })
      
      this.setTokens(response.data.token, response.data.refreshToken)
      this.saveTokensToStorage()
      
      return this.token
    } catch (error) {
      this.logout()
      throw error
    }
  }
}
